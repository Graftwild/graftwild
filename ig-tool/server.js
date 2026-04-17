require('dotenv').config();
const express   = require('express');
const multer    = require('multer');
const ffmpeg    = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const { exec }  = require('child_process');
const fs   = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk').default;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Whisper binary — resolved once at startup so the route doesn't shell-search every call
const WHISPER_BIN = (() => {
  const candidates = [
    'whisper',
    '/Library/Frameworks/Python.framework/Versions/3.11/bin/whisper',
    '/usr/local/bin/whisper',
    '/opt/homebrew/bin/whisper',
  ];
  const { execSync } = require('child_process');
  for (const c of candidates) {
    try { execSync(`${c} --version`, { stdio: 'ignore' }); return c; } catch {}
  }
  return null;
})();

ffmpeg.setFfmpegPath(ffmpegPath);

// ─── Directories ────────────────────────────────────────────────────────────
const TEMP_DIR          = path.join(__dirname, 'temp');
const STYLE_PROFILE_DIR = path.join(__dirname, 'style-profiles');
[TEMP_DIR, STYLE_PROFILE_DIR].forEach(d => fs.mkdirSync(d, { recursive: true }));

// ─── Multer config ───────────────────────────────────────────────────────────
const ALLOWED_EXTS = new Set(['.mp4', '.mov', '.m4v']);

const upload = multer({
  dest: TEMP_DIR,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB
  fileFilter(_req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_EXTS.has(ext)) return cb(null, true);
    cb(new Error(`Unsupported file type: ${ext}. Allowed: .mp4 .mov .m4v`));
  },
});

// ─── App ─────────────────────────────────────────────────────────────────────
const app  = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());

// ─── CORS — allow dashboard (file:// or any origin) to reach the API ─────────
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ─── Existing routes live below this line — do not modify ────────────────────
// (none yet — future routes go here)

// ─── POST /analyze-video ──────────────────────────────────────────────────────
app.post('/analyze-video', upload.single('video'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No video file uploaded.' });
  }

  const baseName  = path.parse(req.file.originalname).name.replace(/[^a-z0-9_-]/gi, '_');
  const outputDir = path.join(TEMP_DIR, baseName);
  fs.mkdirSync(outputDir, { recursive: true });

  const inputPath  = req.file.path;
  const audioFile  = `${baseName}_audio.wav`;
  const audioPath  = path.join(outputDir, audioFile);
  const framePattern = path.join(outputDir, 'frame_%04d.jpg');

  // Extract frames and audio in parallel; resolve when both finish.
  let framesExtracted = 0;
  let framesError = null;
  let audioError  = null;
  let framesDone  = false;
  let audioDone   = false;

  function finish() {
    if (!framesDone || !audioDone) return;

    // Clean up the raw upload temp file
    fs.unlink(inputPath, () => {});

    if (framesError || audioError) {
      const err = framesError || audioError;
      console.error('Extraction error:', err.message);
      return res.status(500).json({ error: err.message });
    }

    console.log(`Frames extracted: ${framesExtracted}`);
    console.log(`Audio extracted: ${audioFile}`);

    // ── Whisper transcription ─────────────────────────────────────────────────
    if (!WHISPER_BIN) {
      return res.status(500).json({ error: 'Whisper is not installed or not found in PATH.' });
    }

    const whisperCmd = `"${WHISPER_BIN}" "${audioPath}" --model small --output_format json --output_dir "${outputDir}"`;
    console.log('Running Whisper:', whisperCmd);

    exec(whisperCmd, { maxBuffer: 50 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        console.error('Whisper error:', stderr || err.message);
        return res.status(500).json({ error: 'Whisper transcription failed.', detail: stderr || err.message });
      }

      // Whisper names the JSON output after the input file: <basename>_audio.json
      const transcriptPath = path.join(outputDir, `${baseName}_audio.json`);
      let segments = [];
      try {
        const raw = JSON.parse(fs.readFileSync(transcriptPath, 'utf8'));
        segments = (raw.segments || []).map(s => ({
          start: s.start,
          end:   s.end,
          text:  s.text.trim(),
        }));
      } catch (parseErr) {
        console.error('Failed to read Whisper output:', parseErr.message);
        return res.status(500).json({ error: 'Could not parse Whisper JSON output.' });
      }

      console.log('Transcript segments:');
      segments.forEach(s => console.log(`  [${s.start.toFixed(2)}s → ${s.end.toFixed(2)}s] ${s.text}`));

      // ── Claude vision analysis ──────────────────────────────────────────────
      runClaudeAnalysis({ outputDir, baseName, framesExtracted, segments, res });
    });
  }

  // 1) Extract 1 frame per second
  ffmpeg(inputPath)
    .outputOptions(['-vf', 'fps=1', '-q:v', '2'])
    .output(framePattern)
    .on('end', () => {
      // Count generated frames
      const frames = fs.readdirSync(outputDir).filter(f => f.startsWith('frame_') && f.endsWith('.jpg'));
      framesExtracted = frames.length;
      framesDone = true;
      finish();
    })
    .on('error', err => {
      framesError = err;
      framesDone  = true;
      finish();
    })
    .run();

  // 2) Extract audio as WAV
  ffmpeg(inputPath)
    .noVideo()
    .audioCodec('pcm_s16le')
    .output(audioPath)
    .on('end', () => {
      audioDone = true;
      finish();
    })
    .on('error', err => {
      audioError = err;
      audioDone  = true;
      finish();
    })
    .run();
});

// ─── Claude video analysis ────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are analyzing a short-form social media video (Instagram Reel or TikTok) from the brand Graftwild. The brand style is minimal, deadpan, ASMR-forward backyard chicken keeping and homesteading content. Analyze every frame and the audio transcript and return a structured JSON style breakdown with these exact fields:
{
"hook": {
"description": "what happens in the first 1-3 seconds",
"hook_type": "visual | audio | text | combined",
"timestamp": "0:00"
},
"text_overlays": [
{
"timestamp": "0:00",
"text": "exact text on screen",
"font_style": "your best description of font weight and style",
"position": "top | center | bottom | top-left etc",
"duration_seconds": 0,
"emoji": "any emoji used or null"
}
],
"zooms": [
{
"timestamp": "0:00",
"direction": "in | out",
"speed": "slow | medium | fast",
"subject": "what is being zoomed into"
}
],
"audio": {
"type": "asmr | voiceover | music | ambient | silent | mixed",
"key_sound_moments": [
{
"timestamp": "0:00",
"description": "what sound is happening and why it works"
}
],
"silence_moments": ["list any intentional silent gaps with timestamps"]
},
"pacing": {
"overall": "slow | medium | fast",
"cut_timestamps": ["list every cut timestamp"],
"rhythm_description": "describe the overall pacing feel"
},
"caption_style": {
"density": "minimal | moderate | heavy",
"tone": "deadpan | informational | emotional | humorous",
"example_caption": "if visible or inferable"
},
"style_fingerprint": "A 3-5 sentence summary of what makes this video feel like Graftwild content — the specific combination of elements that creates the brand feel"
}
Return only valid JSON. No preamble, no explanation.`;

async function runClaudeAnalysis({ outputDir, baseName, framesExtracted, segments, res }) {
  try {
    // Read all frame JPEGs in sorted order
    const frameFiles = fs.readdirSync(outputDir)
      .filter(f => f.startsWith('frame_') && f.endsWith('.jpg'))
      .sort();

    console.log(`Sending ${frameFiles.length} frames to Claude...`);

    // Build transcript text
    const transcriptText = segments.length > 0
      ? segments.map(s => `[${s.start.toFixed(2)}s → ${s.end.toFixed(2)}s] ${s.text}`).join('\n')
      : '(no speech detected)';

    // Build the user content array: one image+label pair per frame, then transcript
    const userContent = [];

    for (let i = 0; i < frameFiles.length; i++) {
      const frameFile = frameFiles[i];
      // Derive timestamp from frame number (frame_0001.jpg = second 1)
      const frameNum = parseInt(frameFile.replace('frame_', '').replace('.jpg', ''), 10);
      const seconds  = frameNum - 1; // ffmpeg fps=1 names from 0001
      const mm = String(Math.floor(seconds / 60)).padStart(1, '0');
      const ss = String(seconds % 60).padStart(2, '0');
      const timestamp = `${mm}:${ss}`;

      const imageData = fs.readFileSync(path.join(outputDir, frameFile)).toString('base64');

      userContent.push({
        type: 'text',
        text: `Frame at ${timestamp}:`,
      });
      userContent.push({
        type: 'image',
        source: { type: 'base64', media_type: 'image/jpeg', data: imageData },
      });
    }

    userContent.push({
      type: 'text',
      text: `Audio transcript:\n${transcriptText}\n\nNow return the JSON style breakdown.`,
    });

    const message = await anthropic.messages.create({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system:     SYSTEM_PROMPT,
      messages:   [{ role: 'user', content: userContent }],
    });

    // Extract the text block
    const textBlock = message.content.find(b => b.type === 'text');
    if (!textBlock) throw new Error('Claude returned no text block');

    // Parse JSON — strip any accidental markdown fences
    const raw = textBlock.text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
    let styleProfile;
    try {
      styleProfile = JSON.parse(raw);
    } catch (parseErr) {
      console.error('Claude JSON parse error:', parseErr.message);
      console.error('Raw response:', raw.slice(0, 500));
      throw new Error('Claude returned invalid JSON');
    }

    // Save style profile
    const profilePath = path.join(STYLE_PROFILE_DIR, `${baseName}.json`);
    fs.writeFileSync(profilePath, JSON.stringify(styleProfile, null, 2), 'utf8');
    console.log(`Style profile saved: ${profilePath}`);

    // Clean up temp subfolder
    fs.rmSync(outputDir, { recursive: true, force: true });
    console.log(`Temp folder cleaned: ${outputDir}`);

    res.json(styleProfile);

  } catch (err) {
    console.error('Claude analysis error:', err.message);
    res.status(500).json({ error: 'Claude analysis failed.', detail: err.message });
  }
}

// ─── GET /style-profiles ─────────────────────────────────────────────────────
app.get('/style-profiles', (req, res) => {
  try {
    const files = fs.readdirSync(STYLE_PROFILE_DIR)
      .filter(f => f.endsWith('.json') && f !== 'style-master.json');

    const profiles = files.map(filename => ({
      filename,
      data: JSON.parse(fs.readFileSync(path.join(STYLE_PROFILE_DIR, filename), 'utf8')),
    }));

    res.json(profiles);
  } catch (err) {
    console.error('GET /style-profiles error:', err.message);
    res.status(500).json({ error: 'Failed to read style profiles.', detail: err.message });
  }
});

// ─── GET /style-master ────────────────────────────────────────────────────────
app.get('/style-master', async (req, res) => {
  try {
    const files = fs.readdirSync(STYLE_PROFILE_DIR)
      .filter(f => f.endsWith('.json') && f !== 'style-master.json');

    if (files.length < 2) {
      return res.status(400).json({
        error: 'Upload and analyze at least 2 videos before generating a master style guide',
      });
    }

    const profiles = files.map(f => ({
      filename: f,
      data: JSON.parse(fs.readFileSync(path.join(STYLE_PROFILE_DIR, f), 'utf8')),
    }));

    console.log(`Generating style master from ${profiles.length} profiles...`);

    const message = await anthropic.messages.create({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages:   [{
        role:    'user',
        content: `Given these style profile JSONs from multiple Graftwild videos, synthesize a single master style guide JSON that captures the consistent patterns across all videos. Include ranges where values vary for example zoom speed: mostly slow to medium. Return only valid JSON, no preamble.\n\n${JSON.stringify(profiles, null, 2)}`,
      }],
    });

    const textBlock = message.content.find(b => b.type === 'text');
    if (!textBlock) throw new Error('Claude returned no text block');

    const raw = textBlock.text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
    let masterProfile;
    try {
      masterProfile = JSON.parse(raw);
    } catch (parseErr) {
      console.error('Claude JSON parse error:', parseErr.message);
      console.error('Raw response:', raw.slice(0, 500));
      throw new Error('Claude returned invalid JSON');
    }

    const masterPath = path.join(STYLE_PROFILE_DIR, 'style-master.json');
    fs.writeFileSync(masterPath, JSON.stringify(masterProfile, null, 2), 'utf8');
    console.log(`Style master saved: ${masterPath}`);

    res.json(masterProfile);
  } catch (err) {
    console.error('GET /style-master error:', err.message);
    res.status(500).json({ error: 'Failed to generate master style guide.', detail: err.message });
  }
});

// ─── Start ───────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Graft Wild server listening on http://localhost:${PORT}`);
});

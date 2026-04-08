'use strict';
require('dotenv').config();
const path = require('path');
const { getValidToken } = require('./lib/auth');
const { getAccount, getMedia, getComments, getMediaInsights, getAccountInsights, sleep } = require('./lib/api');
const { saveJSON, ensureDir } = require('./lib/save');

const DATA = path.join(__dirname, 'data');

async function main() {
  console.log('Graft Wild — Instagram Data Fetcher\n');
  const token = await getValidToken();

  process.stdout.write('Fetching account info... ');
  const account = await getAccount(token);
  saveJSON(path.join(DATA, 'account.json'), account);
  console.log(`@${account.username}  (${(account.followers_count || 0).toLocaleString()} followers, ${account.media_count} posts)`);

  process.stdout.write('Fetching media... ');
  const media = await getMedia(token, account.id);
  saveJSON(path.join(DATA, 'media.json'), media);
  console.log(`${media.length} posts/reels`);

  ensureDir(path.join(DATA, 'comments'));
  ensureDir(path.join(DATA, 'insights', 'media'));
  console.log(`\nProcessing ${media.length} posts:\n`);

  let commentTotal = 0;
  let insightCount = 0;

  for (let i = 0; i < media.length; i++) {
    const post = media[i];
    const idx  = String(i + 1).padStart(String(media.length).length, ' ');
    const type = post.media_type.padEnd(14, ' ');
    const date = post.timestamp?.slice(0, 10) ?? '          ';

    const comments = await getComments(token, post.id);
    saveJSON(path.join(DATA, 'comments', `${post.id}.json`), comments);
    commentTotal += comments.length;

    const insights = await getMediaInsights(token, post.id, post.media_type);
    if (insights) { saveJSON(path.join(DATA, 'insights', 'media', `${post.id}.json`), insights); insightCount++; }

    const apiComments = comments.length;
    const totalComments = post.comments_count || 0;
    const commentLabel = apiComments > 0 ? apiComments : `(${totalComments} private)`;
    const insLabel = insights ? `reach ${(insights.reach || 0).toLocaleString().padStart(7)}` : '  no insights  ';
    console.log(`  [${idx}/${media.length}] ${type} ${date}  ${String(commentLabel).padStart(12)} comments  ${insLabel}`);

    if (i < media.length - 1) await sleep(120);
  }

  process.stdout.write('\nFetching account insights... ');
  const accountInsights = await getAccountInsights(token, account.id);
  saveJSON(path.join(DATA, 'insights', 'account.json'), accountInsights);
  console.log(`${accountInsights.length} metric series`);

  console.log('\n--- Summary ---');
  console.log(`  Posts     : ${media.length}`);
  console.log(`  Comments  : ${commentTotal}`);
  console.log(`  Insights  : ${insightCount}/${media.length}`);
  console.log(`  Data      : ${DATA}`);
  console.log('\nNext: npm run prep');
}

main().catch(err => { console.error('\nError:', err.message); process.exit(1); });

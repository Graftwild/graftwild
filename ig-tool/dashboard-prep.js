'use strict';
const path = require('path');
const { saveJSON, readJSON } = require('./lib/save');

const DATA = path.join(__dirname, 'data');

function readMediaInsights(mediaList) {
  return mediaList.reduce((map, post) => {
    const ins = readJSON(path.join(DATA, 'insights', 'media', `${post.id}.json`));
    if (ins) map[post.id] = ins;
    return map;
  }, {});
}

function readMediaComments(mediaList) {
  return mediaList.reduce((map, post) => {
    map[post.id] = readJSON(path.join(DATA, 'comments', `${post.id}.json`)) || [];
    return map;
  }, {});
}

function engagement(post, insights) {
  const ins = insights[post.id] || {};
  return (ins.likes || post.like_count || 0) + (ins.comments || post.comments_count || 0) + (ins.shares || 0) + (ins.saved || 0);
}

function buildAccount(account, accountInsights) {
  const byDay = {};
  for (const series of (accountInsights || [])) {
    for (const v of (series.values || [])) {
      const day = v.end_time?.slice(0, 10);
      if (!day) continue;
      if (!byDay[day]) byDay[day] = {};
      byDay[day][series.name] = v.value;
    }
  }
  const days  = Object.keys(byDay).sort();
  const last7 = days.slice(-7);
  const last30 = days.slice(-30);
  function sum(ks, m) { return ks.reduce((s, d) => s + (byDay[d]?.[m] || 0), 0); }
  function avg(ks, m) { const vs = ks.map(d => byDay[d]?.[m]).filter(v => v != null); return vs.length ? Math.round(vs.reduce((a,b)=>a+b,0)/vs.length) : 0; }
  function trend(m) { const p = days.slice(-14,-7); const c = sum(last7,m); const pr = sum(p,m); return pr ? parseFloat(((c-pr)/pr*100).toFixed(1)) : null; }
  return {
    profile: { id: account.id, username: account.username, name: account.name, bio: account.biography, followers: account.followers_count, following: account.follows_count, totalPosts: account.media_count, profilePicture: account.profile_picture_url, website: account.website },
    last7Days:  { impressions: sum(last7,'impressions'), reach: sum(last7,'reach'), profileViews: sum(last7,'profile_views'), interactions: sum(last7,'total_interactions') },
    last30Days: { reach: sum(last30,'reach'), profileViews: sum(last30,'profile_views'), interactions: sum(last30,'total_interactions'), avgDailyReach: avg(last30,'reach') },
    trends:     { reach: trend('reach'), profileViews: trend('profile_views') },
    insightsByDay: byDay,
  };
}

function buildMedia(media, insights, comments) {
  const enriched = media.map(post => {
    const ins = insights[post.id] || {};
    const postComments = comments[post.id] || [];
    const eng   = engagement(post, insights);
    const reach = ins.reach || 0;
    const engRate = reach > 0 ? parseFloat((eng / reach * 100).toFixed(2)) : null;
    return {
      id: post.id, type: post.media_type, caption: post.caption?.slice(0, 400) || '',
      timestamp: post.timestamp, permalink: post.permalink, thumbnail: post.thumbnail_url || post.media_url || null,
      stats: { likes: ins.likes ?? (post.like_count||0), comments: ins.comments ?? (post.comments_count||0), shares: ins.shares||0, saved: ins.saved||0, reach: ins.reach||0, plays: ins.plays||0, engagement: eng, engagementRate: engRate },
      comments: postComments.sort((a,b)=>(b.like_count||0)-(a.like_count||0)).slice(0,10).map(c=>({ id:c.id, username:c.username, text:c.text, likes:c.like_count||0, timestamp:c.timestamp, replies:(c.replies?.data||[]).map(r=>({id:r.id,username:r.username,text:r.text,likes:r.like_count||0,timestamp:r.timestamp})) })),
    };
  });
  const totals = { posts: enriched.length, reels: enriched.filter(p=>p.type==='REEL').length, images: enriched.filter(p=>p.type==='IMAGE').length, carousels: enriched.filter(p=>p.type==='CAROUSEL_ALBUM').length, totalLikes: enriched.reduce((s,p)=>s+p.stats.likes,0), totalComments: enriched.reduce((s,p)=>s+p.stats.comments,0), totalShares: enriched.reduce((s,p)=>s+p.stats.shares,0), totalSaved: enriched.reduce((s,p)=>s+p.stats.saved,0), totalReach: enriched.reduce((s,p)=>s+p.stats.reach,0) };
  const byEng = [...enriched].sort((a,b)=>b.stats.engagement-a.stats.engagement);
  return { all: enriched, recentPosts: enriched.slice(0,12), topByEngagement: byEng.slice(0,10), totals };
}

function buildComments(media, comments) {
  const all = [];
  for (const post of media) {
    for (const c of (comments[post.id]||[])) {
      all.push({...c, postId:post.id, postType:post.media_type, isReply:false});
      for (const r of (c.replies?.data||[])) all.push({...r, postId:post.id, parentId:c.id, isReply:true});
    }
  }
  all.sort((a,b)=>new Date(b.timestamp)-new Date(a.timestamp));
  return {
    total: all.filter(c=>!c.isReply).length,
    totalReplies: all.filter(c=>c.isReply).length,
    recent: all.slice(0,50).map(c=>({ id:c.id, username:c.username, text:c.text, likes:c.like_count||0, timestamp:c.timestamp, postId:c.postId, postType:c.postType, isReply:c.isReply, parentId:c.parentId||null })),
    mostLiked: all.filter(c=>!c.isReply).sort((a,b)=>(b.like_count||0)-(a.like_count||0)).slice(0,10).map(c=>({ id:c.id, username:c.username, text:c.text, likes:c.like_count||0, timestamp:c.timestamp, postId:c.postId })),
  };
}

async function main() {
  console.log('Graft Wild — Dashboard Data Prep\n');
  const account         = readJSON(path.join(DATA, 'account.json'));
  const media           = readJSON(path.join(DATA, 'media.json'));
  const accountInsights = readJSON(path.join(DATA, 'insights', 'account.json'));
  if (!account || !media) { console.error('Missing data — run: npm run fetch first.'); process.exit(1); }
  console.log(`Building for @${account.username} — ${media.length} posts...`);
  const insights = readMediaInsights(media);
  const comments = readMediaComments(media);
  const output   = { generatedAt: new Date().toISOString(), account: buildAccount(account, accountInsights), media: buildMedia(media, insights, comments), comments: buildComments(media, comments) };
  saveJSON(path.join(DATA, 'dashboard-data.json'), output);
  const { media: m, comments: c } = output;
  console.log(`\ndashboard-data.json ready`);
  console.log(`  ${m.totals.posts} posts  |  ${c.total} comments  |  ${m.totals.totalReach.toLocaleString()} total reach`);
  console.log('\nLoad in dashboard.html:');
  console.log("  fetch('./ig-tool/data/dashboard-data.json').then(r=>r.json())");
}

main().catch(err => { console.error('Error:', err.message); process.exit(1); });

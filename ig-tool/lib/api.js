'use strict';

const BASE = 'https://graph.instagram.com/v21.0';

const MEDIA_METRICS = {
  IMAGE:          'reach,likes,comments,shares,saved,total_interactions',
  VIDEO:          'reach,likes,comments,shares,saved,total_interactions',
  REEL:           'reach,likes,comments,shares,saved,total_interactions',
  CAROUSEL_ALBUM: 'reach,likes,comments,shares,saved,total_interactions',
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function apiGet(endpoint, params, token) {
  const url = new URL(`${BASE}${endpoint}`);
  url.searchParams.set('access_token', token);
  for (const [k, v] of Object.entries(params || {})) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
  const res  = await fetch(url.toString());
  const data = await res.json();
  if (data.error) {
    const err = new Error(`[${data.error.code}] ${data.error.message}`);
    err.code  = data.error.code;
    throw err;
  }
  return data;
}

async function getAccount(token) {
  return apiGet('/me', {
    fields: 'id,name,username,biography,followers_count,follows_count,media_count,profile_picture_url,website,account_type',
  }, token);
}

async function getMedia(token, userId, limit) {
  const maxPosts = limit || parseInt(process.env.IG_MEDIA_LIMIT, 10) || 50;
  const fields   = [
    'id','caption','media_type','media_url','thumbnail_url',
    'timestamp','like_count','comments_count','permalink','username',
    'children{id,media_type,media_url,thumbnail_url}',
  ].join(',');
  let allMedia = [];
  const data   = await apiGet(`/${userId}/media`, { fields, limit: Math.min(maxPosts, 100) }, token);
  allMedia     = allMedia.concat(data.data || []);
  let next = data.paging?.next;
  while (next && allMedia.length < maxPosts) {
    const page = await fetch(next).then(r => r.json());
    if (page.error || !page.data) break;
    allMedia = allMedia.concat(page.data);
    next     = page.paging?.next;
  }
  return allMedia.slice(0, maxPosts);
}

async function getComments(token, mediaId) {
  const fields = 'id,text,timestamp,username,like_count,replies{id,text,timestamp,username,like_count}';
  try {
    const data = await apiGet(`/${mediaId}/comments`, { fields, limit: 100 }, token);
    return data.data || [];
  } catch { return []; }
}

async function getMediaInsights(token, mediaId, mediaType) {
  const metric = MEDIA_METRICS[mediaType] || MEDIA_METRICS.VIDEO;
  try {
    const data   = await apiGet(`/${mediaId}/insights`, { metric }, token);
    const result = { media_id: mediaId, media_type: mediaType };
    for (const item of (data.data || [])) {
      result[item.name] = Array.isArray(item.values) ? (item.values[0]?.value ?? null) : (item.value ?? null);
    }
    return result;
  } catch { return null; }
}

async function getAccountInsights(token, userId) {
  const days  = parseInt(process.env.IG_INSIGHTS_DAYS, 10) || 30;
  const until = Math.floor(Date.now() / 1000);
  const since = until - days * 86400;
  const metricSets = [
    'reach,accounts_engaged,total_interactions,profile_views,follower_count,website_clicks',
    'reach,profile_views,follower_count',
    'reach,profile_views',
  ];
  for (const metric of metricSets) {
    try {
      const data = await apiGet(`/${userId}/insights`, { metric, period: 'day', since, until }, token);
      return data.data || [];
    } catch { }
  }
  return [];
}

module.exports = { getAccount, getMedia, getComments, getMediaInsights, getAccountInsights, sleep };

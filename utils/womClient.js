// Minimal Wise Old Man API client.
// Uses Node's built-in fetch (requires Node 18+).

const BASE_URL = 'https://api.wiseoldman.net/v2';

// Very small in-memory cache to avoid hammering the API if multiple people
// run commands close together. WOM allows 20 req/60s (100 with an API key),
// so a short cache window goes a long way.
const CACHE_TTL_MS = 60 * 1000;
const cache = new Map(); // key -> { expiresAt, data }

function buildUrl(path, params = {}) {
  const url = new URL(BASE_URL + path);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

async function womGet(path, params = {}) {
  const url = buildUrl(path, params);

  const cached = cache.get(url);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const headers = {};
  if (process.env.WOM_API_KEY) headers['x-api-key'] = process.env.WOM_API_KEY;
  // WOM asks all consumers to identify themselves via a user agent so they
  // can reach out if something's wrong, instead of just IP-banning you.
  headers['User-Agent'] = process.env.WOM_USER_AGENT || 'clan-leaderboard-bot';

  const response = await fetch(url, { headers });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`WOM API ${response.status} for ${path}: ${body.slice(0, 200)}`);
  }

  const data = await response.json();
  cache.set(url, { expiresAt: Date.now() + CACHE_TTL_MS, data });
  return data;
}

module.exports = { womGet };

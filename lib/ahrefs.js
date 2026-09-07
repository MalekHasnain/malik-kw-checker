// KW Checker — Ahrefs free Domain Rating endpoint
// GET https://api.ahrefs.com/v3/public/domain-rating-free?target=<domain>&output=json
// Free with an APIv3 key. Attribution required: "Domain Rating by Ahrefs".
// Rate limit: 60 req/min account-wide; occasional dynamic throttling (429).

import { getSettings } from './settings.js';
import { cacheGet, cacheSet } from './cache.js';

const DR_TTL = 24 * 60 * 60 * 1000;   // 24h — DR changes slowly
const BACKOFF_TTL = 5 * 60_000;       // negative-cache 429s / errors briefly

const inFlight = new Map(); // dedupe concurrent lookups for the same domain

export async function domainRating(domain) {
  const s = await getSettings();
  if (!s.ahrefsKey) return { domain, dr: null, error: 'Ahrefs key not set' };

  const key = `dr:${domain.toLowerCase()}`;
  const prior = await cacheGet(key);
  if (prior) {
    if (prior.__backoff) return { domain, dr: null, error: prior.__backoff };
    if (prior.__error) return { domain, dr: null, error: prior.__error };
    return prior; // { domain, dr }
  }

  if (inFlight.has(key)) return inFlight.get(key);

  const p = (async () => {
    try {
      const url = `https://api.ahrefs.com/v3/public/domain-rating-free?target=${encodeURIComponent(domain)}&output=json`;
      const res = await fetch(url, { headers: { 'Authorization': `Bearer ${s.ahrefsKey}` } });

      if (res.status === 429) {
        await cacheSet(key, { __backoff: 'rate-limited (429)' }, BACKOFF_TTL);
        return { domain, dr: null, error: 'Ahrefs rate limit (429) — will retry in a few minutes' };
      }
      if (!res.ok) {
        const body = await res.text();
        const err = `Ahrefs HTTP ${res.status}: ${body.slice(0, 160)}`;
        await cacheSet(key, { __error: err }, BACKOFF_TTL);
        return { domain, dr: null, error: err };
      }

      const data = await res.json();
      const dr = data?.domain_rating?.domain_rating;
      const value = { domain, dr: typeof dr === 'number' ? dr : null };
      await cacheSet(key, value, DR_TTL);
      return value;
    } catch (err) {
      const msg = String(err && err.message || err);
      await cacheSet(key, { __error: msg }, 30_000);
      return { domain, dr: null, error: msg };
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, p);
  return p;
}

export async function testAhrefs() {
  const r = await domainRating('ahrefs.com');
  if (r.dr === null) throw new Error(r.error || 'No DR returned');
  return r;
}

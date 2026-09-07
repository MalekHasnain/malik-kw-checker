// KW Checker — site age via RDAP (modern WHOIS), no key required.
// GET https://rdap.org/domain/<domain> — redirects to the authoritative registry.
// ICANN gTLD RDAP servers send CORS headers, so the redirect works from the service worker.

import { cacheGet, cacheSet } from './cache.js';

const TTL = 365 * 24 * 60 * 60 * 1000; // effectively forever — registration date never changes
const ERR_TTL = 10 * 60_000;

const inFlight = new Map();

function parseRegistration(rdap) {
  if (!rdap) return null;
  // Prefer the events array; fall back to the legacy field some registries use.
  const ev = (rdap.events || []).find(e => e.eventAction === 'registration');
  if (ev && ev.eventDate) return ev.eventDate;
  if (rdap.registrationDate) return rdap.registrationDate;
  return null;
}

export function ageString(regDateIso, now = Date.now()) {
  const t = Date.parse(regDateIso);
  if (!t || isNaN(t)) return null;
  let ms = now - t;
  if (ms < 0) ms = 0;
  const monthsTotal = Math.floor(ms / (30.44 * 24 * 3600 * 1000));
  const years = Math.floor(monthsTotal / 12);
  const months = monthsTotal % 12;
  if (years <= 0) return months <= 0 ? 'new' : `${months}mo`;
  return months > 0 ? `${years}y ${months}m` : `${years}y`;
}

export async function siteAge(domain) {
  const key = `age:${domain.toLowerCase()}`;
  const prior = await cacheGet(key);
  if (prior) {
    if (prior.__error) return { domain, age: null, error: prior.__error };
    return prior;
  }

  if (inFlight.has(key)) return inFlight.get(key);

  const p = (async () => {
    try {
      const res = await fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`, {
        headers: { 'Accept': 'application/rdap+json' },
        redirect: 'follow'
      });
      if (!res.ok) {
        const err = res.status === 404
          ? 'domain not found'
          : `RDAP HTTP ${res.status}`;
        await cacheSet(key, { __error: err }, ERR_TTL);
        return { domain, age: null, error: err };
      }
      const rdap = await res.json();
      const regIso = parseRegistration(rdap);
      if (!regIso) {
        await cacheSet(key, { __error: 'no registration date in RDAP' }, ERR_TTL);
        return { domain, age: null, error: 'no registration date' };
      }
      const value = { domain, registered: regIso, age: ageString(regIso) };
      await cacheSet(key, value, TTL);
      return value;
    } catch (err) {
      const msg = String(err && err.message || err);
      await cacheSet(key, { __error: msg }, ERR_TTL);
      return { domain, age: null, error: msg };
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, p);
  return p;
}

export async function testRdap() {
  const r = await siteAge('google.com');
  if (!r.age) throw new Error(r.error || 'no age returned');
  return r;
}

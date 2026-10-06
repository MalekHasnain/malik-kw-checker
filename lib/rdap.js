// KW Checker — site age via RDAP + dual WHOIS fallback
// 1. RDAP via direct registry servers or rdap.org redirect
// 2. Fallback to free WHOIS JSON APIs (who-dat.as93.net, networkcalc.com)
// Always normalizes subdomains to the registrable base domain (e.g. deals.foo.com -> foo.com).

import { cacheGet, cacheSet } from './cache.js';

const TTL = 365 * 24 * 60 * 60 * 1000; // registration date never changes
const ERR_TTL = 5 * 60_000;            // retry failed lookups after 5 minutes
const FETCH_TIMEOUT = 6000;            // 6s timeout per request

const inFlight = new Map();

// Known direct RDAP servers for high-speed lookup
const RDAP_SERVERS = {
  'com': 'https://rdap.verisign.com/com/v1',
  'net': 'https://rdap.verisign.com/net/v1',
  'org': 'https://rdap.publicinterestregistry.org/rdap',
  'io':  'https://rdap.nic.io',
  'co':  'https://rdap.nic.co',
  'me':  'https://rdap.nic.me',
  'app': 'https://rdap.nic.google',
  'dev': 'https://rdap.nic.google',
  'xyz': 'https://rdap.nic.xyz',
  'info': 'https://rdap.afilias.net/rdap/info',
  'biz': 'https://rdap.nic.biz',
  'us':  'https://rdap.nic.us',
  'uk':  'https://rdap.nominet.uk/uk',
  'de':  'https://rdap.denic.de',
  'fr':  'https://rdap.nic.fr',
  'nl':  'https://rdap.sidn.nl',
  'au':  'https://rdap.auda.org.au',
  'ca':  'https://rdap.ca.fury.ca/rdap',
  'in':  'https://rdap.registry.in',
  'br':  'https://rdap.registro.br'
};

export function getBaseDomain(domain) {
  if (!domain) return '';
  const clean = String(domain).toLowerCase().replace(/^www\./, '').trim();
  const parts = clean.split('.');
  if (parts.length <= 2) return clean;

  const last2 = parts.slice(-2).join('.');
  const compoundTlds = [
    'co.uk', 'com.au', 'com.pk', 'com.sa', 'com.ae', 'co.in',
    'com.br', 'com.mx', 'com.ar', 'co.jp', 'co.kr', 'co.za',
    'co.nz', 'co.th', 'co.id', 'co.il', 'com.tr', 'com.ng',
    'com.eg', 'com.ph', 'com.sg', 'com.tw', 'com.vn', 'com.co',
    'com.pe', 'co.ve', 'org.uk', 'net.au', 'org.au', 'ac.uk',
    'gov.uk', 'com.my', 'com.hk', 'com.bd', 'org.in', 'net.in',
    'com.qa', 'com.kw', 'com.om', 'com.bh', 'com.lb', 'com.jo'
  ];

  if (compoundTlds.includes(last2)) {
    return parts.slice(-3).join('.');
  }
  return parts.slice(-2).join('.');
}

function getTld(baseDomain) {
  const parts = baseDomain.split('.');
  return parts[parts.length - 1];
}

// ---------- Date format parser ----------

function toIsoDate(val) {
  if (!val) return null;
  const t = Date.parse(val);
  if (!t || isNaN(t)) return null;
  return new Date(t).toISOString();
}

// ---------- RDAP parser ----------

function parseRegistration(rdap) {
  if (!rdap) return null;

  const events = rdap.events || [];
  const registrationActions = ['registration', 'creation', 'created'];

  for (const action of registrationActions) {
    const ev = events.find(e =>
      e.eventAction === action ||
      e.eventAction?.toLowerCase() === action
    );
    if (ev && ev.eventDate) {
      const iso = toIsoDate(ev.eventDate);
      if (iso) return iso;
    }
  }

  const creationEvent = events.find(e =>
    /regist|creat/i.test(e.eventAction || '')
  );
  if (creationEvent && creationEvent.eventDate) {
    const iso = toIsoDate(creationEvent.eventDate);
    if (iso) return iso;
  }

  if (rdap.registrationDate) {
    const iso = toIsoDate(rdap.registrationDate);
    if (iso) return iso;
  }
  if (rdap.creationDate) {
    const iso = toIsoDate(rdap.creationDate);
    if (iso) return iso;
  }

  // Nested entities
  const entities = rdap.entities || [];
  for (const entity of entities) {
    const entityEvents = entity.events || [];
    for (const action of registrationActions) {
      const ev = entityEvents.find(e =>
        e.eventAction === action ||
        e.eventAction?.toLowerCase() === action
      );
      if (ev && ev.eventDate) {
        const iso = toIsoDate(ev.eventDate);
        if (iso) return iso;
      }
    }
  }

  return null;
}

// ---------- WHOIS parser ----------

function parseWhoisDate(data) {
  if (!data) return null;

  // who-dat.as93.net format
  if (data.dates?.created) {
    const iso = toIsoDate(data.dates.created);
    if (iso) return iso;
  }
  if (data.dates?.creation_date) {
    const iso = toIsoDate(data.dates.creation_date);
    if (iso) return iso;
  }

  // networkcalc.com format
  if (data.whois?.registry_created_date) {
    const iso = toIsoDate(data.whois.registry_created_date);
    if (iso) return iso;
  }

  // Standard alternative fields
  const candidates = [
    data.creation_date,
    data.created,
    data.created_date,
    data.domain?.creation_date,
    data.domain?.created,
    data.domain?.dates?.created,
    data.registrar?.creation_date
  ];

  for (const c of candidates) {
    const iso = toIsoDate(c);
    if (iso) return iso;
  }

  // Raw text regex fallback
  const rawText = data.raw || data.whois_raw || data.text || '';
  if (rawText && typeof rawText === 'string') {
    const patterns = [
      /Creat(?:ion|ed)\s*Date\s*:\s*(.+)/im,
      /Registration\s*Date\s*:\s*(.+)/im,
      /Created\s*:\s*(.+)/im,
      /Registered\s*(?:on|date)\s*:\s*(.+)/im,
      /domain_dateregistered\s*:\s*(.+)/im,
      /\[Created on\]\s*(.+)/im,
      /Registration Time\s*:\s*(.+)/im
    ];
    for (const re of patterns) {
      const m = rawText.match(re);
      if (m && m[1]) {
        const iso = toIsoDate(m[1].trim());
        if (iso) return iso;
      }
    }
  }

  return null;
}

// ---------- Age formatting ----------

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

function fetchWithTimeout(url, options, timeoutMs = FETCH_TIMEOUT) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

// ---------- RDAP Lookup (on base domain) ----------

async function tryRdapLookup(baseDomain) {
  const tld = getTld(baseDomain);

  // 1. Direct registry server if available
  const directServer = RDAP_SERVERS[tld];
  if (directServer) {
    try {
      const res = await fetchWithTimeout(
        `${directServer}/domain/${encodeURIComponent(baseDomain)}`,
        { headers: { 'Accept': 'application/rdap+json' }, redirect: 'follow' }
      );
      if (res.ok) {
        const rdap = await res.json();
        const regIso = parseRegistration(rdap);
        if (regIso) return { registered: regIso, age: ageString(regIso) };
      }
    } catch {
      // Fall through to rdap.org
    }
  }

  // 2. Universal redirect via rdap.org
  try {
    const res = await fetchWithTimeout(
      `https://rdap.org/domain/${encodeURIComponent(baseDomain)}`,
      { headers: { 'Accept': 'application/rdap+json' }, redirect: 'follow' }
    );
    if (res.ok) {
      const rdap = await res.json();
      const regIso = parseRegistration(rdap);
      if (regIso) return { registered: regIso, age: ageString(regIso) };
    }
  } catch {
    // Fall through to WHOIS
  }

  return null;
}

// ---------- Dual WHOIS Fallback (on base domain) ----------

async function tryWhoisLookup(baseDomain) {
  // API 1: who-dat.as93.net (supports lots of ccTLDs and gTLDs)
  try {
    const res = await fetchWithTimeout(
      `https://who-dat.as93.net/${encodeURIComponent(baseDomain)}`,
      { headers: { 'Accept': 'application/json' } },
      5000
    );
    if (res.ok) {
      const data = await res.json();
      const regIso = parseWhoisDate(data);
      if (regIso) return { registered: regIso, age: ageString(regIso) };
    }
  } catch {
    // Try API 2
  }

  // API 2: networkcalc.com
  try {
    const res = await fetchWithTimeout(
      `https://networkcalc.com/api/dns/whois/${encodeURIComponent(baseDomain)}`,
      { headers: { 'Accept': 'application/json' } },
      5000
    );
    if (res.ok) {
      const data = await res.json();
      const regIso = parseWhoisDate(data);
      if (regIso) return { registered: regIso, age: ageString(regIso) };
    }
  } catch {
    // Both failed
  }

  return null;
}

// ---------- Main siteAge API ----------

export async function siteAge(domain) {
  if (!domain) return { domain: '', age: null, error: 'no domain' };

  // Always look up by the base/root registrable domain
  const root = getBaseDomain(domain);
  if (!root) return { domain, age: null, error: 'invalid domain' };

  const key = `age:${root}`;
  const prior = await cacheGet(key);
  if (prior) {
    if (prior.__error) return { domain, age: null, error: prior.__error };
    return { domain, registered: prior.registered, age: prior.registered ? ageString(prior.registered) : prior.age };
  }

  if (inFlight.has(key)) {
    const shared = await inFlight.get(key);
    return { domain, registered: shared?.registered || null, age: shared?.age || null, error: shared?.error || null };
  }

  const p = (async () => {
    try {
      // Step 1: Try RDAP on base domain
      const rdapResult = await tryRdapLookup(root);
      if (rdapResult?.registered) {
        const value = { domain: root, registered: rdapResult.registered, age: rdapResult.age };
        await cacheSet(key, value, TTL);
        return value;
      }

      // Step 2: Try dual WHOIS APIs on base domain
      const whoisResult = await tryWhoisLookup(root);
      if (whoisResult?.registered) {
        const value = { domain: root, registered: whoisResult.registered, age: whoisResult.age };
        await cacheSet(key, value, TTL);
        return value;
      }

      // If both fail, cache error briefly
      const err = 'age unavailable for this registry';
      await cacheSet(key, { __error: err }, ERR_TTL);
      return { domain: root, age: null, error: err };
    } catch (err) {
      const msg = err.name === 'AbortError' ? 'lookup timed out' : String(err?.message || err);
      await cacheSet(key, { __error: msg }, ERR_TTL);
      return { domain: root, age: null, error: msg };
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, p);
  const result = await p;
  return { domain, registered: result.registered || null, age: result.age || null, error: result.error || null };
}

export async function testRdap() {
  const r = await siteAge('google.com');
  if (!r.age) throw new Error(r.error || 'no age returned');
  return r;
}

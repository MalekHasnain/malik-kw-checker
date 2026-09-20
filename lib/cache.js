// KW Checker — TTL cache on top of chrome.storage.local
// Entries: { v: value, exp: expiryMs (0 = never) }

const SWEEP_ALARM = 'kw-sweep';

export async function cacheGet(key) {
  const stored = await chrome.storage.local.get(`c:${key}`);
  const entry = stored[`c:${key}`];
  if (!entry) return undefined;
  if (entry.exp && entry.exp < Date.now()) {
    await chrome.storage.local.remove(`c:${key}`);
    return undefined;
  }
  return entry.v;
}

export async function cacheSet(key, value, ttlMs = 0) {
  const exp = ttlMs ? Date.now() + ttlMs : 0;
  await chrome.storage.local.set({ [`c:${key}`]: { v: value, exp } });
}

// Negative cache: remember failures so we don't hammer APIs on repeat visits.
export async function cacheGetOrSet(key, ttlMs, producer) {
  const hit = await cacheGet(key);
  if (hit !== undefined) {
    // Re-throw cached errors so callers see the failure instead of silent dashes
    if (hit && typeof hit === 'object' && hit.__error) {
      throw new Error(hit.__error);
    }
    return hit;
  }
  try {
    const value = await producer();
    await cacheSet(key, value, ttlMs);
    return value;
  } catch (err) {
    // cache the error marker briefly so we don't hammer APIs on repeat visits
    await cacheSet(key, { __error: String(err && err.message || err) }, 5 * 60_000);
    throw err;
  }
}

export async function sweepExpired() {
  const all = await chrome.storage.local.get(null);
  const now = Date.now();
  const doomed = [];
  for (const [k, entry] of Object.entries(all)) {
    if (k.startsWith('c:') && entry && typeof entry === 'object' && 'exp' in entry) {
      if (entry.exp && entry.exp < now) doomed.push(k);
    }
  }
  if (doomed.length) await chrome.storage.local.remove(doomed);
}

export async function cacheStats() {
  const all = await chrome.storage.local.get(null);
  let kw = 0, dr = 0, age = 0, other = 0;
  for (const k of Object.keys(all)) {
    if (!k.startsWith('c:')) continue;
    if (k.startsWith('c:kw:')) kw++;
    else if (k.startsWith('c:dr:')) dr++;
    else if (k.startsWith('c:age:')) age++;
    else other++;
  }
  return { keywordCache: kw, drCache: dr, ageCache: age, other };
}

export function setupSweep() {
  chrome.alarms?.create?.(SWEEP_ALARM, { periodInMinutes: 60 });
}

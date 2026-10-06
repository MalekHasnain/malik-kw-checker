// Malik Kw Checker — Ahrefs DR and Site Age only.
import { getSettings, saveSettings, isAhrefsConfigured } from '../lib/settings.js';
import { domainRating, testAhrefs } from '../lib/ahrefs.js';
import { siteAge, testRdap } from '../lib/rdap.js';
import { cacheStats, sweepExpired } from '../lib/cache.js';
chrome.runtime.onInstalled.addListener(() => sweepExpired());
chrome.runtime.onStartup?.addListener(() => sweepExpired());

async function analyze(domains) {
  const targets = [...new Set((Array.isArray(domains) ? domains : []).filter(d => typeof d === 'string' && /^[a-z0-9.-]+$/i.test(d)))].slice(0, 20);
  const entries = await Promise.all(targets.map(async domain => {
    const [dr, age] = await Promise.allSettled([domainRating(domain), siteAge(domain)]);
    const rating = dr.status === 'fulfilled' ? dr.value : { error: String(dr.reason?.message || dr.reason) };
    const registration = age.status === 'fulfilled' ? age.value : { error: String(age.reason?.message || age.reason) };
    return [domain, { dr: rating.dr ?? null, drError: rating.error || null, age: registration.age ?? null, registered: registration.registered || null, ageError: registration.error || null }];
  }));
  return Object.fromEntries(entries);
}
chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  (async () => {
    try {
      switch (msg?.type) {
        case 'kw:analyze': return respond({ ok: true, domains: await analyze(msg.domains) });
        case 'kw:status': {
          const settings = await getSettings();
          return respond({ ok: true, settings: { ahrefsKey: settings.ahrefsKey ? '••••' : '' }, ahrefsConfigured: isAhrefsConfigured(settings), cache: await cacheStats() });
        }
        case 'kw:saveSettings': {
          await saveSettings(msg.patch || {});
          return respond({ ok: true });
        }
        case 'kw:testAhrefs': return respond({ ok: true, result: await testAhrefs() });
        case 'kw:testRdap': return respond({ ok: true, result: await testRdap() });
        case 'kw:clearCache': {
          const all = await chrome.storage.local.get(null);
          await chrome.storage.local.remove(Object.keys(all).filter(k => k.startsWith('c:')));
          return respond({ ok: true });
        }
        default: return respond({ ok: false, error: 'Unsupported action' });
      }
    } catch (error) { respond({ ok: false, error: String(error?.message || error) }); }
  })();
  return true;
});

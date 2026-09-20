// KW Checker — background service worker (module)

import {
  getSettings,
  saveSettings,
  isGoogleConfigured,
  isAhrefsConfigured,
  isOpenPageRankConfigured,
  isMozConfigured
} from '../lib/settings.js';
import * as oauth from '../lib/oauth.js';
import * as googleAds from '../lib/google-ads.js';
import * as ahrefs from '../lib/ahrefs.js';
import * as rdap from '../lib/rdap.js';
import * as techDetect from '../lib/tech-detect.js';
import * as trafficRank from '../lib/traffic-rank.js';
import * as moz from '../lib/moz.js';
import { cacheStats, sweepExpired } from '../lib/cache.js';

chrome.runtime.onInstalled.addListener(() => { sweepExpired(); });
chrome.runtime.onStartup?.addListener?.(() => { sweepExpired(); });

async function analyze(query, domains) {
  const targetDomains = Array.isArray(domains) ? domains.slice(0, 20) : [];

  // Execute Keyword metrics, per-domain lookups, and bulk lookups in parallel
  const [kwResult, domainSettled, oprResult, mozResult] = await Promise.allSettled([
    googleAds.keywordMetrics(query),
    Promise.allSettled(targetDomains.map(d =>
      Promise.allSettled([
        ahrefs.domainRating(d),
        rdap.siteAge(d),
        techDetect.detectTech(d)
      ])
    )),
    trafficRank.bulkTrafficRank(targetDomains),
    moz.bulkMozMetrics(targetDomains)
  ]);

  let keyword = null;
  let keywordError = null;
  if (kwResult.status === 'fulfilled') {
    keyword = kwResult.value;
  } else {
    keywordError = String(kwResult.reason?.message || kwResult.reason);
  }

  const oprMap = oprResult.status === 'fulfilled' ? oprResult.value : {};
  const mozMap = mozResult.status === 'fulfilled' ? mozResult.value : {};

  const domainResultsList = domainSettled.status === 'fulfilled' ? domainSettled.value : [];
  const domainInfo = {};

  targetDomains.forEach((d, i) => {
    const itemSettled = domainResultsList[i];
    const tri = itemSettled && itemSettled.status === 'fulfilled' ? itemSettled.value : [];
    const [drR, ageR, techR] = tri;

    const dr = drR && drR.status === 'fulfilled' ? drR.value : { domain: d, dr: null, error: String(drR?.reason?.message || drR?.reason || 'DR lookup failed') };
    const age = ageR && ageR.status === 'fulfilled' ? ageR.value : { domain: d, age: null, error: String(ageR?.reason?.message || ageR?.reason || 'age lookup failed') };
    const tech = techR && techR.status === 'fulfilled' ? techR.value : { domain: d, framework: null };

    const opr = oprMap[d] || {};
    const mozData = mozMap[d] || {};

    domainInfo[d] = {
      dr: dr.dr ?? null,
      drError: dr.error || null,
      age: age.age ?? null,
      registered: age.registered || null,
      ageError: age.error || null,
      framework: tech.framework || null,
      rank: opr.rank || null,
      pageRank: opr.pageRank || null,
      da: mozData.da ?? null,
      pa: mozData.pa ?? null
    };
  });

  return { keyword, keywordError, domains: domainInfo };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      switch (msg?.type) {
        case 'kw:analyze': {
          const { q, domains } = msg;
          if (!q) return sendResponse({ ok: false, error: 'no query' });
          sendResponse({ ok: true, ...(await analyze(q, Array.isArray(domains) ? msg.domains.slice(0, 20) : [])) });
          break;
        }
        case 'kw:status': {
          const s = await getSettings();
          sendResponse({
            ok: true,
            settings: {
              ...s,
              developerToken: s.developerToken ? '••••' : '',
              ahrefsKey: s.ahrefsKey ? '••••' : '',
              openPageRankKey: s.openPageRankKey ? '••••' : '',
              mozToken: s.mozToken ? '••••' : ''
            },
            googleConfigured: isGoogleConfigured(s),
            ahrefsConfigured: isAhrefsConfigured(s),
            openPageRankConfigured: isOpenPageRankConfigured(s),
            mozConfigured: isMozConfigured(s),
            googleSignedIn: !(await oauth.signedOut()),
            cache: await cacheStats()
          });
          break;
        }
        case 'kw:saveSettings': {
          const saved = await saveSettings(msg.patch || {});
          sendResponse({
            ok: true,
            saved: {
              ...saved,
              developerToken: '••••',
              ahrefsKey: '••••',
              openPageRankKey: '••••',
              mozToken: '••••'
            }
          });
          break;
        }
        case 'kw:connect': {
          const s = await getSettings();
          if (!s.googleClientId) return sendResponse({ ok: false, error: 'Set the Google OAuth Client ID first.' });
          await oauth.authorize(s.googleClientId);
          sendResponse({ ok: true });
          break;
        }
        case 'kw:disconnect': {
          await oauth.logout();
          sendResponse({ ok: true });
          break;
        }
        case 'kw:testGoogle': {
          const idea = await googleAds.testConnection();
          sendResponse({ ok: true, result: idea });
          break;
        }
        case 'kw:testAhrefs': {
          const r = await ahrefs.testAhrefs();
          sendResponse({ ok: true, result: r });
          break;
        }
        case 'kw:testRdap': {
          const r = await rdap.testRdap();
          sendResponse({ ok: true, result: r });
          break;
        }
        case 'kw:testTech': {
          const r = await techDetect.testTech();
          sendResponse({ ok: true, result: r });
          break;
        }
        case 'kw:testOpenPageRank': {
          const r = await trafficRank.testOpenPageRank();
          sendResponse({ ok: true, result: r });
          break;
        }
        case 'kw:testMoz': {
          const r = await moz.testMoz();
          sendResponse({ ok: true, result: r });
          break;
        }
        case 'kw:clearCache': {
          const all = await chrome.storage.local.get(null);
          const doomed = Object.keys(all).filter(k => k.startsWith('c:'));
          await chrome.storage.local.remove(doomed);
          sendResponse({ ok: true, removed: doomed.length });
          break;
        }
        default:
          sendResponse({ ok: false, error: `unknown message: ${msg?.type}` });
      }
    } catch (err) {
      sendResponse({ ok: false, error: String(err?.message || err) });
    }
  })();
  return true; // async sendResponse
});

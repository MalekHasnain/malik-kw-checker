// KW Checker — CMS / Framework detection
// 100% Free, zero API keys required.
// Fetches lightweight head/generator markers with aggressive caching (7 days).

import { cacheGet, cacheSet } from './cache.js';
import { getBaseDomain } from './rdap.js';

const TTL = 7 * 24 * 60 * 60 * 1000; // 7 days
const ERR_TTL = 30 * 60_000;         // 30 min on error
const FETCH_TIMEOUT = 3500;          // 3.5s max timeout

const inFlight = new Map();

function fetchSnippet(url, timeoutMs = FETCH_TIMEOUT) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, {
    headers: { 'Accept': 'text/html,text/plain,*/*' },
    signal: controller.signal,
    redirect: 'follow'
  })
    .then(async res => {
      if (!res.ok) return { ok: false, status: res.status, text: '', headers: res.headers };
      const reader = res.body?.getReader();
      if (!reader) {
        const text = await res.text();
        return { ok: true, text: text.slice(0, 10000), headers: res.headers };
      }
      let chunk = '';
      const decoder = new TextDecoder();
      while (chunk.length < 10000) {
        const { done, value } = await reader.read();
        if (done || !value) break;
        chunk += decoder.decode(value, { stream: true });
      }
      reader.cancel().catch(() => {});
      return { ok: true, text: chunk, headers: res.headers };
    })
    .catch(() => ({ ok: false, text: '', headers: null }))
    .finally(() => clearTimeout(timer));
}

function detectFramework(html, headers) {
  if (!html && !headers) return null;
  const lower = (html || '').toLowerCase();
  const server = headers?.get('server')?.toLowerCase() || '';
  const powered = headers?.get('x-powered-by')?.toLowerCase() || '';

  if (lower.includes('wp-content') || lower.includes('wp-includes') || lower.includes('name="generator" content="wordpress') || powered.includes('wordpress')) {
    return 'WordPress';
  }
  if (lower.includes('cdn.shopify.com') || lower.includes('window.shopify') || lower.includes('shopify.theme')) {
    return 'Shopify';
  }
  if (lower.includes('_next/static') || lower.includes('__next_data__')) {
    return 'Next.js';
  }
  if (lower.includes('assets.website-files.com') || lower.includes('data-wf-site') || lower.includes('webflow.com')) {
    return 'Webflow';
  }
  if (lower.includes('static.wixstatic.com') || lower.includes('wix.com')) {
    return 'Wix';
  }
  if (lower.includes('static1.squarespace.com') || lower.includes('squarespace.com')) {
    return 'Squarespace';
  }
  if (lower.includes('_nuxt') || lower.includes('__nuxt__')) {
    return 'Nuxt.js';
  }
  if (lower.includes('name="generator" content="ghost') || lower.includes('ghost.io')) {
    return 'Ghost';
  }
  if (lower.includes('drupal.js') || lower.includes('drupal.settings')) {
    return 'Drupal';
  }
  if (server.includes('cloudflare')) {
    return 'Cloudflare';
  }
  return null;
}

export async function detectTech(domain) {
  const root = getBaseDomain(domain);
  if (!root) return { domain, framework: null };

  const key = `tech:${root}`;
  const prior = await cacheGet(key);
  if (prior) return { domain, framework: prior.framework || null };

  if (inFlight.has(key)) {
    const shared = await inFlight.get(key);
    return { domain, framework: shared?.framework || null };
  }

  const p = (async () => {
    try {
      const homeRes = await fetchSnippet(`https://${root}/`, 3500);
      const framework = detectFramework(homeRes.text, homeRes.headers);
      const value = { framework };
      await cacheSet(key, value, TTL);
      return value;
    } catch {
      await cacheSet(key, { framework: null }, ERR_TTL);
      return { framework: null };
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, p);
  const res = await p;
  return { domain, framework: res.framework || null };
}

export async function testTech() {
  const r = await detectTech('shopify.com');
  return r;
}

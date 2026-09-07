// KW Checker — settings storage (chrome.storage.local)

const DEFAULTS = {
  googleClientId: '',      // OAuth 2.0 Web client ID (…apps.googleusercontent.com)
  developerToken: '',      // Google Ads API developer token
  customerId: '',          // Google Ads customer ID (XXX-XXX-XXXX), no dashes needed
  loginCustomerId: '',     // Manager account CID if the developer token came from a manager account
  ahrefsKey: '',           // Ahrefs APIv3 key (free) for domain-rating-free
  apiVersion: 'v25'        // Google Ads API version
};

export async function getSettings() {
  const stored = await chrome.storage.local.get('settings');
  return { ...DEFAULTS, ...(stored.settings || {}) };
}

export async function saveSettings(patch) {
  const current = await getSettings();
  const next = { ...current, ...patch };
  await chrome.storage.local.set({ settings: next });
  return next;
}

export function isGoogleConfigured(s) {
  return Boolean(s.googleClientId && s.developerToken && s.customerId);
}

export function isAhrefsConfigured(s) {
  return Boolean(s.ahrefsKey);
}

export function normalizeCustomerId(cid) {
  return String(cid || '').replace(/[^0-9]/g, '');
}

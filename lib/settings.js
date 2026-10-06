// Malik Kw Checker — only the Ahrefs credential is needed.
export async function getSettings() {
  const { settings } = await chrome.storage.local.get('settings');
  return { ahrefsKey: settings?.ahrefsKey || '' };
}
export async function saveSettings(patch) {
  const settings = await getSettings();
  if (typeof patch.ahrefsKey === 'string') settings.ahrefsKey = patch.ahrefsKey.trim();
  await chrome.storage.local.set({ settings });
  return settings;
}
export const isAhrefsConfigured = s => Boolean(s.ahrefsKey);

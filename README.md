# Malik Kw Checker

**Domain insights, right where you search.** By [Malik Hasnain](https://www.facebook.com/MalikHasnain22/).

A focused Chrome extension with exactly two research features on Google search results:

- **Ahrefs Domain Rating (DR)** — requires your Ahrefs APIv3 key.
- **Site Age** — uses domain registration dates from RDAP with WHOIS fallback; no key required. Registration age does not indicate when a website first published content.

Keeps the navy-and-teal design, expandable settings cards, and Malik Hasnain branding from KW Checker. Domain Rating attribution: [Ahrefs](https://ahrefs.com/).

## Download and install

1. Open [this repository](https://github.com/MalekHasnain/malik-kw-checker), choose **Code → Download ZIP**, or [download the ZIP directly](https://github.com/MalekHasnain/malik-kw-checker/archive/refs/heads/main.zip).
2. Extract the ZIP to a permanent folder.
3. Open `chrome://extensions` in desktop Chrome and enable **Developer mode**.
4. Click **Load unpacked** and select the extracted folder containing `manifest.json` (usually `malik-kw-checker-main`).
5. Pin **Malik Kw Checker** from Chrome’s Extensions puzzle menu.
6. Open the popup, paste your Ahrefs key, and click **Save settings**. See [credential setup](CREDENTIALS.md).
7. Search on Google. **DR** and **Age** badges appear beside supported organic results. Site Age works even without an Ahrefs key. Hover over badges for source or error details; click for domain details.

To update, replace the installed folder’s files with the latest extracted ZIP, click **Reload** at `chrome://extensions`, and refresh your Google results tabs. Keep the folder in place.

If Chrome reports a missing manifest, select the inner extracted folder containing `manifest.json`, not the ZIP or its parent folder. If results do not show after installation, reload the Google results page. If you also installed the original KW Checker, disable it to avoid overlapping panels.

## Data and permissions

The extension stores the Ahrefs key and cached results locally in Chrome. It sends result domains to Ahrefs (when configured) and registration providers for lookup. HTTPS access supports the different RDAP registries and WHOIS fallbacks. It does not need Google sign-in or Google Ads credentials.

DR is cached for 24 hours. Registration data is cached for up to a year and the displayed age is recalculated from the date. Missing records, unsupported domains, provider errors, or rate limits can leave badges unavailable. Use **Test connection** or **Clear cache** in the popup to troubleshoot.

## Creator

**Malik Hasnain** · [Connect on Facebook](https://www.facebook.com/MalikHasnain22/)

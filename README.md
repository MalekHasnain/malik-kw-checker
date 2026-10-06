# KW Checker

**SEO insights, right where you search.** Created by [Malik Hasnain](https://www.facebook.com/MalikHasnain22/).

Personal Chrome extension that shows **SEO and competitive intelligence data on Google results**:

- **Search volume, CPC, competition, 12-month trend** for the query you searched
- **Related keywords table** (top ~20 ideas) with **CSV export**
- Per-result badges on the header row:
  - **Ahrefs Domain Rating (DR)**
  - **Moz Domain Authority (DA)** & Page Authority (PA)
  - **Site Age** (RDAP + WHOIS fallback for ccTLDs/subdomains)
  - **Global Traffic Rank** & PageRank (Open PageRank)
  - **CMS / Framework** (WordPress, Shopify, Next.js, Webflow, etc.)

All data sources are free or offer generous free tiers:

| Data | Source | Cost | Key needed |
|---|---|---|---|
| Volume / CPC / competition / ideas | Google Ads API `generateKeywordIdeas` | free | OAuth + developer token |
| Domain Rating | Ahrefs `v3/public/domain-rating-free` | free | free APIv3 key |
| Site age | RDAP + WHOIS fallback | free | none |
| CMS / Framework | Built-in head/meta detection | free | none |
| Traffic Rank & PageRank | Open PageRank API (Keywords Everywhere) | free (100k calls/mo) | free API key |
| Domain Authority (DA) | Mozscape API v2 | free tier | free Moz token |

Attribution: Domain Rating by [Ahrefs](https://ahrefs.com/) (license: ahrefs.com/legal/domain-rating-license).

## Download ZIP and install in Chrome

1. Visit [this repository](https://github.com/MalekHasnain/kw-checker), click the green **Code** button, then **Download ZIP**. You can also [download the latest main-branch ZIP](https://github.com/MalekHasnain/kw-checker/archive/refs/heads/main.zip).
2. **Extract / unzip** the downloaded file into a permanent folder. Chrome loads the extracted files, not the ZIP itself.
3. In desktop Chrome, type `chrome://extensions` into the address bar and press Enter.
4. Turn on **Developer mode** in the top-right corner.
5. Click **Load unpacked** and select the extracted **kw-checker-main** folder that contains `manifest.json`. If you see another folder inside, open it until you find that file.
6. Open Chrome’s **Extensions** (puzzle) menu and **pin KW Checker** to your toolbar.
7. Click the KW icon. Expand the data source you want, enter credentials, and choose **Save settings**. For Google Ads, also click **Connect Google**. Follow the [credentials guide](CREDENTIALS.md) for provider setup.
8. Search on Google to see the keyword panel and result badges. Use **Test connection** in the popup to check a provider.

Site age and CMS/framework detection need no API key. Other metrics need their corresponding provider credentials. This is a manually installed extension, not a Chrome Web Store listing.

**Updating:** Download and extract the new ZIP, replace the files in your existing extension folder, then click **Reload** on KW Checker at `chrome://extensions`. Refresh open Google results tabs. Keep the installed folder in place; Chrome needs those files.

**Troubleshooting:** “Manifest file is missing” usually means you selected the ZIP or its parent folder. Select the extracted folder containing `manifest.json`. Missing metrics? Save the relevant credentials, connect Google if needed, and run the provider’s test.

Installation follows [Chrome’s official unpacked-extension guide](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked).

## Creator

Built by **Malik Hasnain**. [Connect on Facebook](https://www.facebook.com/MalikHasnain22/).

## Architecture

```
kw-checker/
├── manifest.json              MV3; content script on Google SERPs (58 TLDs)
├── background/
│   └── service-worker.js      message router; parallel analyze() pipeline
├── lib/
│   ├── settings.js            chrome.storage.local settings
│   ├── cache.js               TTL cache + negative caching (429 backoff)
│   ├── oauth.js               Google OAuth 2.0, auth-code + PKCE via chrome.identity
│   ├── google-ads.js          generateKeywordIdeas REST call (v25, configurable)
│   ├── ahrefs.js              domain-rating-free + 24h cache + 429 backoff
│   ├── rdap.js                subdomain normalization, RDAP + dual WHOIS fallback
│   ├── tech-detect.js         CMS and frontend framework detection
│   ├── traffic-rank.js        Open PageRank API (supports opr_live_ keys)
│   └── moz.js                 Mozscape API v2 for DA and PA
├── content/
│   ├── content.js             SERP widget + result badges + CSV export
│   └── content.css            light/dark styles + color-coded pills
├── popup/                     settings UI with direct links under each field
└── icons/                     high-visibility KW extension icon
```

### Caching

- Keyword metrics: **30 days**
- Traffic Rank: **30 days**
- CMS / Framework: **7 days**
- DR & Moz DA: **24 h**
- Site age: **forever** (registration date never changes)
- Errors/429: negative-cached 5–10 min to avoid rate-limiting

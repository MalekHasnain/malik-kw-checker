# KW Checker — Credential Setup (Phase 0), full URL walkthrough

One-time, free. Do Ahrefs first (works immediately), Google Ads second (approval wait).
Paste every value into the KW Checker popup (extension icon → KW Checker).

> Before Google OAuth setup: load the extension and copy your **Extension ID**
> from `chrome://extensions` (e.g. `abcdefghijklmnopqrstuvwxyz123456`). You'll need it once.

---

## A — Ahrefs API key (5 minutes, instant)

**A1. Create the free account**
- URL: https://app.ahrefs.com/auth/signup
- Click: *Sign up* (email + password, or Google sign-in). No card required.

**A2. Generate the API key**
- URL: https://app.ahrefs.com/account/api-keys
- Click: *Generate API key* → copy it.

**A3. Paste into KW Checker**
- Click the puzzle icon in Chrome → KW Checker (pin it).
- Field **APIv3 Key** → paste → click **Save** → click **Test**.
- Expected: `✓ ahrefs.com DR 8x`

Done. DR badges now work on Google searches.

---

## B — Google Ads API (three values: Customer ID, Developer Token, OAuth Client ID)

### B1. Google Ads account + Customer ID (10 min)

**B1a. Manager account (recommended — this is where developer tokens live)**
- URL: https://ads.google.com/home/tools/manager-accounts/
- Click: *Create a manager account* → sign in with your Google account
- Name it anything (e.g. "Personal Tools"), finish the wizard. No billing needed.

**B1b. Your Customer ID**
- It's the `XXX-XXX-XXXX` number in the top-right of https://ads.google.com/
- Note it — that's your **Customer ID** and, since it's a manager account, also your **Login Customer ID**.

### B2. Developer token (5 min + approval wait)

- URL (while signed into the manager account): https://ads.google.com/aw/apicenter
- Click: *Apply for basic access*
- Fill the form:
  - **Website**: any honest URL you own (e.g. your blog)
  - **Estimated monthly API calls**: `5000`
  - **Use case description** (paste this):
    > Personal-use Chrome browser extension for keyword research. Uses only the
    > Keyword Planning service (generateKeywordIdeas) to display search volume,
    > CPC and competition for the query being searched. Under 5,000 calls/month,
    > no data resale or redistribution.
- Submit. The **developer token** string appears immediately in API Center — copy it.
- Basic-access approval usually takes a few hours to a few days. Until approved,
  the popup Test shows `DEVELOPER_TOKEN_NOT_APPROVED` — everything else works meanwhile.

### B3. OAuth Client ID (10 min)

**B3a. Create a Google Cloud project**
- URL: https://console.cloud.google.com/
- Click the project dropdown (top bar) → *New project* → name `kw-checker` → *Create* → select it.

**B3b. Enable the Google Ads API**
- URL: https://console.cloud.google.com/apis/library/googleads.googleapis.com
- Confirm the `kw-checker` project is selected (top bar) → click **Enable**.

**B3c. OAuth consent screen**
- URL: https://console.cloud.google.com/apis/credentials/consent
- Click: *Get started* / *Configure consent screen*
  - App name: `KW Checker` · user support + developer email: yours
  - Audience: **External**
  - Finish. Then on the consent page click **Audience → Test users → + Add users** → add your own Gmail address.

**B3d. Create the OAuth client**
- URL: https://console.cloud.google.com/apis/credentials
- Click: **+ Create credentials → OAuth client ID**
  - Application type: **Web application**
  - Name: `KW Checker`
  - **Authorized redirect URIs** → *Add URI*:
    `https://YOUR-EXTENSION-ID.chromiumapp.org/`
    (replace `YOUR-EXTENSION-ID` with the ID from `chrome://extensions`)
- Click **Create** → copy the **Client ID** (`…apps.googleusercontent.com`).

### B4. Wire it into KW Checker

In the popup (Google Ads API section):
1. **OAuth Client ID** → paste from B3d
2. **Developer Token** → paste from B2
3. **Customer ID** → your manager CID from B1b
4. **Login Customer ID** → same manager CID (token lives on the manager account)
5. **Save** → **Connect Google** → a Google window opens → sign in → you may see
   *"This app isn't verified"* → click **Continue** (normal for personal test apps) → **Allow**.
6. **Test** → expected: `✓ "coffee" vol 100K+ / Low` (after basic-access approval).

---

## Verification order

| Step | Test | Expected |
|---|---|---|
| A | Ahrefs Test | `✓ ahrefs.com DR 8x` |
| B | RDAP Test | `✓ google.com age 28y 11m` |
| C | Google Test | `✓ "coffee" vol … / Low` |

Then search anything on Google: widget above results, `DR 87 · 14y` badges on each result.

## Troubleshooting

| Error | Fix |
|---|---|
| `DEVELOPER_TOKEN_NOT_APPROVED` | Wait for approval (B2). DR/age badges work meanwhile. |
| `redirect_uri_mismatch` | Redirect URI in B3d must exactly match `https://<ext-id>.chromiumapp.org/` |
| `USER_PERMISSION_DENIED` | Wrong Login Customer ID — use the manager CID in both ID fields |
| "This app isn't verified" | Advanced → continue — fine for test users |
| Volume shows `0`/`10` | Google-side bucketing without ad spend; not fixable for free |

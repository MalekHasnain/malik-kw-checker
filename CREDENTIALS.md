# Malik Kw Checker setup

## Ahrefs Domain Rating

1. Sign in to [Ahrefs](https://app.ahrefs.com/account/api-keys) and obtain an APIv3 key with access to its public Domain Rating endpoint. Availability is subject to your Ahrefs account and provider terms.
2. Open **Malik Kw Checker** from Chrome’s toolbar.
3. Paste the key into **APIv3 Key**, then click **Save settings**.
4. Click **Test connection** to check Domain Rating for ahrefs.com.

Saved keys are masked. To replace a key, enter the new value and save. A blank field leaves the existing key unchanged. Keys are stored in Chrome’s local extension storage and sent to Ahrefs only for the DR lookup.

If a test fails, check the key, account access, and the displayed error. Rate-limit and lookup errors may be cached briefly. Wait a few minutes or use **Storage → Clear cache** after correcting your credentials.

## Site Age

No key or sign-in is needed. Expand **Site Age** and click **Test connection** to check google.com. Age is calculated from the domain’s registration date using RDAP and WHOIS fallback providers. Some registration records are unavailable; an unavailable age is shown as a dash.

By [Malik Hasnain](https://www.facebook.com/MalikHasnain22/).

// background.js (MV3 background script)

// 1) Capture tokens from real network requests (Bearer/CSRF/Guest)
browser.webRequest.onBeforeSendHeaders.addListener(
  async (details) => {
    const h = details.requestHeaders || [];
    let bearer = null;
    let csrf = null;
    let guest = null;

    for (const header of h) {
      const name = header.name.toLowerCase();
      const val = header.value || "";

      if (name === "authorization" && val.startsWith("Bearer ")) {
        bearer = val.slice("Bearer ".length).trim();
      } else if (name === "x-csrf-token" && val) {
        csrf = val.trim();
      } else if (name === "x-guest-token" && val) {
        guest = val.trim();
      }
    }

    const toStore = {};
    if (bearer) toStore.twBearer = bearer;
    if (csrf) toStore.twCsrf = csrf;
    if (guest) toStore.twGuestToken = guest;

    if (Object.keys(toStore).length) {
      await browser.storage.local.set(toStore);
    }
  },
  {
    urls: ["https://x.com/*", "https://twitter.com/*", "https://api.twitter.com/*"]
  },
  ["requestHeaders"]
);

// 2) Capture TweetDetail queryId from real request URL
// Example: https://x.com/i/api/graphql/Pn68XRZwyV9ClrAEmK8rrQ/TweetDetail?... [web:155]
browser.webRequest.onBeforeRequest.addListener(
  async (details) => {
    try {
      const url = details.url || "";
      // Match /i/api/graphql/<queryId>/TweetDetail
      const m = url.match(/\/i\/api\/graphql\/([^/]+)\/TweetDetail(\?|$)/);
      if (!m) return;

      const queryId = m[1];
      const apiBase = url.startsWith("https://x.com/")
        ? "https://x.com"
        : "https://twitter.com";

      await browser.storage.local.set({
        twTweetDetailQueryId: queryId,
        twApiBase: apiBase
      });
    } catch (e) {
      // ignore
    }
  },
  {
    urls: ["https://x.com/i/api/graphql/*", "https://twitter.com/i/api/graphql/*"]
  }
);

// 3) Downloads only
browser.runtime.onMessage.addListener((msg) => {
  if (msg.action === "DOWNLOAD_MEDIA") {
    return browser.downloads.download({
      url: msg.url,
      filename: msg.filename,
      saveAs: true,
      conflictAction: "uniquify"
    });
  }
});

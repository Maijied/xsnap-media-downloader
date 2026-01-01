// background.js (Opera/Chrome MV3 version)

// 1) Capture tokens from real network requests (Bearer/CSRF/Guest)
chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
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

    if (bearer || csrf || guest) {
      const toStore = {};
      if (bearer) toStore.twBearer = bearer;
      if (csrf) toStore.twCsrf = csrf;
      if (guest) toStore.twGuestToken = guest;
      chrome.storage.local.set(toStore);
    }
  },
  {
    urls: ["https://x.com/*", "https://twitter.com/*", "https://api.twitter.com/*"]
  },
  ["requestHeaders", "extraHeaders"]
);

// 2) Capture TweetDetail queryId from real request URL
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    try {
      const url = details.url || "";
      const m = url.match(/\/i\/api\/graphql\/([^/]+)\/TweetDetail(\?|$)/);
      if (!m) return;

      const queryId = m[1];
      const apiBase = url.startsWith("https://x.com/")
        ? "https://x.com"
        : "https://twitter.com";

      chrome.storage.local.set({
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

// 3) Downloads
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "DOWNLOAD_MEDIA") {
    chrome.downloads.download({
      url: msg.url,
      filename: msg.filename,
      saveAs: true,
      conflictAction: "uniquify"
    });
  }
});

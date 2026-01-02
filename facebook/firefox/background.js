browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "DOWNLOAD_MEDIA") {
        browser.downloads.download({
            url: msg.url,
            filename: msg.filename || "facebook-video.mp4",
            saveAs: true,
            conflictAction: "uniquify"
        });
    }
});

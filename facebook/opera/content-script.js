// FSnap - Facebook Media Downloader Content Script (v1.0.7 - Improved Detection)

const observer = new MutationObserver(() => {
    clearTimeout(window.fsnapTimeout);
    window.fsnapTimeout = setTimeout(tryInjectButtons, 600);
});

observer.observe(document.documentElement || document.body, {
    childList: true,
    subtree: true
});

window.addEventListener("load", tryInjectButtons);

function tryInjectButtons() {
    // 1. VIDEOS (Highest Priority)
    document.querySelectorAll("video").forEach((video) => {
        // Facebook Reel/Short/Theater containers
        const container = video.closest('div[role="button"]') ||
            video.closest('div[data-viewport-type]') ||
            video.closest('div[class*="x1y1z1"]') ||
            video.parentElement;

        if (container && !container.querySelector(".fsnap-download-btn")) {
            // Check if this is a Reel
            const isReel = !!window.location.href.includes('reels') || !!video.closest('div[style*="aspect-ratio: 9 / 16"]');

            // Mark the container AND all parents up to 3 levels to block the image downloader
            let current = container;
            for (let i = 0; i < 3; i++) {
                if (current) {
                    current.setAttribute('data-fsnap-video-zone', 'true');
                    current = current.parentElement;
                }
            }

            addButton(container, { type: 'video', element: video, isReel });
        }
    });

    // 2. IMAGES (Lower Priority)
    document.querySelectorAll('img[src*="fbcdn"]').forEach((img) => {
        // Strict exclusions for video posters/thumnails
        if (img.width < 100 || img.height < 100) return;

        // If image is inside a known video zone, skip it
        if (img.closest('[data-fsnap-video-zone="true"]') || img.closest('video')) return;

        if (img.classList.contains('fsnap-scanned')) return;
        img.classList.add('fsnap-scanned');

        let targetContainer = img.parentElement;
        // Find the best link or image wrapper
        const wrapper = img.closest('div[role="link"]') || img.closest('div[role="img"]');
        if (wrapper) targetContainer = wrapper;

        if (targetContainer && !targetContainer.querySelector(".fsnap-download-btn")) {
            addButton(targetContainer, { type: 'image', element: img });
        }
    });
}

function addButton(container, media) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "fsnap-download-btn";
    btn.title = `Download with FSnap`;
    btn.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 15V3M12 15L8 11M12 15L16 11M2 17V19C2 20.1046 2.89543 21 4 21H20C21.1046 21 22 20.1046 22 19V17" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;

    const isVideo = media.type === 'video';

    Object.assign(btn.style, {
        position: "absolute",
        top: isVideo ? "15px" : "10px",
        right: isVideo ? "15px" : "10px",
        zIndex: 2147483647,
        width: "40px", height: "40px", borderRadius: "50%", border: "none",
        background: isVideo ? "rgba(24, 119, 242, 0.95)" : "rgba(255, 255, 255, 0.95)",
        color: isVideo ? "#fff" : "#1877F2",
        display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
        boxShadow: "0 4px 15px rgba(0,0,0,0.4)", transition: "all 0.2s", pointerEvents: "auto", backdropFilter: "blur(4px)"
    });

    if (!isVideo) btn.querySelector('path').setAttribute('stroke', '#1877F2');

    const cs = getComputedStyle(container);
    if (cs.position === "static") container.style.position = "relative";

    btn.addEventListener("click", async (e) => {
        e.preventDefault(); e.stopPropagation();
        if (isVideo) handleVideoDownload(media.element);
        else handleImageDownload(media.element);
    }, true);

    container.appendChild(btn);
}

async function handleImageDownload(img) {
    downloadFile(img.src, `fsnap-photo-${Date.now()}.jpg`);
}

async function handleVideoDownload(video) {
    toast("Hunting for video...");

    let sources = await huntForVideoSources(video);

    if (sources.length === 0) {
        toast("Deep search started...");
        sources = await deepPageSearch();
    }

    if (sources.length === 0) {
        // Last ditch effort: scan for any playable_url in the whole page
        sources = await bruteForceSearch();
    }

    if (sources.length === 0) {
        toast("Source not found. Please reload or click HD in player.");
        return;
    }

    if (sources.length === 1) {
        downloadFile(sources[0].url, `fsnap-video-${sources[0].quality}.mp4`);
    } else {
        showQualityChooser(sources);
    }
}

async function huntForVideoSources(video) {
    const found = [];
    const videoId = findVideoId(video);
    const scripts = Array.from(document.querySelectorAll('script'));

    for (const script of scripts) {
        const text = script.textContent;
        if (!text) continue;

        // Brute force quality extraction relative to video ID
        if (videoId && text.includes(videoId)) {
            const index = text.indexOf(videoId);
            // Search in a large window around the ID
            const chunk = text.substring(Math.max(0, index - 10000), index + 40000);
            extractAdvanced(chunk, found);
            if (found.length > 0) break;
        }
    }
    return Array.from(new Map(found.map(item => [item.url, item])).values());
}

async function deepPageSearch() {
    const found = [];
    const scripts = Array.from(document.querySelectorAll('script'));
    // Scan all scripts with regex
    scripts.forEach(s => {
        if (s.textContent) extractAdvanced(s.textContent, found);
    });
    return Array.from(new Map(found.map(item => [item.url, item])).values());
}

async function bruteForceSearch() {
    const found = [];
    extractAdvanced(document.documentElement.innerHTML, found);
    return Array.from(new Map(found.map(item => [item.url, item])).values());
}

function extractAdvanced(text, list) {
    if (!text) return;

    // Comprehensive patterns for Facebook video sources
    const qualityPatterns = [
        { q: 'HD', keys: ['browser_native_hd_url', 'playable_url_quality_hd', 'hd_src', 'hd_src_no_ratelimit'] },
        { q: 'SD', keys: ['browser_native_sd_url', 'playable_url', 'sd_src', 'sd_src_no_ratelimit'] }
    ];

    qualityPatterns.forEach(p => {
        p.keys.forEach(key => {
            const regex = new RegExp(`"${key}":"(https:[^"]+)"`, 'g');
            let match;
            while ((match = regex.exec(text)) !== null) {
                const url = sanitize(match[1]);
                if (url.includes('fbcdn.net') && !list.some(x => x.url === url)) {
                    list.push({ quality: p.q, url });
                }
            }
        });
    });

    // Special handles for DASH/Representations if they appear near our ID
    // FB sometimes uses "representations":[{"base_url":"..."}]
    const dashMatch = text.match(/"base_url":"(https:[^"]+fbcdn[^"]+)"/g);
    if (dashMatch) {
        dashMatch.forEach(m => {
            const url = sanitize(m.match(/"base_url":"([^"]+)"/)[1]);
            if (!list.some(x => x.url === url)) {
                // Usually first one is highest quality?
                list.push({ quality: list.length === 0 ? 'HD' : 'SD', url });
            }
        });
    }

    list.sort((a, b) => (a.quality === 'HD' ? -1 : 1));
}

function sanitize(url) {
    return url.replace(/\\/g, '').replace(/&amp;/g, '&');
}

function findVideoId(video) {
    let curr = video;
    while (curr && curr !== document.body) {
        const id = curr.getAttribute('data-video-id') ||
            curr.getAttribute('id')?.replace('v_', '') ||
            curr.getAttribute('data-id');

        if (id && /^\d+$/.test(id)) return id;
        curr = curr.parentElement;
    }

    // Reels URL check: facebook.com/reel/12345678 or facebook.com/shorts/12345678
    const urlMatch = window.location.href.match(/\/(?:videos|reels|watch|shorts)\/(\d+)/);
    if (urlMatch) return urlMatch[1];

    return null;
}

function downloadFile(url, filename) {
    const api = typeof browser !== 'undefined' ? browser : chrome;
    api.runtime.sendMessage({ action: "DOWNLOAD_MEDIA", url, filename });
    toast("Download started!");
}

function showQualityChooser(sources) {
    const existing = document.querySelector(".fsnap-chooser");
    if (existing) existing.remove();
    const chooser = document.createElement("div");
    chooser.className = "fsnap-chooser";
    Object.assign(chooser.style, {
        position: "fixed", left: "50%", top: "50%", transform: "translate(-50%, -50%)",
        zIndex: 2147483647, background: "#fff", color: "#1c1e21", padding: "20px",
        borderRadius: "12px", boxShadow: "0 12px 30px rgba(0,0,0,0.6)", display: "flex", flexDirection: "column", gap: "10px", minWidth: "220px", fontFamily: "Segoe UI, Arial, sans-serif"
    });

    const title = document.createElement("div");
    title.textContent = "Multiple Qualities Found";
    title.style.fontWeight = "bold";
    chooser.appendChild(title);

    sources.forEach(src => {
        const btn = document.createElement("button");
        btn.textContent = `${src.quality} Download`;
        Object.assign(btn.style, { padding: "12px", borderRadius: "8px", border: "1px solid #ddd", background: "#f0f2f5", cursor: "pointer", fontWeight: "600" });
        btn.onclick = () => { downloadFile(src.url, `fsnap-video-${src.quality}.mp4`); chooser.remove(); overlay.remove(); };
        chooser.appendChild(btn);
    });

    const overlay = document.createElement("div");
    Object.assign(overlay.style, { position: "fixed", top: 0, left: 0, width: "100%", height: "100%", background: "rgba(0,0,0,0.7)", zIndex: 2147483646 });
    overlay.onclick = () => { chooser.remove(); overlay.remove(); };
    document.body.appendChild(overlay); document.body.appendChild(chooser);
}

function toast(message) {
    const old = document.querySelector(".fsnap-toast"); if (old) old.remove();
    const el = document.createElement("div"); el.className = "fsnap-toast"; el.textContent = message;
    Object.assign(el.style, { position: "fixed", left: "50%", bottom: "12%", transform: "translateX(-50%)", zIndex: 2147483647, background: "#1c1e21", color: "#fff", padding: "12px 24px", borderRadius: "24px", fontSize: "14px", fontWeight: "500", boxShadow: "0 4px 12px rgba(0,0,0,0.4)" });
    document.body.appendChild(el); setTimeout(() => { el.style.opacity = "0"; el.style.transition = "opacity 0.5s"; setTimeout(() => el.remove(), 500); }, 3000);
}

document.head.insertAdjacentHTML('beforeend', `<style>.fsnap-toast { animation: fsnap-fadein 0.3s ease-out; } @keyframes fsnap-fadein { from { opacity: 0; transform: translate(-50%, 20px); } to { opacity: 1; transform: translate(-50%, 0); } }</style>`);

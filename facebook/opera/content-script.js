// FSnap - Facebook Media Downloader Content Script (v1.1.2 - Resolution Format Fix)

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
        const container = video.closest('div[role="button"]') ||
            video.closest('div[data-viewport-type]') ||
            video.closest('div[class*="x1y1z1"]') ||
            video.parentElement;

        if (container && !container.querySelector(".fsnap-download-btn")) {
            let current = container;
            for (let i = 0; i < 3; i++) {
                if (current) {
                    current.setAttribute('data-fsnap-video-zone', 'true');
                    current = current.parentElement;
                }
            }
            addButton(container, { type: 'video', element: video });
        }
    });

    // 2. IMAGES (Lower Priority)
    document.querySelectorAll('img[src*="fbcdn"]').forEach((img) => {
        if (img.width < 100 || img.height < 100) return;
        if (img.closest('[data-fsnap-video-zone="true"]') || img.closest('video')) return;
        if (img.classList.contains('fsnap-scanned')) return;
        img.classList.add('fsnap-scanned');

        let targetContainer = img.parentElement;
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
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 15V3M12 15L8 11M12 15L16 11M2 17V19C2 20.1046 2.89543 21 4 21H20C21.1046 21 22 20.1046 22 19V17" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;

    const isVideo = media.type === 'video';

    Object.assign(btn.style, {
        position: "absolute", top: isVideo ? "15px" : "10px", right: isVideo ? "15px" : "10px", zIndex: 2147483647,
        width: "40px", height: "40px", borderRadius: "50%", border: "none",
        background: isVideo ? "rgba(24, 119, 242, 0.95)" : "rgba(255, 255, 255, 0.95)",
        color: isVideo ? "#fff" : "#1877F2",
        display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
        boxShadow: "0 4px 15px rgba(0,0,0,0.4)", transition: "all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)", pointerEvents: "auto", backdropFilter: "blur(4px)"
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
    toast("Hunting for videos...");

    let allSources = [];
    const s1 = await huntForVideoSources(video);
    const s2 = await deepPageSearch();
    const s3 = await bruteForceSearch();
    allSources = [...s1, ...s2, ...s3];

    // Deduplicate by URL
    const uniqueMap = new Map();
    allSources.forEach(s => {
        if (!uniqueMap.has(s.url)) {
            uniqueMap.set(s.url, s);
        } else {
            const existing = uniqueMap.get(s.url);
            // Prefer versions with full resolution data
            if (s.width && s.height && (!existing.width || !existing.height)) {
                uniqueMap.set(s.url, s);
            }
        }
    });

    let finalSources = Array.from(uniqueMap.values());
    finalSources.sort((a, b) => b.height - a.height);

    if (finalSources.length === 0) {
        toast("No complete videos found. Play the video and try again.");
        return;
    }

    if (finalSources.length === 1) {
        downloadFile(finalSources[0].url, `fsnap-video-${finalSources[0].height}p.mp4`);
    } else {
        showQualityChooser(finalSources);
    }
}

async function huntForVideoSources(video) {
    const found = [];
    const videoId = findVideoId(video);
    const scripts = Array.from(document.querySelectorAll('script'));
    for (const script of scripts) {
        const text = script.textContent;
        if (text && videoId && text.includes(videoId)) {
            const index = text.indexOf(videoId);
            const chunk = text.substring(Math.max(0, index - 15000), index + 50000);
            extractAdvanced(chunk, found);
        }
    }
    return found;
}

async function deepPageSearch() {
    const found = [];
    const scripts = Array.from(document.querySelectorAll('script'));
    scripts.forEach(s => { if (s.textContent) extractAdvanced(s.textContent, found); });
    return found;
}

async function bruteForceSearch() {
    const found = [];
    extractAdvanced(document.documentElement.innerHTML, found);
    return found;
}

function extractAdvanced(text, list) {
    if (!text) return;

    const keys = [
        'browser_native_hd_url', 'playable_url_quality_hd', 'hd_src', 'hd_src_no_ratelimit',
        'browser_native_sd_url', 'playable_url', 'sd_src', 'sd_src_no_ratelimit'
    ];

    keys.forEach(key => {
        const regex = new RegExp(`"${key}":"(https:[^"]+)"`, 'g');
        let match;
        while ((match = regex.exec(text)) !== null) {
            const url = sanitize(match[1]);
            if (url.includes('fbcdn.net') && !list.some(x => x.url === url)) {
                const area = text.substring(Math.max(0, match.index - 500), match.index + 500);
                const hMatch = area.match(/"height":(\d+)/) || area.match(/"height\\":(\d+)/);
                const wMatch = area.match(/"width":(\d+)/) || area.match(/"width\\":(\d+)/);

                const height = hMatch ? parseInt(hMatch[1]) : (key.includes('hd') ? 720 : 360);
                const width = wMatch ? parseInt(wMatch[1]) : (height ? Math.round(height * (16 / 9)) : 0);

                list.push({
                    label: height >= 720 ? 'HD' : 'SD',
                    width, height,
                    url
                });
            }
        }
    });

    const mp4Match = text.match(/"(https:[^"]+?\.mp4[^"]+?)"/g);
    if (mp4Match) {
        mp4Match.forEach(m => {
            const url = sanitize(m.replace(/"/g, ''));
            if (url.includes('fbcdn') && !list.some(x => x.url === url)) {
                list.push({ label: 'SD', width: 0, height: 0, url });
            }
        });
    }
}

function sanitize(url) { return url.replace(/\\/g, '').replace(/&amp;/g, '&'); }

function findVideoId(video) {
    let curr = video;
    while (curr && curr !== document.body) {
        const id = curr.getAttribute('data-video-id') || curr.getAttribute('id')?.replace('v_', '') || curr.getAttribute('data-id');
        if (id && /^\d+$/.test(id)) return id;
        curr = curr.parentElement;
    }
    const urlMatch = window.location.href.match(/\/(?:videos|reels|watch|shorts|reel)\/(\d+)/);
    return urlMatch ? urlMatch[1] : null;
}

function downloadFile(url, filename) {
    const api = typeof browser !== 'undefined' ? browser : chrome;
    api.runtime.sendMessage({ action: "DOWNLOAD_MEDIA", url, filename });
    toast("Download started!");
}

function showQualityChooser(sources) {
    const existing = document.querySelector(".fsnap-chooser-overlay");
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.className = "fsnap-chooser-overlay";
    Object.assign(overlay.style, {
        position: "fixed", top: 0, left: 0, width: "100%", height: "100%",
        background: "rgba(0,0,0,0.6)", zIndex: 2147483646, display: "flex", alignItems: "center", justifyContent: "center",
        opacity: "0", transition: "opacity 0.2s"
    });

    const modal = document.createElement("div");
    modal.className = "fsnap-chooser-modal";
    Object.assign(modal.style, {
        background: "#fff", width: "420px", maxWidth: "95%", borderRadius: "8px",
        boxShadow: "0 12px 28px rgba(0,0,0,0.2), 0 2px 4px rgba(0,0,0,0.1)",
        display: "flex", flexDirection: "column", overflow: "hidden",
        fontFamily: "Segoe UI, Roboto, Helvetica, Arial, sans-serif",
        transform: "scale(0.95)", transition: "transform 0.2s"
    });

    const header = document.createElement("div");
    Object.assign(header.style, {
        padding: "16px", borderBottom: "1px solid #ced0d4", display: "flex",
        justifyContent: "space-between", alignItems: "center"
    });

    const title = document.createElement("span");
    title.textContent = "Download Media";
    title.style.fontSize = "20px"; title.style.fontWeight = "700"; title.style.color = "#050505";

    const closeBtn = document.createElement("div");
    closeBtn.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M18 6L6 18M6 6L18 18" stroke="#65676b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    closeBtn.style.cursor = "pointer"; closeBtn.style.padding = "4px"; closeBtn.style.borderRadius = "50%";
    closeBtn.onclick = () => closePopup(overlay, modal);

    header.appendChild(title); header.appendChild(closeBtn); modal.appendChild(header);

    const scrollArea = document.createElement("div");
    scrollArea.style.maxHeight = "450px"; scrollArea.style.overflowY = "auto"; scrollArea.style.padding = "16px";
    scrollArea.style.display = "flex"; scrollArea.style.flexDirection = "column"; scrollArea.style.gap = "8px";

    sources.forEach((src) => {
        const btn = document.createElement("button");
        Object.assign(btn.style, {
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "14px 18px", borderRadius: "8px", border: "none", background: "#f0f2f5",
            cursor: "pointer", transition: "background 0.2s"
        });

        const textPart = document.createElement("div");
        textPart.style.display = "flex"; textPart.style.flexDirection = "column"; textPart.style.alignItems = "start";

        const mainText = document.createElement("span");
        // NEW FORMAT: [Quality] Quality ([Width] x [Height])
        const resText = (src.width && src.height) ? ` (${src.width} x ${src.height})` : "";
        mainText.textContent = `${src.label} Quality${resText}`;
        mainText.style.fontWeight = "600"; mainText.style.fontSize = "16px"; mainText.style.color = "#050505";

        const subText = document.createElement("span");
        subText.textContent = `High Quality Video • Includes Audio`;
        subText.style.fontSize = "12px"; subText.style.color = "#65676b";

        textPart.appendChild(mainText); textPart.appendChild(subText);

        const iconPart = document.createElement("div");
        iconPart.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 3V15M12 15L8 11M12 15L16 11" stroke="#1877f2" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

        btn.appendChild(textPart); btn.appendChild(iconPart);
        btn.onmouseenter = () => btn.style.background = "#e4e6eb";
        btn.onmouseleave = () => btn.style.background = "#f0f2f5";
        btn.onclick = () => { downloadFile(src.url, `fsnap-video-${src.height || 'media'}.mp4`); closePopup(overlay, modal); };
        scrollArea.appendChild(btn);
    });

    modal.appendChild(scrollArea); overlay.appendChild(modal); document.body.appendChild(overlay);

    requestAnimationFrame(() => {
        overlay.style.opacity = "1";
        modal.style.transform = "scale(1)";
    });
}

function closePopup(overlay, modal) {
    overlay.style.opacity = "0";
    modal.style.transform = "scale(0.95)";
    setTimeout(() => overlay.remove(), 200);
}

function toast(message) {
    const old = document.querySelector(".fsnap-toast"); if (old) old.remove();
    const el = document.createElement("div"); el.className = "fsnap-toast"; el.textContent = message;
    Object.assign(el.style, {
        position: "fixed", left: "20px", bottom: "20px", zIndex: 2147483647,
        background: "#1c1e21", color: "#fff", padding: "12px 20px", borderRadius: "8px",
        fontSize: "14px", fontWeight: "600", boxShadow: "0 8px 24px rgba(0,0,0,0.2)"
    });
    document.body.appendChild(el);
    setTimeout(() => { el.style.opacity = "0"; el.style.transition = "opacity 0.5s"; setTimeout(() => el.remove(), 500); }, 4000);
}

document.head.insertAdjacentHTML('beforeend', `<style>.fsnap-toast { animation: fsnap-slidein 0.3s ease-out; } @keyframes fsnap-slidein { from { opacity: 0; transform: translateX(-20px); } to { opacity: 1; transform: translateX(0); } }</style>`);

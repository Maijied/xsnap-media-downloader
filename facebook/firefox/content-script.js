// FSnap - Facebook Media Downloader Content Script (v1.1.11 - High-Res Priority)

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
    toast("🔍 Hunting for high-quality video...");
    const videoId = findVideoId(video);
    console.log("FSnap: Found Video ID:", videoId);

    let allSources = [];
    const scripts = Array.from(document.querySelectorAll('script'));

    // First pass: look in scripts with ID filter
    for (const script of scripts) {
        const text = script.textContent;
        if (text && videoId && text.includes(videoId)) {
            let pos = text.indexOf(videoId);
            while (pos !== -1) {
                const chunk = text.substring(Math.max(0, pos - 20000), pos + 20000);
                extractVerified(chunk, videoId, allSources);
                pos = text.indexOf(videoId, pos + 1);
            }
        }
    }

    // Second pass: if nothing found, try looking in all scripts without strict ID match (fallback)
    if (allSources.length === 0) {
        scripts.forEach(s => {
            if (s.textContent && (s.textContent.includes('fbcdn.net') || s.textContent.includes('playable_url'))) {
                extractVerified(s.textContent, null, allSources);
            }
        });
    }

    // Third pass: check page HTML
    if (allSources.length === 0) {
        extractVerified(document.documentElement.innerHTML, videoId, allSources);
    }
    if (allSources.length === 0) {
        extractVerified(document.documentElement.innerHTML, null, allSources);
    }

    // Deduplicate and filter
    const uniqueMap = new Map();
    allSources.forEach(s => {
        if (!uniqueMap.has(s.url)) uniqueMap.set(s.url, s);
    });

    let finalSources = Array.from(uniqueMap.values());

    // SMART SORTING: Highest resolution first
    finalSources.sort((a, b) => {
        const scoreA = (a.height || 0) * (a.width || 0) + (a.label === 'HD' ? 1000000 : 0);
        const scoreB = (b.height || 0) * (b.width || 0) + (b.label === 'HD' ? 1000000 : 0);
        return scoreB - scoreA;
    });

    if (finalSources.length === 0) {
        toast("❌ Video not found. Try playing it first.");
        return;
    }

    // ALWAYS DOWNLOAD HIGHEST RESOLUTION DIRECTLY
    const best = finalSources[0];
    toast(`🚀 Downloading ${best.label} (${best.height}p)...`);
    downloadFile(best.url, `fsnap-video-${best.height || 'hq'}.mp4`);
}

function extractVerified(text, targetId, list) {
    if (!text || text.length < 50) return;

    const urlKeys = [
        'browser_native_hd_url', 'playable_url_quality_hd', 'hd_src', 'hd_src_no_ratelimit',
        'browser_native_sd_url', 'playable_url', 'sd_src', 'sd_src_no_ratelimit'
    ];

    urlKeys.forEach(key => {
        // Match both normal and escaped slashes
        const regex = new RegExp(`"${key}":"(https:[^"]+)"`, 'g');
        let match;
        while ((match = regex.exec(text)) !== null) {
            const url = sanitize(match[1]);
            if (url.includes('fbcdn.net')) {
                // Proximity check if targetId is provided
                if (targetId) {
                    const proximityCheck = text.substring(Math.max(0, match.index - 10000), match.index + 10000);
                    if (!proximityCheck.includes(targetId)) continue;
                }

                const area = text.substring(Math.max(0, match.index - 1500), match.index + 1500);

                // Enhanced resolution detection
                const hMatch = area.match(/"(?:pixel_)?height":(\d+)/) || area.match(/"height\\":(\d+)/) || area.match(/"frame_height":(\d+)/);
                const wMatch = area.match(/"(?:pixel_)?width":(\d+)/) || area.match(/"width\\":(\d+)/) || area.match(/"frame_width":(\d+)/);
                const qMatch = area.match(/"FBQualityLabel":"([^"]+)"/) || area.match(/"quality_label":"([^"]+)"/);

                let height = hMatch ? parseInt(hMatch[1]) : 0;
                let width = wMatch ? parseInt(wMatch[1]) : 0;
                let label = qMatch ? qMatch[1] : (height >= 720 ? 'HD' : 'SD');

                // Heuristics for HD keys
                if (key.toLowerCase().includes('hd')) {
                    if (!height || height < 720) height = 720;
                    label = 'HD';
                }

                if (!height) {
                    if (label.includes('1080')) height = 1080;
                    else if (label.includes('720')) height = 720;
                    else if (label.includes('480')) height = 480;
                    else height = 360;
                }
                if (!width) width = Math.round(height * 1.77);

                if (!list.some(x => x.url === url)) {
                    list.push({ label, width, height, url });
                }
            }
        }
    });

    // Generic MP4 search (last resort)
    const mp4Regex = /"(https:[^"]+?\.mp4[^"]+?)"/g;
    let mp4m;
    while ((mp4m = mp4Regex.exec(text)) !== null) {
        const url = sanitize(mp4m[1]);
        if (url.includes('fbcdn') && !list.some(x => x.url === url)) {
            if (targetId) {
                const proximity = text.substring(Math.max(0, mp4m.index - 5000), mp4m.index + 5000);
                if (!proximity.includes(targetId)) continue;
            }

            const area = text.substring(Math.max(0, mp4m.index - 1000), mp4m.index + 1000);
            const hMatch = area.match(/"(?:pixel_)?height":(\d+)/);
            let height = hMatch ? parseInt(hMatch[1]) : 360;
            let label = height >= 720 ? 'HD' : 'SD';

            list.push({ label, width: Math.round(height * 1.77), height, url });
        }
    }
}

function sanitize(url) {
    if (!url) return "";
    let s = url.replace(/\\\//g, '/'); // Unescape forward slashes
    // Unescape unicode (e.g., \u0026 -> &)
    s = s.replace(/\\u([0-9a-fA-F]{4})/g, (match, grp) => String.fromCharCode(parseInt(grp, 16)));
    // Remove remaining backslashes (like in \")
    s = s.replace(/\\/g, '');
    // Fix common HTML entities
    s = s.replace(/&amp;/g, '&');
    return s;
}

function findVideoId(video) {
    let curr = video;
    while (curr && curr !== document.body) {
        const id = curr.getAttribute('data-video-id') || curr.getAttribute('id')?.replace('v_', '') || curr.getAttribute('data-id') || curr.getAttribute('data-fbid');
        if (id && /^\d+$/.test(id)) return id;
        curr = curr.parentElement;
    }
    const urlMatch = window.location.href.match(/\/(?:videos|reels|watch|shorts|reel)\/(\d+)/);
    return urlMatch ? urlMatch[1] : null;
}

function downloadFile(url, filename) {
    const api = typeof browser !== 'undefined' ? browser : chrome;
    api.runtime.sendMessage({ action: "DOWNLOAD_MEDIA", url, filename });
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

// ===== Tokens + TweetDetail queryId from storage =====
async function getSession() {
  const {
    twBearer,
    twCsrf,
    twGuestToken,
    twTweetDetailQueryId,
    twApiBase
  } = await chrome.storage.local.get([
    "twBearer",
    "twCsrf",
    "twGuestToken",
    "twTweetDetailQueryId",
    "twApiBase"
  ]);

  const FALLBACK_ID = "97JF30KziU00483E_8elBA";
  const finalQueryId = twTweetDetailQueryId || FALLBACK_ID;

  if (!twBearer) {
    throw new Error(
      "Tokens not capture yet. Please scroll down or reload the page to refresh the session."
    );
  }

  return {
    bearer: twBearer,
    csrf: twCsrf || null,
    guest: twGuestToken || null,
    queryId: finalQueryId,
    apiBase: twApiBase || (location.origin.includes("x.com") ? "https://x.com" : "https://twitter.com")
  };
}


// ===== Observe tweets and inject buttons =====
const observer = new MutationObserver(() => {
  tryInjectButtons();
});

observer.observe(document.documentElement || document.body, {
  childList: true,
  subtree: true
});

window.addEventListener("load", tryInjectButtons);

function tryInjectButtons() {
  // Images
  document
    .querySelectorAll("article div[data-testid='tweetPhoto'] img")
    .forEach((img) => {
      const container = img.closest("div[data-testid='tweetPhoto']");
      if (container && !container.querySelector(".twx-download-btn")) {
        addButton(container, "image");
      }
    });

  // Videos / GIFs
  document.querySelectorAll("article video").forEach((video) => {
    const container = video.parentElement;
    if (container && !container.querySelector(".twx-download-btn")) {
      addButton(container, "video");
    }
  });
}

// Round download icon at bottom-left
function addButton(container, type) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "twx-download-btn";
  btn.title = "Download media";

  Object.assign(btn.style, {
    position: "absolute",
    bottom: "12px",
    left: "12px",
    zIndex: 999999,
    width: "32px",
    height: "32px",
    padding: "0",
    borderRadius: "50%",
    border: "none",
    background: "rgba(29, 155, 240, 0.95)",
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    pointerEvents: "auto"
  });

  btn.textContent = "⬇";

  const cs = getComputedStyle(container);
  if (cs.position === "static") {
    container.style.position = "relative";
  }

  // Stop X navigation (open photo/video) by intercepting early
  const stop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.stopImmediatePropagation) e.stopImmediatePropagation();
  };

  btn.addEventListener("pointerdown", stop, true);
  btn.addEventListener("mousedown", stop, true);
  btn.addEventListener(
    "click",
    async (e) => {
      stop(e);

      const tweetUrl = findTweetUrl(container);
      if (!tweetUrl) return toast("Cannot find tweet URL.");

      try {
        const apiUrl = await buildApiUrlFromTweet(tweetUrl);
        const json = await fetchTweetJson(apiUrl);

        const mediaList = extractMedia(json, type);
        if (!mediaList.length) return toast("No media found.");

        showMediaChooser({ mediaType: type, mediaList });
      } catch (err) {
        console.error(err);
        toast(err.message);
      }
    },
    true
  );

  container.appendChild(btn);
}

function findTweetUrl(node) {
  const article = node.closest("article");
  if (!article) return null;
  const timeLink = article.querySelector("a time");
  if (!timeLink) return null;
  const a = timeLink.closest("a");
  return a ? a.href : null;
}

// ===== Small toast =====
function toast(message) {
  const old = document.querySelector(".twx-toast");
  if (old) old.remove();

  const el = document.createElement("div");
  el.className = "twx-toast";
  el.textContent = message;
  Object.assign(el.style, {
    position: "fixed",
    left: "50%",
    bottom: "70px",
    transform: "translateX(-50%)",
    zIndex: 1000000,
    background: "rgba(15, 20, 25, 0.95)",
    color: "#fff",
    padding: "8px 10px",
    borderRadius: "10px",
    fontSize: "12px",
    maxWidth: "90vw"
  });

  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2500);
}

// ===== Build TweetDetail URL (uses captured queryId) =====
async function buildApiUrlFromTweet(tweetUrl) {
  const m = tweetUrl.match(/status\/(\d+)/);
  if (!m) throw new Error("Cannot parse tweet id");
  const id = m[1];

  const { apiBase, queryId } = await getSession();

  const variables = {
    focalTweetId: id,
    with_rux_injections: false,
    includePromotedContent: true,
    withCommunity: true,
    withQuickPromoteEligibilityTweetFields: true,
    withBirdwatchNotes: false,
    withVoice: true,
    withV2Timeline: true
  };

  const features = {
    responsive_web_enhance_cards_enabled: false,
    responsive_web_twitter_article_tweet_consumption_enabled: false,
    articles_preview_enabled: false,
    longform_notetweets_inline_media_enabled: true,
    responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
    c9s_tweet_anatomy_moderator_badge_enabled: true,
    responsive_web_graphql_timeline_navigation_enabled: true,
    profile_label_improvements_pcf_label_in_post_enabled: false,
    responsive_web_grok_image_annotation_enabled: false,
    creator_subscriptions_tweet_preview_api_enabled: true,
    verified_phone_label_enabled: false,
    tweetypie_unmention_optimization_enabled: true,
    responsive_web_graphql_exclude_directive_enabled: true,
    freedom_of_speech_not_reach_fetch_enabled: true,
    rweb_tipjar_consumption_enabled: true,
    communities_web_enable_tweet_community_results_fetch: true,
    standardized_nudges_misinfo: true,
    tweet_awards_web_tipping_enabled: false,
    rweb_video_timestamps_enabled: true,
    longform_notetweets_rich_text_read_enabled: true,
    longform_notetweets_consumption_enabled: true,
    responsive_web_media_download_video_enabled: false,
    creator_subscriptions_quote_tweet_preview_enabled: false,
    hidden_profile_likes_enabled: true,
    hidden_profile_subscriptions_enabled: true,
    responsive_web_twitter_blue_verified_badge_is_enabled: true,
    highlights_tweets_tab_ui_enabled: true,
    responsive_web_home_pinned_timelines_enabled: true,
    subscriptions_verify_sms_toggle_enabled: true,
    limited_actions_policy_enabled: true,
    super_follow_badge_privacy_enabled: true,
    super_follow_exclusive_tweet_notifications_enabled: true,
    super_follow_tweet_api_enabled: true,
    super_follow_user_api_enabled: true,
    android_graphql_skip_api_media_color_palette: false,
    blue_business_profile_image_shape_enabled: false,
    unified_cards_ad_metadata_container_dynamic_card_content_query_enabled: false,
    trust_signals_expand_prompt_enabled: true,
    trust_signals_profile_hover_card_enabled: true,
    trust_signals_profile_page_enabled: true,
    voice_consumption_enabled: true,
    interactive_text_enabled: true,
    spaces_2022_h2_clipping: true,
    spaces_2022_h2_spaces_communities: true,
    rweb_lists_timeline_redesign_enabled: true,
    user_data_features_enabled: true,
    tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
    graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
    view_counts_everywhere_api_enabled: true,
    responsive_web_edit_tweet_api_enabled: true,
    premium_content_api_read_enabled: false,
    responsive_web_grok_analyze_button_fetch_trends_enabled: false,
    responsive_web_grok_analyze_post_followups_enabled: true,
    responsive_web_grok_analysis_button_from_backend: false,
    responsive_web_grok_imagine_annotation_enabled: false,
    responsive_web_grok_community_note_auto_translation_is_enabled: false,
    responsive_web_grok_show_grok_translated_post: false,
    responsive_web_jetfuel_frame: false,
    responsive_web_profile_redirect_enabled: true,
    rweb_video_screen_enabled: true,
    responsive_web_grok_share_attachment_enabled: false
  };

  const params = new URLSearchParams({
    variables: JSON.stringify(variables),
    features: JSON.stringify(features)
  });

  // Correct format: /i/api/graphql/<queryId>/TweetDetail [web:155]
  return `${apiBase}/i/api/graphql/${queryId}/TweetDetail?${params.toString()}`;
}

// ===== Fetch Tweet JSON (cookies + captured headers) =====
async function fetchTweetJson(apiUrl) {
  const { bearer, csrf, guest } = await getSession();

  const headers = {
    authorization: "Bearer " + bearer,
    "x-twitter-active-user": "yes",
    "x-client-language": "en",
    accept: "application/json, text/plain, */*"
  };

  if (csrf) headers["x-csrf-token"] = csrf;
  if (guest) headers["x-guest-token"] = guest;

  const res = await fetch(apiUrl, {
    credentials: "include",
    headers
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${txt.slice(0, 180)}`);
  }

  return res.json();
}

// ===== Extract media from TweetDetail JSON =====
function extractMedia(json, mediaType) {
  const out = [];

  try {
    const instructions =
      json?.data?.threaded_conversation_with_injections_v2?.instructions || [];

    for (const inst of instructions) {
      if (inst.type !== "TimelineAddEntries") continue;

      for (const entry of inst.entries || []) {
        const content = entry.content?.itemContent?.tweet_results?.result;
        const legacy = content?.legacy || content?.tweet?.legacy;
        const media = legacy?.extended_entities?.media || [];

        for (const m of media) {
          if (mediaType === "image" && m.type === "photo") {
            out.push({ url: m.media_url_https });
          }

          if (
            mediaType === "video" &&
            (m.type === "video" || m.type === "animated_gif")
          ) {
            const variants = m.video_info?.variants || [];
            variants
              .filter(
                (v) =>
                  v.url &&
                  v.content_type &&
                  v.content_type.startsWith("video/")
              )
              .forEach((v) => {
                out.push({
                  url: v.url,
                  bitrate: v.bitrate,
                  content_type: v.content_type,
                  quality: guessQualityFromUrl(v.url)
                });
              });

            out.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
          }
        }
      }
    }
  } catch (e) {
    console.error("extractMedia parse error", e);
  }

  return out;
}

function guessQualityFromUrl(url) {
  const m = url.match(/\/(\d+x\d+)\//);
  return m ? m[1] : null;
}

// ===== Resolution chooser UI =====
function showMediaChooser({ mediaType, mediaList }) {
  document.querySelectorAll(".twx-media-chooser").forEach((el) => el.remove());

  const chooser = document.createElement("div");
  chooser.className = "twx-media-chooser";
  Object.assign(chooser.style, {
    position: "fixed",
    left: "50%",
    bottom: "20px",
    transform: "translateX(-50%)",
    zIndex: 10000,
    background: "rgba(15, 20, 25, 0.95)",
    color: "#fff",
    padding: "8px 10px",
    borderRadius: "999px",
    display: "flex",
    gap: "4px",
    fontSize: "12px"
  });

  mediaList.forEach((m, idx) => {
    const btn = document.createElement("button");
    btn.type = "button";

    const label =
      mediaType === "video"
        ? m.quality || (m.bitrate ? m.bitrate + "bps" : "v" + idx)
        : "IMG " + (idx + 1);

    btn.textContent = label;

    Object.assign(btn.style, {
      border: "none",
      borderRadius: "999px",
      padding: "4px 8px",
      cursor: "pointer",
      background: "rgba(29, 155, 240, 0.9)",
      color: "#fff"
    });

    btn.addEventListener("click", () => {
      chrome.runtime.sendMessage({
        action: "DOWNLOAD_MEDIA",
        url: m.url,
        filename:
          mediaType === "video"
            ? "twitter-video.mp4"
            : `twitter-image-${idx + 1}.jpg`
      });
      chooser.remove();
    });

    chooser.appendChild(btn);
  });

  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "✕";
  Object.assign(close.style, {
    marginLeft: "4px",
    border: "none",
    background: "transparent",
    color: "#fff",
    cursor: "pointer",
    fontSize: "14px"
  });
  close.addEventListener("click", () => chooser.remove());
  chooser.appendChild(close);

  document.body.appendChild(chooser);
}

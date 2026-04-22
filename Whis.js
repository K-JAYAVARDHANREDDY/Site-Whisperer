/**
 * SiteWhisperer SDK v1.0.0
 * ─────────────────────────────────────────────────────────────────
 * Drop-in AI insight overlay for any website.
 * Developers embed this script and configure it once.
 * Users hold Alt + hover any section to get instant AI explanations.
 * Powered by OpenAI GPT-4o-mini.
 *
 * Usage:
 *   <script src="site-whisperer.js"></script>
 *   <script>
 *     SiteWhisperer.init({
 *       apiKey: "YOUR_OPENAI_API_KEY",   // starts with sk-...
 *       siteContext: "This is an e-commerce site selling handmade ceramics.",
 *       triggerKey: "Alt",        // optional, default: Alt
 *       theme: "dark",            // optional: "dark" | "light"
 *       excludeSelectors: ["nav", "footer"], // optional
 *     });
 *   </script>
 * ─────────────────────────────────────────────────────────────────
 */

(function (global) {
  "use strict";

  // ── Internal state ────────────────────────────────────────────
  let config = {};
  let isActive = false;
  let currentTarget = null;
  let tooltip = null;
  let badge = null;
  let highlightBox = null;
  let abortController = null;
  let debounceTimer = null;
  let lastExplainedEl = null;

  // ── Styles injected once ──────────────────────────────────────
  function injectStyles() {
    if (document.getElementById("sw-styles")) return;
    const isDark = config.theme !== "light";

    const css = `
      /* SiteWhisperer Styles */
      #sw-badge {
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 2147483647;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 16px;
        border-radius: 100px;
        background: ${isDark ? "#0f0f0f" : "#ffffff"};
        border: 1.5px solid ${isDark ? "#2a2a2a" : "#e0e0e0"};
        box-shadow: 0 4px 24px rgba(0,0,0,${isDark ? "0.6" : "0.12"});
        cursor: pointer;
        font-family: 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 13px;
        font-weight: 500;
        color: ${isDark ? "#ffffff" : "#1a1a1a"};
        transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
        user-select: none;
        letter-spacing: -0.01em;
      }
      #sw-badge:hover {
        transform: scale(1.04);
        box-shadow: 0 6px 32px rgba(0,0,0,${isDark ? "0.8" : "0.18"});
      }
      #sw-badge.sw-badge--active {
        background: linear-gradient(135deg, #6366f1, #8b5cf6);
        border-color: transparent;
        color: #ffffff;
        box-shadow: 0 4px 24px rgba(99,102,241,0.5);
      }
      #sw-badge .sw-badge__dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: #22c55e;
        flex-shrink: 0;
        transition: background 0.2s;
      }
      #sw-badge.sw-badge--active .sw-badge__dot {
        background: rgba(255,255,255,0.7);
        animation: sw-pulse 1.2s ease-in-out infinite;
      }
      @keyframes sw-pulse {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.5; transform: scale(0.8); }
      }

      /* Highlight overlay */
      #sw-highlight {
        position: fixed;
        z-index: 2147483640;
        pointer-events: none;
        border-radius: 6px;
        border: 2px solid #6366f1;
        background: rgba(99,102,241,0.06);
        box-shadow: 0 0 0 4px rgba(99,102,241,0.12);
        transition: all 0.12s ease;
        display: none;
      }

      /* Tooltip */
      #sw-tooltip {
        position: fixed;
        z-index: 2147483646;
        max-width: 360px;
        min-width: 260px;
        border-radius: 16px;
        font-family: 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 14px;
        line-height: 1.6;
        pointer-events: none;
        opacity: 0;
        transform: translateY(8px) scale(0.97);
        transition: opacity 0.18s ease, transform 0.18s cubic-bezier(0.34, 1.2, 0.64, 1);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
      }
      #sw-tooltip.sw-tooltip--visible {
        opacity: 1;
        transform: translateY(0) scale(1);
        pointer-events: auto;
      }
      #sw-tooltip .sw-tooltip__inner {
        background: ${isDark ? "rgba(15,15,15,0.95)" : "rgba(255,255,255,0.97)"};
        border: 1.5px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"};
        border-radius: 16px;
        overflow: hidden;
        box-shadow: 0 24px 64px rgba(0,0,0,${isDark ? "0.7" : "0.18"}),
                    0 0 0 1px rgba(99,102,241,0.1);
      }
      #sw-tooltip .sw-tooltip__header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 12px 16px 8px;
        border-bottom: 1px solid ${isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"};
      }
      #sw-tooltip .sw-tooltip__icon {
        width: 22px;
        height: 22px;
        border-radius: 6px;
        background: linear-gradient(135deg, #6366f1, #8b5cf6);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 11px;
        flex-shrink: 0;
      }
      #sw-tooltip .sw-tooltip__label {
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: #6366f1;
      }
      #sw-tooltip .sw-tooltip__tag {
        margin-left: auto;
        font-size: 10px;
        padding: 2px 7px;
        border-radius: 100px;
        background: ${isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.06)"};
        color: ${isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)"};
        font-weight: 500;
        font-family: 'SF Mono', 'Fira Code', monospace;
      }
      #sw-tooltip .sw-tooltip__body {
        padding: 12px 16px 14px;
        color: ${isDark ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.8)"};
        font-size: 13.5px;
        line-height: 1.65;
      }
      #sw-tooltip .sw-tooltip__body.sw-loading {
        display: flex;
        align-items: center;
        gap: 10px;
        color: ${isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.35)"};
        font-style: italic;
      }
      #sw-tooltip .sw-spinner {
        width: 14px;
        height: 14px;
        border: 2px solid ${isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"};
        border-top-color: #6366f1;
        border-radius: 50%;
        animation: sw-spin 0.7s linear infinite;
        flex-shrink: 0;
      }
      @keyframes sw-spin {
        to { transform: rotate(360deg); }
      }
      #sw-tooltip .sw-tooltip__footer {
        padding: 6px 16px 10px;
        display: flex;
        align-items: center;
        gap: 6px;
        border-top: 1px solid ${isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"};
      }
      #sw-tooltip .sw-tooltip__hint {
        font-size: 11px;
        color: ${isDark ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.25)"};
        margin-left: auto;
      }
      #sw-tooltip .sw-tooltip__close {
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: ${isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.06)"};
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        color: ${isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)"};
        font-size: 10px;
        line-height: 1;
        padding: 0;
        pointer-events: auto;
        transition: background 0.15s;
      }
      #sw-tooltip .sw-tooltip__close:hover {
        background: ${isDark ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.1)"};
      }

      /* Active mode cursor hint */
      body.sw-active-mode * {
        cursor: crosshair !important;
      }

      /* Keypress indicator */
      #sw-key-indicator {
        position: fixed;
        top: 24px;
        left: 50%;
        transform: translateX(-50%) translateY(-60px);
        z-index: 2147483647;
        background: ${isDark ? "rgba(15,15,15,0.95)" : "rgba(255,255,255,0.97)"};
        border: 1.5px solid ${isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"};
        border-radius: 100px;
        padding: 8px 18px;
        font-family: 'SF Pro Display', -apple-system, sans-serif;
        font-size: 12.5px;
        font-weight: 500;
        color: ${isDark ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.7)"};
        backdrop-filter: blur(20px);
        box-shadow: 0 8px 32px rgba(0,0,0,0.2);
        display: flex;
        align-items: center;
        gap: 8px;
        transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease;
        opacity: 0;
        pointer-events: none;
      }
      #sw-key-indicator.sw-key-indicator--visible {
        transform: translateX(-50%) translateY(0);
        opacity: 1;
      }
      #sw-key-indicator kbd {
        display: inline-flex;
        align-items: center;
        padding: 2px 7px;
        border-radius: 5px;
        background: linear-gradient(135deg, #6366f1, #8b5cf6);
        color: white;
        font-family: 'SF Mono', monospace;
        font-size: 11px;
        font-weight: 600;
      }
    `;

    const style = document.createElement("style");
    style.id = "sw-styles";
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ── Build DOM elements ────────────────────────────────────────
  function buildElements() {
    // Floating badge
    badge = document.createElement("div");
    badge.id = "sw-badge";
    badge.innerHTML = `
      <div class="sw-badge__dot"></div>
      <span class="sw-badge__text">SiteWhisperer</span>
      <span class="sw-badge__shortcut" style="opacity:0.45;font-size:11px;font-family:'SF Mono',monospace">Alt</span>
    `;
    badge.title = "Hold Alt and hover any element to get AI insights";
    document.body.appendChild(badge);

    // Highlight overlay
    highlightBox = document.createElement("div");
    highlightBox.id = "sw-highlight";
    document.body.appendChild(highlightBox);

    // Tooltip
    tooltip = document.createElement("div");
    tooltip.id = "sw-tooltip";
    tooltip.innerHTML = `
      <div class="sw-tooltip__inner">
        <div class="sw-tooltip__header">
          <div class="sw-tooltip__icon">✦</div>
          <span class="sw-tooltip__label">SiteWhisperer</span>
          <span class="sw-tooltip__tag" id="sw-el-tag">—</span>
        </div>
        <div class="sw-tooltip__body" id="sw-body">
          <div class="sw-spinner"></div> Analyzing…
        </div>
        <div class="sw-tooltip__footer">
          <button class="sw-tooltip__close" id="sw-close-btn" title="Close">✕</button>
          <span class="sw-tooltip__hint">Powered by GPT-4o-mini</span>
        </div>
      </div>
    `;
    document.body.appendChild(tooltip);

    // Key indicator
    const ki = document.createElement("div");
    ki.id = "sw-key-indicator";
    ki.innerHTML = `<kbd>${config.triggerKey || "Alt"}</kbd> <span>Hover any section for AI insights</span>`;
    document.body.appendChild(ki);

    // Badge click toggle
    badge.addEventListener("click", toggleMode);

    // Close button
    document.getElementById("sw-close-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      hideTooltip();
    });
  }

  // ── Mode toggle ───────────────────────────────────────────────
  function toggleMode() {
    isActive = !isActive;
    badge.classList.toggle("sw-badge--active", isActive);
    badge.querySelector(".sw-badge__text").textContent = isActive
      ? "Active — hover any section"
      : "SiteWhisperer";

    document.body.classList.toggle("sw-active-mode", isActive);

    if (!isActive) {
      hideTooltip();
      hideHighlight();
    }

    // Show key indicator briefly
    const ki = document.getElementById("sw-key-indicator");
    ki.classList.add("sw-key-indicator--visible");
    setTimeout(() => ki.classList.remove("sw-key-indicator--visible"), 2200);
  }

  // ── Keyboard listeners ────────────────────────────────────────
  function setupKeyListeners() {
    const key = (config.triggerKey || "Alt").toLowerCase();

    document.addEventListener("keydown", (e) => {
      if (e.key.toLowerCase() === key || e.altKey) {
        if (!isActive) toggleMode();
      }
      if (e.key === "Escape") {
        if (isActive) toggleMode();
        hideTooltip();
      }
    });

    document.addEventListener("keyup", (e) => {
      if (e.key.toLowerCase() === key || (!e.altKey && key === "alt")) {
        // Keep mode on — user toggles manually or via click
      }
    });
  }

  // ── Mouse tracking ────────────────────────────────────────────
  function setupMouseListeners() {
    document.addEventListener("mousemove", (e) => {
      if (!isActive) return;
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (!el || el === tooltip || tooltip.contains(el) || el === badge || badge.contains(el)) return;
      if (isExcluded(el)) return;

      const meaningful = findMeaningfulAncestor(el);
      if (!meaningful || meaningful === currentTarget) return;

      currentTarget = meaningful;
      highlightElement(meaningful);

      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (meaningful !== lastExplainedEl) {
          explainElement(meaningful, e.clientX, e.clientY);
        }
      }, 280);
    });

    document.addEventListener("click", (e) => {
      if (!isActive) return;
      if (tooltip.contains(e.target) || badge.contains(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
    });
  }

  // ── Find meaningful element ───────────────────────────────────
  function findMeaningfulAncestor(el) {
    const blockTags = new Set([
      "SECTION","ARTICLE","MAIN","ASIDE","HEADER","FOOTER","NAV",
      "DIV","FORM","UL","OL","TABLE","FIGURE","BLOCKQUOTE",
      "H1","H2","H3","H4","H5","H6","P","BUTTON","A","IMG","VIDEO"
    ]);

    let node = el;
    for (let i = 0; i < 6; i++) {
      if (!node || node === document.body) break;
      if (blockTags.has(node.tagName)) {
        const rect = node.getBoundingClientRect();
        if (rect.width > 60 && rect.height > 20) return node;
      }
      node = node.parentElement;
    }
    return el;
  }

  // ── Check exclusions ──────────────────────────────────────────
  function isExcluded(el) {
    if (!config.excludeSelectors) return false;
    return config.excludeSelectors.some((sel) => {
      try { return el.closest(sel) !== null; } catch { return false; }
    });
  }

  // ── Highlight element ─────────────────────────────────────────
  function highlightElement(el) {
    const rect = el.getBoundingClientRect();
    highlightBox.style.display = "block";
    highlightBox.style.top = rect.top + "px";
    highlightBox.style.left = rect.left + "px";
    highlightBox.style.width = rect.width + "px";
    highlightBox.style.height = rect.height + "px";
  }

  function hideHighlight() {
    if (highlightBox) highlightBox.style.display = "none";
  }

  // ── Tooltip positioning ───────────────────────────────────────
  function positionTooltip(mouseX, mouseY) {
    const tw = 370;
    const th = 160; // estimated
    const pad = 16;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = mouseX + 18;
    let top = mouseY + 18;

    if (left + tw > vw - pad) left = mouseX - tw - 18;
    if (top + th > vh - pad) top = mouseY - th - 18;

    left = Math.max(pad, left);
    top = Math.max(pad, top);

    tooltip.style.left = left + "px";
    tooltip.style.top = top + "px";
  }

  function showTooltip(mouseX, mouseY) {
    positionTooltip(mouseX, mouseY);
    tooltip.classList.add("sw-tooltip--visible");
  }

  function hideTooltip() {
    tooltip.classList.remove("sw-tooltip--visible");
    lastExplainedEl = null;
  }

  // ── Extract element context ───────────────────────────────────
  function extractContext(el) {
    const tag = el.tagName.toLowerCase();
    const id = el.id ? `#${el.id}` : "";
    const cls = el.className
      ? "." + (typeof el.className === "string"
          ? el.className.trim().split(/\s+/).slice(0, 3).join(".")
          : "")
      : "";

    // Inner text (truncated)
    const text = (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 400);

    // ARIA / data attrs
    const ariaLabel = el.getAttribute("aria-label") || "";
    const role = el.getAttribute("role") || "";
    const dataAttrs = Array.from(el.attributes)
      .filter((a) => a.name.startsWith("data-"))
      .map((a) => `${a.name}="${a.value}"`)
      .slice(0, 4)
      .join(" ");

    // Child element summary
    const childCount = el.children.length;
    const childTypes = Array.from(el.children)
      .slice(0, 6)
      .map((c) => c.tagName.toLowerCase())
      .join(", ");

    return {
      tag, id, cls, text, ariaLabel, role, dataAttrs, childCount, childTypes,
      selector: `${tag}${id}${cls}`,
    };
  }

  // ── Call OpenAI API ───────────────────────────────────────────
  async function explainElement(el, mouseX, mouseY) {
    lastExplainedEl = el;

    // Update tooltip UI
    const body = document.getElementById("sw-body");
    const elTag = document.getElementById("sw-el-tag");
    const ctx = extractContext(el);

    elTag.textContent = ctx.selector.slice(0, 28) || "element";
    body.innerHTML = `<div class="sw-spinner"></div> Analyzing…`;
    body.className = "sw-tooltip__body sw-loading";
    showTooltip(mouseX, mouseY);

    // Abort any previous in-flight request
    if (abortController) abortController.abort();
    abortController = new AbortController();

    const prompt = buildPrompt(ctx);

    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        signal: abortController.signal,
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",   // cheap + fast — uses way less of your 200 calls
          max_tokens: 220,
          messages: [
            { role: "system", content: buildSystemPrompt() },
            { role: "user",   content: prompt },
          ],
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error?.message || `HTTP ${response.status}`);
      }

      const data = await response.json();
      const text = data.choices?.[0]?.message?.content || "No explanation available.";

      body.className = "sw-tooltip__body";
      body.textContent = text;

    } catch (err) {
      if (err.name === "AbortError") return;
      body.className = "sw-tooltip__body";
      body.textContent = `⚠ ${err.message}`;
    }
  }

  function buildSystemPrompt() {
    const siteCtx = config.siteContext
      ? `Context about this website: ${config.siteContext}`
      : "You are analyzing a section of a website.";

    return `You are SiteWhisperer, an AI that explains website sections to users in plain, friendly language.
${siteCtx}
Rules:
- Keep explanations to 2–3 sentences max. Be concise and clear.
- Focus on PURPOSE: what this section is FOR, not technical details.
- Write for a non-technical end user.
- Don't mention HTML tags, CSS classes, or code.
- Be warm and helpful in tone.
- If it's a navigation bar, explain it as such. If it's a product card, say so.`;
  }

  function buildPrompt(ctx) {
    return `Explain what this section of the website does:
Element type: ${ctx.tag}
Identifier: ${ctx.selector}
Text content: "${ctx.text.slice(0, 250)}"
${ctx.ariaLabel ? `Aria label: "${ctx.ariaLabel}"` : ""}
${ctx.role ? `Role: ${ctx.role}` : ""}
${ctx.childCount ? `Contains ${ctx.childCount} child elements (${ctx.childTypes})` : ""}
${ctx.dataAttrs ? `Data attributes: ${ctx.dataAttrs}` : ""}

What is this section for? Explain to a regular user.`;
  }

  // ── Public API ────────────────────────────────────────────────
  const SiteWhisperer = {
    init(userConfig) {
      if (!userConfig.apiKey) {
        console.error("[SiteWhisperer] apiKey is required. Provide your OpenAI API key (starts with sk-...).");
        return;
      }
      config = Object.assign({
        triggerKey: "Alt",
        theme: "dark",
        excludeSelectors: [],
      }, userConfig);

      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", _mount);
      } else {
        _mount();
      }
    },

    destroy() {
      document.getElementById("sw-styles")?.remove();
      document.getElementById("sw-badge")?.remove();
      document.getElementById("sw-tooltip")?.remove();
      document.getElementById("sw-highlight")?.remove();
      document.getElementById("sw-key-indicator")?.remove();
      document.body.classList.remove("sw-active-mode");
    },
  };

  function _mount() {
    injectStyles();
    buildElements();
    setupKeyListeners();
    setupMouseListeners();
    console.log(
      `%c✦ SiteWhisperer ready%c  Powered by OpenAI · Hold ${config.triggerKey} or click the badge to activate AI insights.`,
      "color:#6366f1;font-weight:700",
      "color:gray"
    );
  }

  // Expose globally
  global.SiteWhisperer = SiteWhisperer;
})(window);

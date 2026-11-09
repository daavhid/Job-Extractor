import { getExtractorForUrl } from "./extractors";
import type { JobResult } from "./extractors/base";

console.log("[Job Extractor] 🟢 Content script injected on:", window.location.href);

// ── In-Page Quick Extract & Copy ────────────────────────────────────

let isExtracting = false;
let toastTimeout: any = null;

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.top = "0";
      ta.style.left = "0";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const success = document.execCommand("copy");
      document.body.removeChild(ta);
      return success;
    } catch {
      return false;
    }
  }
}

async function performQuickExtract(): Promise<void> {
  if (isExtracting) return;
  isExtracting = true;

  updateButtonState("extracting");

  try {
    const extractor = getExtractorForUrl(window.location.href);
    console.log(`[Job Extractor Floating] Running extractor: ${extractor.constructor.name}`);

    const jobs = await extractor.extract();

    if (!jobs || jobs.length === 0) {
      showToast("❌ No job detected", "Make sure you are on a job details section.", "error");
      updateButtonState("idle");
      isExtracting = false;
      return;
    }

    const simplified = jobs.map((job: JobResult) => ({
      "role name": job.title,
      company: job.company,
      "job url": job.applyUrl || job.link,
      platform: job.platform || "Generic",
      salary: job.salary || null,
      location: job.location || null,
      workModel: job.workModel || null,
      description: job.description
    }));

    const textToCopy = simplified.length === 1 
      ? JSON.stringify(simplified[0], null, 2) 
      : JSON.stringify(simplified, null, 2);

    const copied = await copyToClipboard(textToCopy);

    if (copied) {
      const first = jobs[0];
      showToast("ApplyFlow: Copied to clipboard!", `${first.title || "Job"} • ${first.company || "Company"}`, "success");
      updateButtonState("success");
    } else {
      showToast("ApplyFlow: Clipboard error", "Check browser clipboard permissions", "warning");
      updateButtonState("idle");
    }
  } catch (err) {
    console.error("[Job Extractor Floating] Extraction error:", err);
    showToast("❌ Extraction failed", String(err instanceof Error ? err.message : err), "error");
    updateButtonState("idle");
  } finally {
    setTimeout(() => {
      updateButtonState("idle");
      isExtracting = false;
    }, 1500);
  }
}

// ── Floating UI (Shadow DOM) ────────────────────────────────────────

let shadowRoot: ShadowRoot | null = null;

function initFloatingWidget(): void {
  if (document.getElementById("job-extractor-floating-host")) return;

  const host = document.createElement("div");
  host.id = "job-extractor-floating-host";
  const shadow = host.attachShadow({ mode: "open" });
  shadowRoot = shadow;

  const isCollapsed = localStorage.getItem("job_extractor_widget_collapsed") === "true";

  shadow.innerHTML = `
    <style>
      :host {
        all: initial;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      }
      .widget-wrap {
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 2147483647;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 10px;
        pointer-events: none;
      }
      .interactive {
        pointer-events: auto;
      }
      /* Main Action Button Pill */
      .action-pill {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        background: linear-gradient(135deg, #0d0d1a 0%, #16152b 100%);
        color: #ffffff;
        border: 1px solid rgba(99, 102, 241, 0.35);
        border-radius: 9999px;
        padding: 6px 12px 6px 9px;
        box-shadow: 0 8px 24px -4px rgba(0, 0, 0, 0.6), 0 0 16px -2px rgba(79, 70, 229, 0.25);
        cursor: pointer;
        user-select: none;
        transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      }
      .action-pill:hover {
        transform: translateY(-2px);
        background: linear-gradient(135deg, #131326 0%, #1e1d3b 100%);
        box-shadow: 0 12px 28px -4px rgba(0, 0, 0, 0.7), 0 0 20px -2px rgba(79, 70, 229, 0.45);
        border-color: rgba(99, 102, 241, 0.6);
      }
      .action-pill:active {
        transform: translateY(0) scale(0.98);
      }
      .icon-bolt {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 22px;
        height: 22px;
        border-radius: 50%;
        background: linear-gradient(135deg, #4f46e5 0%, #06b6d4 100%);
        color: #ffffff;
        font-size: 12px;
        box-shadow: 0 0 8px rgba(79, 70, 229, 0.5);
      }
      .label-text {
        font-size: 12px;
        font-weight: 700;
        letter-spacing: -0.01em;
        background: linear-gradient(135deg, #ffffff 60%, #c7d2fe 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
      }
      .shortcut-chip {
        font-size: 9.5px;
        font-weight: 700;
        background: rgba(255, 255, 255, 0.09);
        color: #94a3b8;
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 4px;
        padding: 1.5px 4.5px;
        letter-spacing: 0.02em;
      }
      .collapse-btn {
        background: transparent;
        border: none;
        color: #64748b;
        cursor: pointer;
        padding: 2px 4px;
        border-radius: 4px;
        font-size: 11px;
        line-height: 1;
        transition: color 0.15s;
        margin-left: 2px;
      }
      .collapse-btn:hover {
        color: #ffffff;
      }
      /* Minimized Circle Mode */
      .circle-btn {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: linear-gradient(135deg, #0d0d1a 0%, #1e1b4b 100%);
        color: #38bdf8;
        border: 1px solid rgba(99, 102, 241, 0.4);
        box-shadow: 0 8px 24px -4px rgba(0, 0, 0, 0.6), 0 0 16px rgba(79, 70, 229, 0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 16px;
        cursor: pointer;
        transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      }
      .circle-btn:hover {
        transform: translateY(-2px) scale(1.05);
        border-color: rgba(56, 189, 248, 0.6);
        box-shadow: 0 10px 26px -4px rgba(79, 70, 229, 0.5);
      }
      /* Toast Banner */
      .toast {
        background: rgba(13, 14, 26, 0.95);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        color: #ffffff;
        border: 1px solid rgba(99, 102, 241, 0.25);
        border-radius: 10px;
        padding: 8px 12px;
        max-width: 300px;
        box-shadow: 0 12px 30px -4px rgba(0, 0, 0, 0.7), 0 0 20px -4px rgba(79, 70, 229, 0.25);
        opacity: 0;
        transform: translateY(10px) scale(0.95);
        transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      }
      .toast.show {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
      .toast-header {
        font-size: 12px;
        font-weight: 700;
        margin-bottom: 2px;
        display: flex;
        align-items: center;
        gap: 5px;
      }
      .toast-body {
        font-size: 10.5px;
        color: #94a3b8;
        line-height: 1.35;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .toast.success .toast-header { color: #34d399; }
      .toast.error .toast-header { color: #f87171; }
      .toast.warning .toast-header { color: #fbbf24; }

      /* Pulse animation when extracting */
      @keyframes spin-pulse {
        0% { transform: scale(1); opacity: 1; }
        50% { transform: scale(1.15); opacity: 0.7; }
        100% { transform: scale(1); opacity: 1; }
      }
      .extracting .icon-bolt {
        animation: spin-pulse 0.8s infinite ease-in-out;
      }
    </style>

    <div class="widget-wrap">
      <div id="toast" class="toast">
        <div id="toastHeader" class="toast-header"></div>
        <div id="toastBody" class="toast-body"></div>
      </div>

      <div id="widgetContainer" class="interactive">
        ${isCollapsed ? renderCircleHtml() : renderPillHtml()}
      </div>
    </div>
  `;

  attachWidgetEventListeners();
  document.documentElement.appendChild(host);
}

function renderPillHtml(): string {
  return `
    <div id="extractBtn" class="action-pill" title="ApplyFlow Job Extractor (Alt+J) - Click to Extract & Copy">
      <div class="icon-bolt">⚡</div>
      <span id="btnLabel" class="label-text">ApplyFlow</span>
      <span class="shortcut-chip">Alt+J</span>
      <button id="collapseBtn" class="collapse-btn" title="Minimize button">✕</button>
    </div>
  `;
}

function renderCircleHtml(): string {
  return `
    <div id="expandBtn" class="circle-btn" title="ApplyFlow Job Extractor (Alt+J) - Click to open">
      ⚡
    </div>
  `;
}

function attachWidgetEventListeners(): void {
  if (!shadowRoot) return;

  const extractBtn = shadowRoot.getElementById("extractBtn");
  if (extractBtn) {
    extractBtn.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      if (target.id === "collapseBtn" || target.closest("#collapseBtn")) {
        e.stopPropagation();
        toggleCollapsed(true);
        return;
      }
      performQuickExtract();
    });
  }

  const expandBtn = shadowRoot.getElementById("expandBtn");
  if (expandBtn) {
    expandBtn.addEventListener("click", () => {
      toggleCollapsed(false);
    });
  }
}

function toggleCollapsed(collapsed: boolean): void {
  if (!shadowRoot) return;
  localStorage.setItem("job_extractor_widget_collapsed", collapsed ? "true" : "false");
  const container = shadowRoot.getElementById("widgetContainer");
  if (container) {
    container.innerHTML = collapsed ? renderCircleHtml() : renderPillHtml();
    attachWidgetEventListeners();
  }
}

function updateButtonState(state: "idle" | "extracting" | "success"): void {
  if (!shadowRoot) return;
  const pill = shadowRoot.getElementById("extractBtn");
  const label = shadowRoot.getElementById("btnLabel");
  const icon = shadowRoot.querySelector(".icon-bolt") as HTMLElement;

  if (pill && label) {
    if (state === "extracting") {
      pill.classList.add("extracting");
      label.textContent = "Extracting…";
      if (icon) icon.textContent = "⏳";
    } else if (state === "success") {
      pill.classList.remove("extracting");
      label.textContent = "Copied!";
      if (icon) icon.textContent = "✓";
    } else {
      pill.classList.remove("extracting");
      label.textContent = "ApplyFlow";
      if (icon) icon.textContent = "⚡";
    }
  }
}

function showToast(title: string, message: string, type: "success" | "error" | "warning"): void {
  if (!shadowRoot) return;
  const toast = shadowRoot.getElementById("toast");
  const header = shadowRoot.getElementById("toastHeader");
  const body = shadowRoot.getElementById("toastBody");

  if (toast && header && body) {
    header.textContent = title;
    body.textContent = message;
    toast.className = `toast show ${type}`;

    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      toast.className = "toast";
    }, 3000);
  }
}

// ── In-Page Keyboard Shortcut Listener (Alt+J or Option+J) ─────────
window.addEventListener("keydown", (e: KeyboardEvent) => {
  if (e.altKey && (e.key === "j" || e.key === "J" || e.code === "KeyJ")) {
    e.preventDefault();
    console.log("[Job Extractor] Hotkey Alt+J pressed!");
    performQuickExtract();
  }
});

// Initialize floating widget on page load
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => initFloatingWidget());
} else {
  initFloatingWidget();
}

// ── Message Listener for Extension / Background ─────────────────────

chrome.runtime.onMessage.addListener(
  (
    request: { action: string; mainWorldData?: any },
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: any) => void
  ): boolean => {
    if (request.action === "quickExtractAndCopy") {
      console.log("[Job Extractor] 📩 Received quickExtractAndCopy command from background");
      performQuickExtract();
      sendResponse({ status: "started" });
      return true;
    }

    if (request.action === "extractJobs") {
      console.log("[Job Extractor] 📩 Received extractJobs message with mainWorldData:", !!request.mainWorldData);

      const extractor = getExtractorForUrl(window.location.href);
      console.log(`[Job Extractor] Matched extractor: ${extractor.constructor.name}`);

      extractor.extract(request.mainWorldData)
        .then((jobs) => {
          console.log(`[Job Extractor] 📤 Sending ${jobs.length} job(s) to popup:`, jobs);
          sendResponse({ jobs });
        })
        .catch((err) => {
          console.error("[Job Extractor] ❌ Fatal error during extraction:", err);
          sendResponse({ jobs: [] });
        });

      return true;
    } else if (request.action === "debugDOM") {
      try {
        const applyEls = Array.from(document.querySelectorAll('a, button, [role="button"]'))
          .filter(el => /apply/i.test(el.textContent || "") || /apply/i.test(el.getAttribute("aria-label") || ""))
          .map(el => {
            const attrs: Record<string, string> = {};
            for (let i = 0; i < el.attributes.length; i++) {
              attrs[el.attributes[i].name] = el.attributes[i].value;
            }
            return {
              tag: el.tagName,
              text: el.textContent?.trim().replace(/\s+/g, " "),
              href: el instanceof HTMLAnchorElement ? el.href : null,
              attrs,
              outerHTML: el.outerHTML.substring(0, 300)
            };
          });

        const allTargetBlankLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[target="_blank"]')).map(a => ({
          text: a.textContent?.trim().replace(/\s+/g, " "),
          href: a.href
        })).slice(0, 20);

        sendResponse({
          url: window.location.href,
          title: document.title,
          applyEls,
          allTargetBlankLinks
        });
      } catch (e) {
        sendResponse({ error: String(e) });
      }
      return true;
    }
    return false;
  }
);
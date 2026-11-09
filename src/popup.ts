// popup.ts – ApplyFlow Job Extractor
import { extractMainWorldPageData } from "./mainWorldHelper";

interface JobResult {
  title: string | null;
  company: string | null;
  link: string;
  description: string | null;
  applyUrl: string | null;
  source: "json-ld" | "detail-page";
  platform?: string;
  salary?: string | null;
  location?: string | null;
  workModel?: string | null;
}

type StatusType = "info" | "success" | "error";

interface PlatformInfo {
  name: string;
  supported: boolean;
  isJobPage: boolean;
}

let extractedJobs: JobResult[] = [];

// ── Utilities ────────────────────────────────────────────────────
async function getCurrentTab(): Promise<chrome.tabs.Tab> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function getPlatformInfo(url: string | undefined): PlatformInfo {
  if (!url) return { name: "Unknown", supported: false, isJobPage: false };
  
  const lowUrl = url.toLowerCase();
  
  if (lowUrl.includes("linkedin.com/jobs") || lowUrl.includes("linkedin.com/jobs/view") || lowUrl.includes("linkedin.com/jobs/search")) {
    return { name: "LinkedIn", supported: true, isJobPage: true };
  }
  if (lowUrl.includes("jobright.ai")) {
    return { name: "JobRight", supported: true, isJobPage: true };
  }
  if (lowUrl.includes("hiringcafe.com") || lowUrl.includes("hiring.cafe")) {
    return { name: "Hiring Cafe", supported: true, isJobPage: true };
  }
  if (lowUrl.includes("ziprecruiter.com")) {
    return { name: "ZipRecruiter", supported: true, isJobPage: true };
  }
  
  const isCommonJobKeywords = lowUrl.includes("/jobs/") || 
                               lowUrl.includes("/job/") || 
                               lowUrl.includes("/careers/") || 
                               lowUrl.includes("/career/") || 
                               lowUrl.includes("greenhouse.io") || 
                               lowUrl.includes("lever.co") || 
                               lowUrl.includes("ashbyhq.com") ||
                               lowUrl.includes("myworkdayjobs.com") ||
                               lowUrl.includes("workday");
  
  return { 
    name: "Generic Site", 
    supported: false, 
    isJobPage: isCommonJobKeywords 
  };
}

function esc(str: string | null | undefined): string {
  if (!str) return "";
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function setStatus(msg: string, type: StatusType = "info"): void {
  const el = document.getElementById("status");
  if (el) {
    el.className = `status ${type}`;
    el.textContent = msg;
  }
}

function getEl<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

// ── Render functions ─────────────────────────────────────────────
function renderControls(platformInfo: PlatformInfo): void {
  // Update header platform badge
  const headerBadge = document.getElementById("platformHeaderBadge");
  const headerName = document.getElementById("platformHeaderName");
  if (headerBadge && headerName) {
    headerName.textContent = platformInfo.name;
    headerBadge.className = platformInfo.supported ? "platform-chip supported" : "platform-chip";
  }

  const alertHtml = (!platformInfo.supported && !platformInfo.isJobPage)
    ? `<div class="warning-banner">⚠️ Generic page detected. Best results on LinkedIn, HiringCafe, ZipRecruiter, & JobRight.</div>`
    : "";

  getEl("mainContent").innerHTML = `
    ${alertHtml}
    <div class="controls">
      <button id="extractBtn">⚡ Extract Job</button>
      <button id="copyBtn">📋 Copy JSON</button>
      <button id="exportBtn">⬇ CSV</button>
      <button id="clearBtn" title="Clear details">✕</button>
      <button id="debugBtn" style="display:none;">🐛</button>
    </div>
    <div class="status info" id="status">Click Extract to capture job details.</div>
    <div id="results"></div>
  `;

  getEl("extractBtn").addEventListener("click", doExtract);
  getEl("copyBtn").addEventListener("click", copyJSON);
  getEl("exportBtn").addEventListener("click", exportCSV);
  getEl("clearBtn").addEventListener("click", clearDetails);
  const debugBtn = document.getElementById("debugBtn");
  if (debugBtn) debugBtn.addEventListener("click", debugData);
}

function renderResults(jobs: JobResult[]): void {
  const container = getEl("results");
  
  if (!jobs || jobs.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⚡</div>
        <div class="empty-title">Ready to Capture</div>
        <div class="empty-subtitle">Navigate to any job listing and click <strong>Extract Job</strong> or press <strong>Alt+J</strong></div>
      </div>
    `;
    return;
  }

  console.log("[ApplyFlow Popup] Rendering jobs:", jobs);

  container.innerHTML = jobs.map((job, i) => {
    return `
    <div class="job-card">
      <div class="card-top">
        <div class="job-title">${esc(job.title) || "<em>No title found</em>"}</div>
        <div class="job-number">#${i + 1}</div>
      </div>
      <div class="job-company">${esc(job.company) || "Unknown company"}</div>
      
      <div class="meta-chips">
        ${job.salary ? `<span class="meta-chip chip-salary">💰 ${esc(job.salary)}</span>` : ''}
        ${job.location ? `<span class="meta-chip chip-location">📍 ${esc(job.location)}</span>` : ''}
        ${job.workModel ? `<span class="meta-chip chip-model">🏢 ${esc(job.workModel)}</span>` : ''}
      </div>

      <div class="link-row">
        <div class="link-item">
          <strong>Job URL:</strong>
          ${job.link ? `<a href="${esc(job.link)}" target="_blank" title="${esc(job.link)}">${esc(job.link)}</a>` : "<em>None</em>"}
        </div>
        ${job.applyUrl && job.applyUrl !== job.link ? `
          <div class="link-item apply-link">
            <strong>Apply URL:</strong>
            <a href="${esc(job.applyUrl)}" target="_blank" title="${esc(job.applyUrl)}">${esc(job.applyUrl)}</a>
          </div>
        ` : ''}
      </div>

      ${job.description
        ? `<span class="desc-toggle" data-idx="${i}">▶ View Description (${job.description.length.toLocaleString()} chars)</span>
           <div class="job-description" id="desc-${i}">${esc(job.description)}</div>`
        : `<span class="desc-toggle no-desc">No description available</span>`
      }

      <div class="job-footer">
        <span>Platform: ${esc(job.platform || "Generic")}</span>
        <span>Source: ${esc(job.source || "detail-page")}</span>
      </div>
    </div>
  `}).join("");

  container.querySelectorAll<HTMLElement>(".desc-toggle[data-idx]").forEach(toggle => {
    toggle.addEventListener("click", () => {
      const idx = toggle.getAttribute("data-idx");
      const descEl = document.getElementById(`desc-${idx}`);
      if (!descEl) return;
      const open = descEl.classList.toggle("open");
      toggle.textContent = (open ? "▼ Hide" : "▶ View") + " Description";
    });
  });
}

// ── Debug Function ──────────────────────────────────────────────
async function debugData(): Promise<void> {
  const tab = await getCurrentTab();
  try {
    let mainWorldData: any = null;
    try {
      const injectionResults = await chrome.scripting.executeScript({
        target: { tabId: tab.id! },
        world: "MAIN",
        func: extractMainWorldPageData
      });
      mainWorldData = injectionResults?.[0]?.result;
    } catch (e) {
      mainWorldData = { error: String(e) };
    }

    const domInfo = await chrome.tabs.sendMessage(tab.id!, { action: "debugDOM" });
    const debugReport = {
      extractedJobs,
      mainWorldData,
      domInfo
    };
    const reportStr = JSON.stringify(debugReport, null, 2);
    await navigator.clipboard.writeText(reportStr);
    alert("ApplyFlow diagnostics copied to clipboard!");
  } catch (err) {
    alert("Error gathering diagnostics: " + (err instanceof Error ? err.message : String(err)));
  }
}

// ── Extraction ──────────────────────────────────────────────────
async function doExtract(): Promise<void> {
  const tab = await getCurrentTab();
  const debugBtn = document.getElementById("debugBtn") as HTMLButtonElement;

  setStatus("⏳ Capturing job details…", "info");
  getEl("results").innerHTML = "";
  if (debugBtn) debugBtn.style.display = "none";
  getEl<HTMLButtonElement>("extractBtn").disabled = true;

  try {
    console.log("[ApplyFlow Popup] 📤 Inspecting page world on tab:", tab.id);

    let mainWorldData: any = null;
    try {
      const injectionResults = await chrome.scripting.executeScript({
        target: { tabId: tab.id! },
        world: "MAIN",
        func: extractMainWorldPageData
      });
      mainWorldData = injectionResults?.[0]?.result;
      console.log("[ApplyFlow Popup] Main world data:", mainWorldData);
    } catch (e) {
      console.warn("[ApplyFlow Popup] Main world execution skipped:", e);
    }

    console.log("[ApplyFlow Popup] 📤 Sending extractJobs to tab:", tab.id);
    
    const response = await chrome.tabs.sendMessage(tab.id!, {
      action: "extractJobs",
      mainWorldData
    });
    
    console.log("[ApplyFlow Popup] 📥 Response received:", response);
    
    if (!response?.jobs?.length) {
      setStatus("❌ No job details found. Open a job details page first.", "error");
      return;
    }

    extractedJobs = response.jobs.map((job: any) => {
      const pageLink = job.link || tab.url || "No URL found";
      const applyUrl = job.applyUrl || pageLink;
      return {
        title: job.title || "Unknown Title",
        company: job.company || "Unknown Company",
        link: pageLink,
        description: job.description || "No description found.",
        applyUrl: applyUrl,
        source: job.source || "detail-page",
        platform: job.platform || "Generic",
        salary: job.salary || null,
        location: job.location || null,
        workModel: job.workModel || null
      };
    });

    // Retain to storage for convenience
    try {
      await chrome.storage.local.set({
        savedJobs: extractedJobs,
        savedUrl: tab.url,
        savedTime: Date.now()
      });
    } catch (e) {
      console.warn("[ApplyFlow Popup] Could not persist to storage:", e);
    }

    setStatus(extractedJobs.length === 1 ? `✅ Captured: ${extractedJobs[0].title || "Job"}` : `✅ Captured ${extractedJobs.length} jobs`, "success");
    renderResults(extractedJobs);
    if (debugBtn) debugBtn.style.display = "inline-block";
  } catch (err) {
    console.error("[ApplyFlow Popup] ❌ Extraction error:", err);
    setStatus(`❌ Error: ${err instanceof Error ? err.message : "Could not communicate with tab. Refresh page and try again."}`, "error");
  } finally {
    getEl<HTMLButtonElement>("extractBtn").disabled = false;
  }
}

// ── Copy / Export ───────────────────────────────────────────────
function copyJSON(): void {
  if (!extractedJobs.length) { 
    setStatus("❌ Extract a job first!", "error"); 
    return; 
  }
  
  const simplified = extractedJobs.map(job => ({
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
  
  navigator.clipboard.writeText(textToCopy)
    .then(() => setStatus("✅ Copied to clipboard!", "success"))
    .catch(err => {
      console.error("[ApplyFlow Popup] ❌ Copy error:", err);
      setStatus("❌ Failed to copy", "error");
    });
}

function exportCSV(): void {
  if (!extractedJobs.length) { 
    setStatus("❌ Extract a job first!", "error"); 
    return; 
  }
  
  const header = ["Title", "Company", "Link", "Apply URL", "Platform", "Salary", "Location", "Work Model", "Description", "Source"];
  const rows = extractedJobs.map(j => [
    `"${(j.title || "").replace(/"/g, '""')}"`,
    `"${(j.company || "").replace(/"/g, '""')}"`,
    `"${j.link.replace(/"/g, '""')}"`,
    `"${(j.applyUrl || "").replace(/"/g, '""')}"`,
    `"${j.platform || "Generic"}"`,
    `"${j.salary || ""}"`,
    `"${j.location || ""}"`,
    `"${j.workModel || ""}"`,
    `"${(j.description || "").replace(/"/g, '""').replace(/\n/g, " ")}"`,
    `"${j.source || ""}"`
  ]);
  
  const csv = [header.join(","), ...rows.map(r => r.join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `applyflow_jobs_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
  setStatus("✅ CSV downloaded!", "success");
}

function clearDetails(): void {
  extractedJobs = [];
  renderResults([]);
  const debugBtn = document.getElementById("debugBtn");
  if (debugBtn) debugBtn.style.display = "none";
  chrome.storage.local.remove(["savedJobs", "savedUrl"]);
  setStatus("Ready to capture job details.", "info");
}

async function restoreSavedDetails(): Promise<void> {
  try {
    const stored = await chrome.storage.local.get(["savedJobs", "savedUrl"]);
    if (stored.savedJobs && Array.isArray(stored.savedJobs) && stored.savedJobs.length > 0) {
      console.log("[ApplyFlow Popup] 🔄 Restoring retained job details:", stored.savedJobs);
      extractedJobs = stored.savedJobs;
      renderResults(extractedJobs);
      setStatus(`✅ Retained: ${extractedJobs[0].title || "Job"} (${extractedJobs[0].company || ""})`, "success");
      const debugBtn = document.getElementById("debugBtn");
      if (debugBtn) debugBtn.style.display = "inline-block";
    }
  } catch (err) {
    console.warn("[ApplyFlow Popup] Could not restore saved details:", err);
  }
}

// ── Init ────────────────────────────────────────────────────────
(async () => {
  console.log("[ApplyFlow Popup] 🚀 Initialized");
  const tab = await getCurrentTab();
  console.log("[ApplyFlow Popup] Current tab:", tab.url);
  
  const platformInfo = getPlatformInfo(tab.url);
  renderControls(platformInfo);
  await restoreSavedDetails();
})();
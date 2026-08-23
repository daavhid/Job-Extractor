// popup.ts – MULTI-PLATFORM FIXED VERSION: extract, analyze, auto‑save to sheet on "apply"

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

// ── CONFIGURATION ─────────────────────────────────────────────────
const ANALYSIS_API_URL = "http://localhost:4000/api/jobs/analyze";
const SHEET_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbxJuxxKgtyNYQ-X010AtiU8551-425-1BkK0oB-nl6q1Sv4kqlcPdEuIuYEeNKfjEGL/exec";
// ──────────────────────────────────────────────────────────────────

// ── Utilities ────────────────────────────────────────────────────
async function getCurrentTab(): Promise<chrome.tabs.Tab> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function getPlatformInfo(url: string | undefined): PlatformInfo {
  if (!url) return { name: "Unknown", supported: false, isJobPage: false };
  
  const lowUrl = url.toLowerCase();
  
  if (lowUrl.includes("linkedin.com/jobs") || lowUrl.includes("linkedin.com/jobs/view")) {
    return { name: "LinkedIn", supported: true, isJobPage: true };
  }
  if (lowUrl.includes("jobright.ai")) {
    return { name: "JobRight", supported: true, isJobPage: true };
  }
  if (lowUrl.includes("hiringcafe.com")) {
    return { name: "Hiring Cafe", supported: true, isJobPage: true };
  }
  if (lowUrl.includes("ziprecruiter.com")) {
    return { name: "ZipRecruiter", supported: true, isJobPage: true };
  }
  
  // Generic job page identification heuristics
  const isCommonJobKeywords = lowUrl.includes("/jobs/") || 
                               lowUrl.includes("/job/") || 
                               lowUrl.includes("/careers/") || 
                               lowUrl.includes("/career/") || 
                               lowUrl.includes("greenhouse.io") || 
                               lowUrl.includes("lever.co") || 
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
  const badgeClass = platformInfo.supported ? "badge-supported" : "badge-generic";
  const alertHtml = (!platformInfo.supported && !platformInfo.isJobPage)
    ? `<div class="warning-banner">⚠️ This page is not a recognized job board, but you can try generic extraction.</div>`
    : "";

  getEl("mainContent").innerHTML = `
    <div class="platform-container">
      <span class="platform-label">Detected Platform:</span>
      <span class="platform-badge ${badgeClass}">${platformInfo.name}</span>
    </div>
    ${alertHtml}
    <div class="controls">
      <button id="extractBtn">⚡ Extract Job</button>
      <button id="copyBtn">📋 Copy JSON</button>
      <button id="exportBtn">⬇ Export CSV</button>
      <button id="analyzeBtn" style="display:none;">🔍 Analyze with AI</button>
      <button id="debugBtn" style="display:none;">🐛 Debug</button>
    </div>
    <div class="status info" id="status">Click Extract to read the job.</div>
    <div id="results"></div>
    <div id="analysis" class="analysis-container"></div>
  `;

  getEl("extractBtn").addEventListener("click", doExtract);
  getEl("copyBtn").addEventListener("click", copyJSON);
  getEl("exportBtn").addEventListener("click", exportCSV);
  getEl("analyzeBtn").addEventListener("click", doAnalyze);
  const debugBtn = document.getElementById("debugBtn");
  if (debugBtn) debugBtn.addEventListener("click", debugData);
}

function renderResults(jobs: JobResult[]): void {
  const container = getEl("results");
  
  if (!jobs || jobs.length === 0) {
    container.innerHTML = `<div class="job-card"><p style="color: #666;">No jobs to display</p></div>`;
    return;
  }

  console.log("[Popup] Rendering jobs:", jobs);

  container.innerHTML = jobs.map((job, i) => {
    const modelClass = job.workModel ? `model-${job.workModel.toLowerCase()}` : '';
    return `
    <div class="job-card">
      <div class="job-number">#${i + 1}</div>
      <div class="job-title">${esc(job.title) || "<em>No title</em>"}</div>
      <div class="job-company">${esc(job.company) || "Unknown company"}</div>
      
      <div class="job-metadata">
        ${job.salary ? `<div class="meta-item"><span>💰 Salary:</span> <strong>${esc(job.salary)}</strong></div>` : ''}
        ${job.location ? `<div class="meta-item"><span>📍 Location:</span> <strong>${esc(job.location)}</strong></div>` : ''}
        ${job.workModel ? `<div class="meta-item"><span>🏢 Model:</span> <span class="model-tag ${modelClass}">${esc(job.workModel)}</span></div>` : ''}
      </div>

      <div class="job-link">
        <strong>🔗 Job URL:</strong> 
        ${job.link ? `<a href="${esc(job.link)}" target="_blank" style="color: #0066cc; word-break: break-all;">${esc(job.link)}</a>` : "<em>No link</em>"}
      </div>
      ${job.applyUrl ? `
        <div class="job-apply-url">
          <strong>📝 Apply URL:</strong> 
          <a href="${esc(job.applyUrl)}" target="_blank" style="color: #2e7d32; word-break: break-all;">${esc(job.applyUrl)}</a>
        </div>
      ` : ''}
      <div class="job-source">
        <small>Platform: ${job.platform || "Generic"} | Source: ${job.source || "unknown"}</small>
      </div>
      ${job.description
        ? `<span class="desc-toggle" data-idx="${i}">▶ Show description</span>
           <div class="job-description" id="desc-${i}">${esc(job.description)}</div>`
        : `<span class="desc-toggle no-desc">No description</span>`
      }
    </div>
  `}).join("");

  container.querySelectorAll<HTMLElement>(".desc-toggle[data-idx]").forEach(toggle => {
    toggle.addEventListener("click", () => {
      const idx = toggle.getAttribute("data-idx");
      const descEl = document.getElementById(`desc-${idx}`);
      if (!descEl) return;
      const open = descEl.classList.toggle("open");
      toggle.textContent = (open ? "▼ Hide" : "▶ Show") + " description";
    });
  });
}

// ── Debug Function ──────────────────────────────────────────────
function debugData(): void {
  console.log("=== DEBUG: Current extractedJobs ===");
  console.log(JSON.stringify(extractedJobs, null, 2));
  console.log("=== DEBUG: End ===");
  
  if (extractedJobs.length > 0) {
    alert(`Job data:\nTitle: ${extractedJobs[0].title}\nCompany: ${extractedJobs[0].company}\nLink: ${extractedJobs[0].link}\nApply URL: ${extractedJobs[0].applyUrl || 'N/A'}\nPlatform: ${extractedJobs[0].platform || 'N/A'}\nSalary: ${extractedJobs[0].salary || 'N/A'}\nLocation: ${extractedJobs[0].location || 'N/A'}\nWork Model: ${extractedJobs[0].workModel || 'N/A'}`);
  } else {
    alert("No job data extracted yet. Click 'Extract Job' first.");
  }
}

// ── Extraction ──────────────────────────────────────────────────
async function doExtract(): Promise<void> {
  const tab = await getCurrentTab();
  const analyzeBtn = getEl<HTMLButtonElement>("analyzeBtn");
  const debugBtn = document.getElementById("debugBtn") as HTMLButtonElement;

  setStatus("⏳ Extracting…", "info");
  getEl("results").innerHTML = "";
  getEl("analysis").innerHTML = "";
  analyzeBtn.style.display = "none";
  if (debugBtn) debugBtn.style.display = "none";
  getEl<HTMLButtonElement>("extractBtn").disabled = true;

  try {
    console.log("[Popup] 📤 Sending extractJobs to tab:", tab.id);
    
    const response = await chrome.tabs.sendMessage(tab.id!, { action: "extractJobs" });
    
    console.log("[Popup] 📥 Response received:", response);
    
    if (!response?.jobs?.length) {
      setStatus("❌ No job details found. Make sure you are on a job details section.", "error");
      return;
    }

    // Map and ensure all fields are present
    extractedJobs = response.jobs.map((job: any) => {
      const pageLink = job.link || tab.url || "No URL found";
      return {
        title: job.title || "Unknown Title",
        company: job.company || "Unknown Company",
        link: pageLink,
        description: job.description || "No description found.",
        applyUrl: job.applyUrl || pageLink,
        source: job.source || "detail-page",
        platform: job.platform || "Generic",
        salary: job.salary || null,
        location: job.location || null,
        workModel: job.workModel || null
      };
    });

    console.log("[Popup] ✅ Processed jobs:", extractedJobs);

    setStatus(`` + (extractedJobs.length === 1 ? `✅ Job details extracted` : `✅ ${extractedJobs.length} job(s) extracted`), "success");
    renderResults(extractedJobs);
    analyzeBtn.style.display = "inline-block";
    if (debugBtn) debugBtn.style.display = "inline-block";
  } catch (err) {
    console.error("[Popup] ❌ Extraction error:", err);
    setStatus(`❌ Error: ${err instanceof Error ? err.message : "Could not communicate with tab. Refresh page and try again."}`, "error");
  } finally {
    getEl<HTMLButtonElement>("extractBtn").disabled = false;
  }
}

// ── Analyze + Auto‑save to Google Sheet if "apply" ──────────────
async function doAnalyze(): Promise<void> {
  if (!extractedJobs.length) {
    setStatus("❌ Extract a job first!", "error");
    return;
  }

  const analyzeBtn = getEl<HTMLButtonElement>("analyzeBtn");
  analyzeBtn.disabled = true;
  setStatus("⏳ Sending to AI…", "info");
  getEl("analysis").innerHTML = "";

  try {
    const job = extractedJobs[0];
    console.log("[Popup] 📤 Sending job to AI:", job);

    // 1. Call AI backend
    const res = await fetch(ANALYSIS_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(job),
    });
    if (!res.ok) throw new Error(`Backend responded with ${res.status}`);
    const analysis = await res.json();
    console.log("[Popup] 📥 AI Response:", analysis);

    // 2. Display analysis
    getEl("analysis").innerHTML = `
      <div class="analysis-card">
        <h3>📊 AI Analysis</h3>
        <pre>${esc(JSON.stringify(analysis, null, 2))}</pre>
      </div>`;
    setStatus("✅ Analysis complete", "success");

    // 3. If recommendation is "apply", automatically push to Google Sheet
    const rec = analysis.data?.recommendation || analysis.recommendation;
    if (rec && rec.toLowerCase() === "apply") {
      setStatus("📊 Saving to Google Sheet…", "info");
      await saveJobToSheet({
        spreadsheetId: "1P7HNnwh7QOCZK0W4-CCTIbfIhaeCiAcazHJsShe0TC4",
        title: job.title,
        company: job.company,
        link: job.link,
        description: job.description,
        applyUrl: job.applyUrl || job.link || "",
        platform: job.platform || "Generic",
        onsite: job.workModel || "",
        salary: job.salary || "",
        location: job.location || ""
      });
      setStatus("✅ Job saved to Google Sheet!", "success");
    } else {
      console.log("[Popup] ℹ️ Recommendation is not 'apply', skipping sheet save");
    }
  } catch (err) {
    setStatus(`❌ Analysis error: ${err instanceof Error ? err.message : "Failed"}`, "error");
    console.error("[Popup] ❌ Analysis error:", err);
  } finally {
    analyzeBtn.disabled = false;
  }
}

// ── Helper: save job to Google Sheet ─────────────────────────────
async function saveJobToSheet(jobData: {
  spreadsheetId?: string;
  title: string | null;
  company: string | null;
  link: string;
  description: string | null;
  applyUrl: string;
  platform: string;
  onsite: string;
  salary?: string;
  location?: string;
}): Promise<void> {
  try {
    console.log("[Popup] 📤 Saving to sheet:", jobData);
    await fetch(SHEET_WEB_APP_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(jobData),
    });
    console.log("[Popup] ✅ Sheet save request sent");
  } catch (err) {
    console.error("[Popup] ❌ Sheet save error:", err);
    throw err;
  }
}

// ── Copy / Export ───────────────────────────────────────────────
function copyJSON(): void {
  if (!extractedJobs.length) { 
    setStatus("❌ Extract jobs first!", "error"); 
    return; 
  }
  
  navigator.clipboard.writeText(JSON.stringify(extractedJobs, null, 2))
    .then(() => setStatus("✅ JSON copied!", "success"))
    .catch(err => {
      console.error("[Popup] ❌ Copy error:", err);
      setStatus("❌ Failed to copy", "error");
    });
}

function exportCSV(): void {
  if (!extractedJobs.length) { 
    setStatus("❌ Extract jobs first!", "error"); 
    return; 
  }
  
  const header = ["Title", "Company", "Link", "Description", "Apply URL", "Platform", "Salary", "Location", "Work Model", "Source"];
  const rows = extractedJobs.map(j => [
    `"${(j.title || "").replace(/"/g, '""')}"`,
    `"${(j.company || "").replace(/"/g, '""')}"`,
    `"${j.link.replace(/"/g, '""')}"`,
    `"${(j.description || "").replace(/"/g, '""').replace(/\n/g, " ")}"`,
    `"${(j.applyUrl || "").replace(/"/g, '""')}"`,
    `"${j.platform || "Generic"}"`,
    `"${j.salary || ""}"`,
    `"${j.location || ""}"`,
    `"${j.workModel || ""}"`,
    `"${j.source || ""}"`
  ]);
  
  const csv = [header.join(","), ...rows.map(r => r.join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `job_details_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
  setStatus("✅ CSV downloaded!", "success");
}

// ── Init ────────────────────────────────────────────────────────
(async () => {
  console.log("[Popup] 🚀 Popup initialized");
  const tab = await getCurrentTab();
  console.log("[Popup] Current tab:", tab.url);
  
  const platformInfo = getPlatformInfo(tab.url);
  console.log("[Popup] Platform Info:", platformInfo);
  
  renderControls(platformInfo);
})();
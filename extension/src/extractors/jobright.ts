import { BaseExtractor, type JobResult } from "./base";

export class JobRightExtractor extends BaseExtractor {
  match(url: string): boolean {
    return url.includes("jobright.ai");
  }

  async extract(): Promise<JobResult[]> {
    console.log("[JobRight Extractor] 🚀 Extracting job details...");
    
    // 1. Try to extract from Next.js state (preferred for JobRight Next.js hydration)
    const nextJobs = this.extractFromNextData("JobRight");
    if (nextJobs.length > 0) {
      console.log("[JobRight Extractor] ✅ Extraction successful via Next.js props:", nextJobs);
      return nextJobs;
    }

    // 2. Try to extract from JSON-LD
    const jsonLdJobs = this.extractFromJSONLD("JobRight");
    
    // 3. Perform DOM extraction as fallback or enrichment
    const detailJob = await this.extractFromDOM();
    
    if (detailJob) {
      const existingIndex = jsonLdJobs.findIndex((j) => j.link === detailJob.link || (j.title === detailJob.title && j.company === detailJob.company));
      if (existingIndex === -1) {
        jsonLdJobs.unshift(detailJob);
      } else {
        const existing = jsonLdJobs[existingIndex];
        if (!existing.title) existing.title = detailJob.title;
        if (!existing.company) existing.company = detailJob.company;
        if (!existing.description) existing.description = detailJob.description;
        if (!existing.applyUrl) existing.applyUrl = detailJob.applyUrl;
        if (!existing.salary) existing.salary = detailJob.salary;
        if (!existing.location) existing.location = detailJob.location;
        if (!existing.workModel) existing.workModel = detailJob.workModel;
      }
    }
    
    return jsonLdJobs;
  }

  private async extractFromDOM(): Promise<JobResult | null> {
    const titleSelectors = [
      'h1',
      '[class*="job-title"]',
      '[class*="JobTitle"]',
      '[class*="jobTitle"]'
    ];

    const companySelectors = [
      '[class*="company-name"]',
      '[class*="companyName"]',
      'a[href*="/company/"]',
      '[class*="company"]',
      '[class*="employer"]'
    ];

    const title = this.getBySelectors(titleSelectors) || (document.title ? document.title.split("|")[0]?.trim() : null);
    const company = this.getBySelectors(companySelectors);

    if (!title && !company) {
      return null;
    }

    // Loop through description selectors and ensure we only match descriptions of substantial length (>150 chars)
    let description: string | null = null;
    const descSelectors = [
      "[class*='JobDetail_jobDescription']",
      "[class*='jobDescription']",
      "[class*='description']",
      "#job-description",
      ".job-description"
    ];
    for (const sel of descSelectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent && el.textContent.trim().length > 150) {
        description = this.htmlToText(el.innerHTML);
        break;
      }
    }

    if (!description) {
      let bestBlock: { el: HTMLElement; len: number } | null = null;
      document.querySelectorAll<HTMLElement>("div, section, article").forEach((el) => {
        const len = el.textContent?.trim().length ?? 0;
        if (len > 300 && len < 25000 && (!bestBlock || len > bestBlock.len)) {
          bestBlock = { el, len };
        }
      });
      if (bestBlock) {
        description = this.htmlToText((bestBlock as { el: HTMLElement }).el.innerHTML);
      }
    }

    // Extract metrics
    const salary = this.extractSalaryFromDOM();
    const location = this.extractLocationFromDOM();
    const workModel = this.extractWorkModelFromText(description) || this.extractWorkModelFromText(location) || this.extractWorkModelFromText(document.body.innerText);

    // Apply URL
    let applyUrl: string | null = null;
    const applyButtons = Array.from(document.querySelectorAll<HTMLAnchorElement | HTMLButtonElement>("a, button"));
    for (const btn of applyButtons) {
      const text = (btn.textContent || "").toLowerCase();
      if (text.includes("apply") || text.includes("apply now") || text.includes("apply on company")) {
        if (btn instanceof HTMLAnchorElement && btn.href && !btn.href.startsWith("javascript:")) {
          applyUrl = btn.href;
          break;
        }
      }
    }

    return {
      title,
      company,
      link: window.location.href,
      description,
      applyUrl: applyUrl || window.location.href,
      source: "detail-page",
      platform: "JobRight",
      salary,
      location,
      workModel
    };
  }
}

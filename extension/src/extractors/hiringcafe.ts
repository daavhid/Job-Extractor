import { BaseExtractor, type JobResult } from "./base";

export class HiringCafeExtractor extends BaseExtractor {
  match(url: string): boolean {
    return url.includes("hiringcafe.com");
  }

  async extract(): Promise<JobResult[]> {
    console.log("[Hiring Cafe Extractor] 🚀 Extracting job details...");
    
    // 1. Try to extract from Next.js state (preferred if built on Next.js)
    const nextJobs = this.extractFromNextData("Hiring Cafe");
    if (nextJobs.length > 0) {
      console.log("[Hiring Cafe Extractor] ✅ Extraction successful via Next.js props:", nextJobs);
      return nextJobs;
    }

    // 2. Try to extract from JSON-LD
    const jsonLdJobs = this.extractFromJSONLD("Hiring Cafe");
    
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
      'h2[class*="title"]',
      '[class*="JobTitle"]',
      '[class*="jobTitle"]',
      '[class*="job-title"]'
    ];

    const companySelectors = [
      'a[href*="/company/"]',
      '[class*="company"]',
      '[class*="employer"]',
      '[class*="org-name"]'
    ];

    const title = this.getBySelectors(titleSelectors) || (document.title ? document.title.split("|")[0]?.trim() : null);
    const company = this.getBySelectors(companySelectors);

    if (!title && !company) {
      return null;
    }

    let description: string | null = null;
    const descSelectors = [
      "[class*='description']",
      "[class*='job-details']",
      "#description"
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
      if (text.includes("apply") || text.includes("apply now") || text.includes("apply on company") || text.includes("external")) {
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
      platform: "Hiring Cafe",
      salary,
      location,
      workModel
    };
  }
}

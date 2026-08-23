import { BaseExtractor, type JobResult } from "./base";

export class ZipRecruiterExtractor extends BaseExtractor {
  match(url: string): boolean {
    return url.includes("ziprecruiter.com");
  }

  async extract(): Promise<JobResult[]> {
    console.log("[ZipRecruiter Extractor] 🚀 Extracting job details...");
    
    // 1. Try to extract from JSON-LD
    const jsonLdJobs = this.extractFromJSONLD("ZipRecruiter");
    
    // 2. Perform DOM extraction as fallback or enrichment
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
      '.job_title',
      'h1.job_title',
      'h1',
      '[class*="jobTitle"]',
      '[class*="job_title"]'
    ];

    const companySelectors = [
      '.hiring_company .name',
      'a.hiring_company',
      '.hiring_company',
      '.company_name',
      'a[href*="/c/"]',
      '.job_details_company_link'
    ];

    const title = this.getBySelectors(titleSelectors) || (document.title ? document.title.split("|")[0]?.trim() : null);
    const company = this.getBySelectors(companySelectors);

    if (!title && !company) {
      return null;
    }

    // Narrow down description elements to avoid fetching sidebar recommendations
    let description: string | null = null;
    const descSelectors = [
      '[itemprop="description"]',
      '.jobDescriptionSection',
      '.job_description',
      '[class*="jobDescription"]',
      '.job-description'
    ];
                   
    for (const selector of descSelectors) {
      const el = document.querySelector(selector);
      if (el && el.textContent && el.textContent.trim().length > 150) {
        description = this.htmlToText(el.innerHTML);
        break;
      }
    }

    if (!description) {
      // Fallback: search for largest block inside main article or main section if possible
      let bestBlock: { el: HTMLElement; len: number } | null = null;
      const containers = document.querySelectorAll<HTMLElement>("article, section, [role='main']");
      const targetList = containers.length > 0 ? containers : document.querySelectorAll<HTMLElement>("div");
      
      targetList.forEach((el) => {
        const len = el.textContent?.trim().length ?? 0;
        // Avoid matching outer layout containers or huge lists
        if (len > 300 && len < 15000 && (!bestBlock || len > bestBlock.len)) {
          bestBlock = { el, len };
        }
      });
      
      if (bestBlock) {
        description = this.htmlToText((bestBlock as { el: HTMLElement }).el.innerHTML);
      }
    }

    // Extract additional metrics
    const salary = this.extractSalaryFromDOM();
    const location = this.extractLocationFromDOM();
    const workModel = this.extractWorkModelFromText(description) || this.extractWorkModelFromText(location) || this.extractWorkModelFromText(document.body.innerText);

    // Apply URL
    let applyUrl: string | null = null;
    const applyButtons = Array.from(document.querySelectorAll<HTMLAnchorElement | HTMLButtonElement>("a, button"));
    for (const btn of applyButtons) {
      const text = (btn.textContent || "").toLowerCase();
      if (text.includes("apply") || text.includes("apply now") || text.includes("apply on company") || text.includes("quick apply")) {
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
      platform: "ZipRecruiter",
      salary,
      location,
      workModel
    };
  }
}

import { BaseExtractor, type JobResult } from "./base";

export class LinkedInExtractor extends BaseExtractor {
  match(url: string): boolean {
    return url.includes("linkedin.com");
  }

  async extract(): Promise<JobResult[]> {
    console.log("[LI Extractor] 🚀 Extraction started");

    const jsonLdJobs = this.extractFromJSONLD("LinkedIn");

    // Check if on a job detail page
    if (window.location.pathname.startsWith("/jobs/view/") || window.location.pathname.startsWith("/jobs/collections/")) {
      console.log("[LI Extractor] 📌 On a job detail page → semantic extraction");
      const detailJob = await this.extractFromDetailPage();

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
        return jsonLdJobs;
      }
      console.warn("[LI Extractor] ⚠️ Semantic extraction failed, falling back to JSON-LD only");
    } else {
      console.log("[LI Extractor] ℹ️ Not a job detail page; returning JSON-LD (if any)");
    }

    return jsonLdJobs;
  }

  private async extractFromDetailPage(): Promise<JobResult | null> {
    const { title, company } = this.getTitleAndCompany();
    console.log(`[LI Extractor] Title: "${title}" | Company: "${company}"`);

    if (!title && !company) {
      console.warn("[LI Extractor] ❌ No title or company found");
      return null;
    }

    const description = await this.extractDescription();
    const applyUrl = await this.extractRealApplyUrl();
    const salary = this.extractSalaryFromDOM();
    const location = this.extractLocationFromDOM();
    const workModel = this.extractWorkModelFromText(description) || this.extractWorkModelFromText(location) || this.extractWorkModelFromText(document.body.innerText);

    return {
      title,
      company,
      link: window.location.href,
      description,
      applyUrl,
      source: "detail-page",
      platform: "LinkedIn",
      salary,
      location,
      workModel
    };
  }

  private getTitleAndCompany(): { title: string | null; company: string | null } {
    const titleSelectors = [
      'h1.job-details-jobs-unified-top-card__job-title',
      '.job-details-jobs-unified-top-card__job-title h1',
      '.jobs-unified-top-card__job-title h1',
      'h1.t-24',
      '.jobs-details__main-content h1',
      '.jobs-description__title',
      'h1'
    ];

    const companySelectors = [
      '.job-details-jobs-unified-top-card__company-name a',
      '.job-details-jobs-unified-top-card__company-name',
      '.jobs-unified-top-card__company-name a',
      '.jobs-unified-top-card__company-name',
      '.jobs-details__main-content a[href*="/company/"]',
      'a[href*="/company/"]'
    ];

    const title = this.getBySelectors(titleSelectors);
    
    // Find the company name
    let company: string | null = null;
    for (const selector of companySelectors) {
      const el = document.querySelector(selector);
      if (el && el.textContent) {
        const text = this.cleanStr(el.textContent);
        if (text && !/^(see all|follow|visit|view)/i.test(text)) {
          company = text;
          break;
        }
      }
    }

    // Fallback: document.title
    let finalTitle = title;
    if (!finalTitle && document.title) {
      const parts = document.title.split(" | ");
      const candidate = parts[0]?.trim();
      if (candidate && candidate.length > 2 && !/^linkedin$/i.test(candidate)) {
        finalTitle = candidate;
        console.log(`[LI Extractor] ✅ Title from <title>: "${finalTitle}"`);
      }
    }

    return { title: finalTitle, company };
  }

  private async extractDescription(): Promise<string | null> {
    console.log("[LI Extractor] 🔍 Extracting description...");

    const selectors = [
      '#job-details',
      '.jobs-description__content',
      '.jobs-description',
      '.jobs-box__html-content',
      '.description__text'
    ];

    const text = this.getBySelectors(selectors);
    if (text) {
      const cleaned = text.replace(/^About the job\s*/i, '').trim();
      console.log(`[LI Extractor] ✅ Description found via selectors (${cleaned.length} chars)`);
      return cleaned;
    }

    // Fallback: search for About the job H2
    const h2 = await this.waitForAboutTheJobH2();
    if (h2) {
      const grandparent = h2.parentElement?.parentElement;
      if (grandparent) {
        const fullText = grandparent.textContent?.trim() ?? "";
        const description = fullText.replace("About the job", "").replace(/\s+/g, " ").trim();
        if (description.length > 50) {
          console.log(`[LI Extractor] ✅ Description via grandparent (${description.length} chars)`);
          return description;
        }
      }
    }

    console.error("[LI Extractor] ❌ All description strategies failed");
    return null;
  }

  private async extractRealApplyUrl(): Promise<string | null> {
    console.log("[LI Extractor] 🔍 Searching for real Apply link...");
    const applyLink = await this.waitForElement<HTMLAnchorElement>(
      'a[href*="safety/go"]',
      1500 // Optimized timeout for fast response
    );
    if (!applyLink) {
      console.warn("[LI Extractor] ⚠️ No safety/go link found");
      return null;
    }
    try {
      const url = new URL(applyLink.href);
      const encoded = url.searchParams.get("url");
      if (encoded) {
        const realUrl = decodeURIComponent(encoded);
        console.log("[LI Extractor] ✅ Real apply URL:", realUrl);
        return realUrl;
      }
      console.warn("[LI Extractor] ⚠️ safety/go link had no url param");
      return null;
    } catch (e) {
      console.warn("[LI Extractor] ⚠️ Failed to parse Apply URL:", e);
      return null;
    }
  }

  private async waitForAboutTheJobH2(
    timeout = 3000,
    interval = 200
  ): Promise<HTMLHeadingElement | null> {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const check = (): void => {
        const h2 = Array.from(document.querySelectorAll<HTMLHeadingElement>("h2")).find(
          (el) => (el.textContent ?? "").trim() === "About the job"
        );
        if (h2) {
          resolve(h2);
          return;
        }
        if (Date.now() - startTime >= timeout) {
          resolve(null);
          return;
        }
        setTimeout(check, interval);
      };
      check();
    });
  }
}

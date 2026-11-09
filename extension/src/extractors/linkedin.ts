import { BaseExtractor, type JobResult } from "./base";

export class LinkedInExtractor extends BaseExtractor {
  match(url: string): boolean {
    return url.includes("linkedin.com");
  }

  async extract(mainWorldData?: any): Promise<JobResult[]> {
    console.log("[LI Extractor] 🚀 Extraction started on:", window.location.href);

    // 1. Try to extract from the active DOM details pane / page (works for both dedicated & split search preview)
    const detailJob = await this.extractFromActivePage(mainWorldData);
    if (detailJob) {
      console.log("[LI Extractor] ✅ Extracted job from DOM details pane:", detailJob);
      return [detailJob];
    }

    // 2. Fallback to JSON-LD
    const jsonLdJobs = this.extractFromJSONLD("LinkedIn");
    if (jsonLdJobs.length > 0) {
      return jsonLdJobs;
    }

    return [];
  }

  private async extractFromActivePage(mainWorldData?: any): Promise<JobResult | null> {
    // Locate the active job details pane
    const detailsPane = this.findActiveDetailsPane();
    console.log("[LI Extractor] Active details pane found:", !!detailsPane);

    const { title, company } = this.getTitleAndCompany(detailsPane);
    console.log(`[LI Extractor] Title: "${title}" | Company: "${company}"`);

    if (!title && !company) {
      console.warn("[LI Extractor] ❌ No title or company found");
      return null;
    }

    // Extract Job ID to build direct LinkedIn view link
    const jobId = this.extractJobId(detailsPane);
    const directViewLink = jobId ? `https://www.linkedin.com/jobs/view/${jobId}/` : window.location.href;

    const description = await this.extractDescription(detailsPane);
    
    // Direct Application URL: look for external ATS application link (Greenhouse, Lever, Workday, etc.)
    const directApplyUrl = (mainWorldData?.applyUrl ? this.cleanDirectUrl(mainWorldData.applyUrl) : null) || await this.extractRealApplyUrl(detailsPane) || directViewLink;

    const salary = this.extractSalaryFromDOM(detailsPane || document);
    const location = this.extractLocation(detailsPane);
    const workModel = this.extractWorkModelFromText(description) || 
                      this.extractWorkModelFromText(location) || 
                      this.extractWorkModelFromText(detailsPane ? (detailsPane as HTMLElement).innerText : document.body.innerText);

    return {
      title,
      company,
      link: directViewLink,
      description,
      applyUrl: this.cleanDirectUrl(directApplyUrl),
      source: "detail-page",
      platform: "LinkedIn",
      salary,
      location,
      workModel
    };
  }

  /**
   * Identifies the active job details container pane in split-view or dedicated view
   */
  private findActiveDetailsPane(): ParentNode {
    const paneSelectors = [
      '.jobs-search__job-details',
      '.jobs-search-two-pane__details',
      '.jobs-details__main-content',
      '.job-view-layout',
      '.job-details-jobs-unified-top-card',
      '.jobs-details',
      '#job-details',
      'main'
    ];

    for (const sel of paneSelectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent && el.textContent.trim().length > 100) {
        return el;
      }
    }

    return document;
  }

  private extractJobId(pane: ParentNode): string | null {
    // 1. From URL query parameter
    try {
      const url = new URL(window.location.href);
      const currentJobId = url.searchParams.get("currentJobId") || url.searchParams.get("jobId");
      if (currentJobId && /^\d+$/.test(currentJobId)) {
        return currentJobId;
      }
    } catch {}

    // 2. From pathname /jobs/view/12345/
    const pathMatch = window.location.pathname.match(/\/jobs\/view\/(\d+)/);
    if (pathMatch && pathMatch[1]) {
      return pathMatch[1];
    }

    // 3. From active job card in search list
    const activeCard = document.querySelector('li.jobs-search-results__list-item--active, [data-occludable-job-id], .job-card-container--clickable');
    if (activeCard) {
      const dataId = activeCard.getAttribute("data-occludable-job-id") || 
                     activeCard.getAttribute("data-job-id") || 
                     activeCard.getAttribute("data-entity-urn")?.split(":").pop();
      if (dataId && /^\d+$/.test(dataId)) {
        return dataId;
      }
    }

    // 4. From pane elements or apply button attributes
    const applyBtn = pane.querySelector('[data-job-id]');
    if (applyBtn) {
      const id = applyBtn.getAttribute("data-job-id");
      if (id && /^\d+$/.test(id)) return id;
    }

    return null;
  }

  private getTitleAndCompany(pane: ParentNode): { title: string | null; company: string | null } {
    const titleSelectors = [
      'h1.job-details-jobs-unified-top-card__job-title',
      '.job-details-jobs-unified-top-card__job-title h1',
      '.jobs-unified-top-card__job-title h1',
      '.job-details-jobs-unified-top-card__job-title a',
      '.jobs-unified-top-card__job-title a',
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
      '.job-details-jobs-unified-top-card__primary-description-container a',
      '.jobs-details__main-content a[href*="/company/"]',
      'a[href*="/company/"]'
    ];

    let title = this.getBySelectors(titleSelectors, pane);
    
    // Find company name using specific selectors first
    let company: string | null = null;
    for (const selector of companySelectors) {
      const el = pane.querySelector(selector);
      if (el && el.textContent) {
        const text = this.cleanStr(el.textContent);
        if (text && !/^(see all|follow|visit|view|about the company)/i.test(text)) {
          company = text;
          break;
        }
      }
    }

    // If company not found, use BaseExtractor heuristics (logo alt, subtitle, etc.)
    if (!company) {
      company = this.findCompanyName(pane, title);
    }

    // If active card on search list is available, check it too
    if (!company) {
      const activeCard = document.querySelector('li.jobs-search-results__list-item--active');
      if (activeCard) {
        const sub = activeCard.querySelector('.artdeco-entity-lockup__subtitle, .job-card-container__primary-description');
        if (sub && sub.textContent) {
          company = this.cleanStr(sub.textContent);
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
      }
    }

    return { title: finalTitle, company };
  }

  private extractLocation(pane: ParentNode): string | null {
    const locSelectors = [
      '.job-details-jobs-unified-top-card__primary-description-container span',
      '.job-details-jobs-unified-top-card__primary-description span',
      '.job-details-jobs-unified-top-card__bullet',
      '.jobs-unified-top-card__bullet',
      '.job-details-jobs-unified-top-card__tertiary-description',
      '.artdeco-entity-lockup__caption',
      '.jobs-unified-top-card__workplace-type'
    ];
    for (const sel of locSelectors) {
      const els = Array.from(pane.querySelectorAll(sel));
      for (const el of els) {
        const text = this.cleanStr(el.textContent);
        if (text && text.length > 2 && !text.includes("ago") && !text.includes("applicant") && !text.includes("repost") && !text.includes("promoted")) {
          const firstPart = text.split(/[·•|]/)[0]?.trim();
          if (firstPart && firstPart.length > 2 && !firstPart.includes("ago") && !firstPart.includes("applicant")) {
            return firstPart;
          }
          return text;
        }
      }
    }
    return this.extractLocationFromDOM(pane);
  }

  private async extractDescription(pane: ParentNode): Promise<string | null> {
    console.log("[LI Extractor] 🔍 Extracting description...");

    const selectors = [
      '#job-details',
      '.jobs-description__content',
      '.jobs-description',
      '.jobs-box__html-content',
      '.description__text'
    ];

    const text = this.getBySelectors(selectors, pane);
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
          return description;
        }
      }
    }

    return null;
  }

  /**
   * Extracts the direct external ATS apply URL from LinkedIn's safety redirect wrapper or top-card apply button
   */
  private async extractRealApplyUrl(pane: ParentNode): Promise<string | null> {
    console.log("[LI Extractor] 🔍 Searching for direct ATS Apply link...");

    // 1. Look for safety/go redirect link in top-card or document
    const applyLink = pane.querySelector<HTMLAnchorElement>('a[href*="safety/go"], a[href*="externalApply"]') || 
                      document.querySelector<HTMLAnchorElement>('a[href*="safety/go"], a[href*="externalApply"]');
    if (applyLink) {
      try {
        const url = new URL(applyLink.href);
        const encoded = url.searchParams.get("url");
        if (encoded) {
          const realUrl = decodeURIComponent(encoded);
          console.log("[LI Extractor] ✅ Real external apply URL decoded from safety/go:", realUrl);
          return realUrl;
        }
        return applyLink.href;
      } catch (e) {
        console.warn("[LI Extractor] ⚠️ Failed to parse Apply URL:", e);
      }
    }

    // 2. Inspect the top-card apply buttons (e.g. .jobs-apply-button)
    const topCardApplyBtns = Array.from(pane.querySelectorAll<HTMLElement>(
      'a.jobs-apply-button, .jobs-apply-button a, a[data-control-name="jobdetails_topcard_inapply"], button.jobs-apply-button, [data-job-id] a'
    ));

    for (const btn of topCardApplyBtns) {
      const anchor = (btn instanceof HTMLAnchorElement ? btn : btn.querySelector("a")) as HTMLAnchorElement | null;
      if (anchor && anchor.href && !anchor.href.startsWith("javascript:") && !anchor.href.includes("linkedin.com/jobs/view")) {
        const cleaned = this.cleanDirectUrl(anchor.href);
        if (cleaned) {
          console.log("[LI Extractor] ✅ External apply button URL found:", cleaned);
          return cleaned;
        }
      }
    }

    // 3. Look for explicit known ATS links strictly in top-card / action areas (NOT inside description body)
    const topCard = pane.querySelector('.jobs-unified-top-card, .job-details-jobs-unified-top-card, .job-view-layout header') || pane;
    const topCardAts = this.findDirectApplyUrl(topCard);
    if (topCardAts && !topCardAts.includes("linkedin.com")) {
      return topCardAts;
    }

    // Easy Apply or internal listing — no external ATS link
    return null;
  }

  private async waitForAboutTheJobH2(
    timeout = 2000,
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

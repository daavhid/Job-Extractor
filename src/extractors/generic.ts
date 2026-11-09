import { BaseExtractor, type JobResult } from "./base";

export class GenericExtractor extends BaseExtractor {
  match(_url: string): boolean {
    return true; // Match anything as fallback
  }

  async extract(mainWorldData?: any): Promise<JobResult[]> {
    console.log("[Generic Extractor] 🚀 Running generic extraction on:", window.location.href);

    const jobPermalink = mainWorldData?.directLink || window.location.href;

    // 1. Try React Fiber inspection on main containers
    const fiberJob = this.extractFromReactFiber(document.querySelector("main, article, [role='main']") || document.body);
    if (fiberJob && fiberJob.title && (fiberJob.company || fiberJob.applyUrl || fiberJob.description)) {
      console.log("[Generic Extractor] ✅ Extracted job via React Fiber:", fiberJob);
      const directApply = this.cleanDirectUrl(mainWorldData?.applyUrl || fiberJob.applyUrl || this.findDirectApplyUrl());
      return [{
        title: this.cleanStr(fiberJob.title),
        company: this.cleanStr(fiberJob.company) || this.findCompanyName(document, fiberJob.title),
        link: jobPermalink,
        description: this.cleanStr(fiberJob.description) || this.findDescriptionFromDOM(),
        applyUrl: directApply || jobPermalink,
        source: "detail-page",
        platform: "Generic",
        salary: fiberJob.salary || this.extractSalaryFromDOM(),
        location: fiberJob.location || this.extractLocationFromDOM(),
        workModel: fiberJob.workModel || this.extractWorkModelFromText(fiberJob.description)
      }];
    }

    // 2. Try Next.js state data
    const nextJobs = this.extractFromNextData("Generic");
    if (nextJobs.length > 0) {
      console.log("[Generic Extractor] ✅ Found job via Next.js state data:", nextJobs);
      return nextJobs;
    }

    // 3. Try JSON-LD
    const jsonLdJobs = this.extractFromJSONLD("Generic");
    if (jsonLdJobs.length > 0) {
      console.log(`[Generic Extractor] Found ${jsonLdJobs.length} job(s) via JSON-LD`);
      
      for (const job of jsonLdJobs) {
        if (!job.company) {
          job.company = this.findCompanyName(document, job.title);
        }
        if (!job.applyUrl || job.applyUrl === window.location.href) {
          job.applyUrl = this.findDirectApplyUrl() || job.applyUrl;
        }
        if (!job.salary) {
          job.salary = this.extractSalaryFromDOM();
        }
        if (!job.location) {
          job.location = this.extractLocationFromDOM();
        }
        if (!job.workModel) {
          job.workModel = this.extractWorkModelFromText(job.description) || 
                          this.extractWorkModelFromText(job.location) || 
                          this.extractWorkModelFromText(document.body.innerText);
        }
      }
      return jsonLdJobs;
    }

    // 4. Fallback to Meta tags + DOM heuristics
    console.log("[Generic Extractor] 📌 JSON-LD failed, falling back to Meta tags & Heuristics");
    const detailJob = await this.extractFromDOM(mainWorldData);
    if (detailJob) {
      return [detailJob];
    }

    return [];
  }

  private async extractFromDOM(mainWorldData?: any): Promise<JobResult | null> {
    // A. Title Extraction
    let title: string | null = null;
    
    // Check meta tags first
    const ogTitle = document.querySelector('meta[property="og:title"]') || document.querySelector('meta[name="twitter:title"]');
    if (ogTitle) {
      title = ogTitle.getAttribute("content");
    }
    
    // Check H1 elements
    if (!title) {
      const h1s = Array.from(document.querySelectorAll("h1"));
      const goodH1 = h1s.find(h1 => h1.textContent?.trim() && h1.textContent.trim().length > 3 && h1.getBoundingClientRect().height > 0);
      if (goodH1) {
        title = goodH1.textContent.trim();
      }
    }
    
    // Fallback to page title
    if (!title && document.title) {
      const parts = document.title.split(/[|\-·]/);
      title = parts[0]?.trim() || document.title.trim();
    }

    // B. Company Extraction
    const company = this.findCompanyName(document, title);

    if (!title && !company) {
      return null;
    }

    // C. Description Extraction
    const description = this.findDescriptionFromDOM();

    // D. Extract metrics
    const salary = this.extractSalaryFromDOM();
    const location = this.extractLocationFromDOM();
    const workModel = this.extractWorkModelFromText(description) || 
                      this.extractWorkModelFromText(location) || 
                      this.extractWorkModelFromText(document.body.innerText);

    const jobPermalink = mainWorldData?.directLink || window.location.href;

    // E. Direct Apply URL
    const directApplyUrl = (mainWorldData?.applyUrl ? this.cleanDirectUrl(mainWorldData.applyUrl) : null) || this.findDirectApplyUrl() || jobPermalink;

    return {
      title: title || "Unknown Title",
      company: company || "Unknown Company",
      link: jobPermalink,
      description: description || "No job description found.",
      applyUrl: this.cleanDirectUrl(directApplyUrl),
      source: "detail-page",
      platform: "Generic",
      salary,
      location,
      workModel
    };
  }

  private findDescriptionFromDOM(): string | null {
    let description: string | null = null;
    
    // Look for description meta
    const metaDesc = document.querySelector('meta[property="og:description"]') || document.querySelector('meta[name="description"]');
    if (metaDesc) {
      description = metaDesc.getAttribute("content");
    }

    // Look for typical description element IDs/classes
    const descSelectors = [
      "[itemprop='description']", "#job-description", "#jobDescription", 
      ".job-description", ".jobDescription", "#description", ".description", 
      "#job-details", ".job-details", ".job-body", "[class*='JobDescription']", 
      "[class*='jobDescription']", "[class*='description']"
    ];
    
    for (const selector of descSelectors) {
      const el = document.querySelector(selector);
      if (el && el.textContent && el.textContent.trim().length > 150) {
        description = this.htmlToText(el.innerHTML);
        break;
      }
    }

    // Fallback: search for largest text block containing paragraphs/lists
    if (!description || description.length < 100) {
      let bestBlock: { el: HTMLElement; len: number } | null = null;
      document.querySelectorAll<HTMLElement>("div, section, article").forEach((el) => {
        const text = el.textContent?.trim() || "";
        const len = text.length;
        if (
          len > 300 && len < 25000 && 
          !["BODY", "HTML", "HEADER", "FOOTER", "NAV"].includes(el.tagName) &&
          (!bestBlock || len > bestBlock.len)
        ) {
          bestBlock = { el, len };
        }
      });
      if (bestBlock) {
        description = this.htmlToText((bestBlock as { el: HTMLElement }).el.innerHTML);
      }
    }

    return description;
  }
}


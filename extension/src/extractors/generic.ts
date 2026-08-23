import { BaseExtractor, type JobResult } from "./base";

export class GenericExtractor extends BaseExtractor {
  match(_url: string): boolean {
    return true; // Match anything as fallback
  }

  async extract(): Promise<JobResult[]> {
    console.log("[Generic Extractor] 🚀 Running generic extraction on:", window.location.href);

    // 1. Try Next.js state data (highly precise for Next.js powered career pages)
    const nextJobs = this.extractFromNextData("Generic");
    if (nextJobs.length > 0) {
      console.log("[Generic Extractor] ✅ Found job via Next.js state data:", nextJobs);
      return nextJobs;
    }

    // 2. Try JSON-LD second
    const jsonLdJobs = this.extractFromJSONLD("Generic");
    if (jsonLdJobs.length > 0) {
      console.log(`[Generic Extractor] Found ${jsonLdJobs.length} job(s) via JSON-LD`);
      
      // Enrich JSON-LD results with DOM-based details if missing
      for (const job of jsonLdJobs) {
        if (!job.applyUrl) {
          job.applyUrl = this.findApplyUrlFromDOM();
        }
        if (!job.salary) {
          job.salary = this.extractSalaryFromDOM();
        }
        if (!job.location) {
          job.location = this.extractLocationFromDOM();
        }
        if (!job.workModel) {
          job.workModel = this.extractWorkModelFromText(job.description) || this.extractWorkModelFromText(job.location) || this.extractWorkModelFromText(document.body.innerText);
        }
      }
      return jsonLdJobs;
    }

    // 3. Fallback to Meta tags + DOM heuristics
    console.log("[Generic Extractor] 📌 JSON-LD failed, falling back to Meta tags & Heuristics");
    const detailJob = await this.extractFromDOM();
    if (detailJob) {
      return [detailJob];
    }

    return [];
  }

  private async extractFromDOM(): Promise<JobResult | null> {
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
    let company: string | null = null;
    const ogSite = document.querySelector('meta[property="og:site_name"]');
    if (ogSite) {
      company = ogSite.getAttribute("content");
    }
    
    if (!company) {
      const companyEl = document.querySelector('[class*="company-name"]') || 
                        document.querySelector('[class*="companyName"]') || 
                        document.querySelector('[class*="company"]') ||
                        document.querySelector('[class*="employer"]') || 
                        document.querySelector('[class*="organization"]');
      if (companyEl) {
        company = companyEl.textContent?.trim() || null;
      }
    }

    if (!title && !company) {
      return null;
    }

    // C. Description Extraction
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

    // D. Extract metrics
    const salary = this.extractSalaryFromDOM();
    const location = this.extractLocationFromDOM();
    const workModel = this.extractWorkModelFromText(description) || this.extractWorkModelFromText(location) || this.extractWorkModelFromText(document.body.innerText);

    // E. Apply URL
    const applyUrl = this.findApplyUrlFromDOM();

    return {
      title: title || "Unknown Title",
      company: company || "Unknown Company",
      link: window.location.href,
      description: description || "No job description found.",
      applyUrl,
      source: "detail-page",
      platform: "Generic",
      salary,
      location,
      workModel
    };
  }

  private findApplyUrlFromDOM(): string {
    let applyUrl: string | null = null;
    const applyButtons = Array.from(document.querySelectorAll<HTMLAnchorElement | HTMLButtonElement>("a, button"));
    
    for (const btn of applyButtons) {
      const text = (btn.textContent || "").toLowerCase();
      if (
        text.includes("apply") || 
        text.includes("submit application") || 
        text.includes("easy apply") || 
        text.includes("apply on company")
      ) {
        if (btn instanceof HTMLAnchorElement && btn.href && !btn.href.startsWith("javascript:")) {
          applyUrl = btn.href;
          break;
        }
      }
    }
    
    return applyUrl || window.location.href;
  }
}

import { BaseExtractor, type JobResult } from "./base";

export class JobRightExtractor extends BaseExtractor {
  match(url: string): boolean {
    return url.includes("jobright.ai");
  }

  async extract(mainWorldData?: any): Promise<JobResult[]> {
    console.log("[JobRight Extractor] 🚀 Extracting job details on:", window.location.href);
    
    // 1. Obtain main world inspection data (Fiber props, DOM anchors, __NEXT_DATA__)
    const mainData = mainWorldData || await this.extractFromMainWorld();
    if (mainData) {
      console.log("[JobRight Extractor] Main world data received:", mainData);
    }

    const jobPermalink = mainData?.directLink || window.location.href;

    // 2. Try to extract from Next.js state (preferred for JobRight Next.js hydration)
    const nextJobs = this.extractFromNextData("JobRight");
    if (nextJobs.length > 0) {
      console.log("[JobRight Extractor] ✅ Extraction successful via Next.js props:", nextJobs);
      const job = nextJobs[0];

      // Resolve apply URL: prefer main world applyUrl or direct apply search, NEVER accept bare homepage
      let directApply = mainData?.applyUrl;
      if (!directApply || this.isRootHomepage(directApply)) {
        directApply = this.findDirectApplyUrl(document);
      }
      if (!directApply || this.isRootHomepage(directApply)) {
        directApply = job.applyUrl && !this.isRootHomepage(job.applyUrl) ? job.applyUrl : null;
      }
      directApply = this.cleanDirectUrl(directApply) || jobPermalink;

      return [{
        ...job,
        applyUrl: directApply,
        link: jobPermalink
      }];
    }

    // 3. Try React Fiber inspection on main article / details
    const fiberJob = this.extractFromReactFiber(document.querySelector("main, article, [role='main']") || document.body);
    if (fiberJob && fiberJob.title && (fiberJob.company || fiberJob.applyUrl || fiberJob.description)) {
      console.log("[JobRight Extractor] ✅ Extracted job via React Fiber:", fiberJob);
      let directApply = this.cleanDirectUrl(mainData?.applyUrl || fiberJob.applyUrl);
      if (!directApply || this.isRootHomepage(directApply)) {
        directApply = this.findDirectApplyUrl(document) || jobPermalink;
      }
      return [{
        title: this.cleanStr(fiberJob.title),
        company: this.cleanStr(fiberJob.company) || this.findCompanyName(document, fiberJob.title),
        link: jobPermalink,
        description: this.cleanStr(fiberJob.description) || this.extractDescriptionFromDOM(),
        applyUrl: directApply,
        source: "detail-page",
        platform: "JobRight",
        salary: fiberJob.salary || this.extractSalaryFromDOM(),
        location: fiberJob.location || this.extractLocationFromDOM(),
        workModel: fiberJob.workModel || this.extractWorkModelFromText(fiberJob.description)
      }];
    }

    // 4. Try to extract from JSON-LD
    const jsonLdJobs = this.extractFromJSONLD("JobRight");
    
    // 5. Perform DOM extraction as fallback or enrichment
    const detailJob = await this.extractFromDOM(mainData);
    
    if (detailJob) {
      if (jsonLdJobs.length > 0) {
        const existing = jsonLdJobs[0];
        if (!existing.company && detailJob.company) existing.company = detailJob.company;
        if ((!existing.applyUrl || this.isRootHomepage(existing.applyUrl)) && detailJob.applyUrl) existing.applyUrl = detailJob.applyUrl;
        if (!existing.title && detailJob.title) existing.title = detailJob.title;
        return jsonLdJobs;
      }
      return [detailJob];
    }
    
    return jsonLdJobs;
  }

  private async extractFromDOM(mainWorldData?: any): Promise<JobResult | null> {
    const titleSelectors = [
      'h1',
      '[class*="job-title" i]',
      '[class*="JobTitle" i]',
      '[class*="jobTitle" i]',
      'h2'
    ];

    let title = this.getBySelectors(titleSelectors) || (document.title ? document.title.split("|")[0]?.trim() : null);
    let company = this.findCompanyName(document, title);

    if (!title && !company) {
      return null;
    }

    const description = this.extractDescriptionFromDOM();
    const salary = this.extractSalaryFromDOM();
    const location = this.extractLocationFromDOM();
    const workModel = this.extractWorkModelFromText(description) || 
                      this.extractWorkModelFromText(location) || 
                      this.extractWorkModelFromText(document.body.innerText);

    const jobPermalink = mainWorldData?.directLink || window.location.href;

    // Direct ATS Apply URL
    let directApplyUrl = (mainWorldData?.applyUrl ? this.cleanDirectUrl(mainWorldData.applyUrl) : null);
    if (!directApplyUrl || this.isRootHomepage(directApplyUrl)) {
      directApplyUrl = this.findDirectApplyUrl(document);
    }
    if (!directApplyUrl || this.isRootHomepage(directApplyUrl)) {
      directApplyUrl = jobPermalink;
    }

    return {
      title,
      company: company || "Unknown Company",
      link: jobPermalink,
      description,
      applyUrl: this.cleanDirectUrl(directApplyUrl),
      source: "detail-page",
      platform: "JobRight",
      salary,
      location,
      workModel
    };
  }

  private extractDescriptionFromDOM(): string | null {
    let description: string | null = null;
    const descSelectors = [
      "[class*='JobDetail_jobDescription' i]",
      "[class*='jobDescription' i]",
      "[class*='description' i]",
      "#job-description",
      ".job-description",
      "[itemprop='description']"
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

    return description;
  }
}

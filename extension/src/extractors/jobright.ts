import { BaseExtractor, type JobResult } from "./base";

export class JobRightExtractor extends BaseExtractor {
  match(url: string): boolean {
    return url.includes("jobright.ai");
  }

  async extract(mainWorldData?: any): Promise<JobResult[]> {
    console.log("[JobRight Extractor] 🚀 Extracting job details on:", window.location.href);

    // 1. Obtain main world inspection data (Fiber props, DOM anchors)
    const mainData = mainWorldData || await this.extractFromMainWorld();
    if (mainData) {
      console.log("[JobRight Extractor] Main world data received:", mainData);
    }

    // 2. Locate the active job detail pane currently visible on the screen
    const detailContainer = this.getActiveDetailContainer();

    // 3. PRIMARY: Extract directly from the live DOM (always reflects currently clicked/viewed job)
    const domJob = await this.extractFromDOM(mainData, detailContainer);
    if (domJob && domJob.title && domJob.company && domJob.company !== "Unknown Company") {
      console.log("[JobRight Extractor] ✅ Extracted active job from live DOM:", domJob);
      return [domJob];
    }

    // 4. Try React Fiber inspection on active detail container
    const fiberTarget = detailContainer || document.querySelector("main, article, [role='main']") || document.body;
    const fiberJob = this.extractFromReactFiber(fiberTarget);
    if (fiberJob && fiberJob.title && (fiberJob.company || fiberJob.applyUrl || fiberJob.description)) {
      console.log("[JobRight Extractor] ✅ Extracted job via React Fiber:", fiberJob);
      let directApply = this.cleanDirectUrl(mainData?.applyUrl || fiberJob.applyUrl);
      if (!directApply || this.isRootHomepage(directApply)) {
        directApply = this.findDirectApplyUrl(detailContainer || document);
      }
      const jrId = this.extractJobId(directApply || window.location.href);
      const permalink = jrId ? `https://jobright.ai/jobs/info/${jrId}` : (mainData?.directLink || window.location.href);

      return [{
        title: this.cleanStr(fiberJob.title),
        company: this.cleanStr(fiberJob.company) || this.findCompanyName(detailContainer || document, fiberJob.title),
        link: permalink,
        description: this.sanitizeJobRightDescription(this.cleanStr(fiberJob.description) || this.extractDescriptionFromDOM(detailContainer)),
        applyUrl: directApply || permalink,
        source: "detail-page",
        platform: "JobRight",
        salary: fiberJob.salary || this.extractSalaryFromDOM(detailContainer || document),
        location: fiberJob.location || this.extractLocationFromDOM(detailContainer || document),
        workModel: fiberJob.workModel || this.extractWorkModelFromText(fiberJob.description)
      }];
    }

    // 5. If DOM extraction had a title, return it even if company had fallback
    if (domJob && domJob.title) {
      return [domJob];
    }

    // 6. LAST RESORT: Only if DOM and Fiber completely failed and user is on a direct static info page (/jobs/info/<id>)
    const isDirectInfoPage = window.location.pathname.includes("/jobs/info/");
    if (isDirectInfoPage) {
      const nextJobs = this.extractFromNextData("JobRight");
      if (nextJobs.length > 0) {
        return nextJobs;
      }
      return this.extractFromJSONLD("JobRight");
    }

    return [];
  }

  private getActiveDetailContainer(): HTMLElement | null {
    // 1. Locate "Original Job Post" link
    const originalPostLink = Array.from(document.querySelectorAll<HTMLAnchorElement>("a")).find(a =>
      (a.textContent || "").toLowerCase().includes("original job post")
    );

    // 2. Locate apply button ("APPLY NOW" or "Apply with Autofill")
    const applyButton = Array.from(document.querySelectorAll<HTMLElement>("button, a, [role='button']")).find(el => {
      const text = (el.textContent || "").toLowerCase().trim();
      return text.includes("apply now") || text.includes("apply with autofill") || el.id === "apply-now-button-id";
    });

    // 3. Locate Overview tab
    const overviewTab = Array.from(document.querySelectorAll<HTMLElement>("button, div, span, [role='tab']")).find(el => {
      const text = (el.textContent || "").trim();
      return text === "Overview";
    });

    const anchorEl = originalPostLink || applyButton || overviewTab;
    if (anchorEl) {
      // Walk up the DOM tree to find the detail pane container while excluding the search/recommended list
      let curr: HTMLElement | null = anchorEl.parentElement;
      let candidate: HTMLElement | null = null;
      while (curr && curr !== document.body) {
        const text = curr.textContent || "";
        const isSidebar = curr.matches?.("[class*='sidebar' i], [class*='list' i], [class*='search-list' i]");
        if (!isSidebar && (text.includes("Overview") || text.includes("Responsibilities") || text.includes("Qualification") || text.includes("is hiring"))) {
          candidate = curr;
          // Stop ascending if this container also wraps the search list or global recommended list
          if (!/\d+\s+results\s+for/i.test(text) && !/JOBS\s*>\s*Recommended/i.test(text)) {
            return candidate;
          }
        }
        curr = curr.parentElement;
      }
      if (candidate) return candidate;
    }

    return document.querySelector<HTMLElement>(
      "[class*='JobDetail' i], [class*='jobDetail' i], [class*='job-detail' i], [class*='detail-container' i], [class*='detailContainer' i], [class*='detail_container' i], main, article"
    );
  }

  private async extractFromDOM(mainWorldData?: any, container?: HTMLElement | null): Promise<JobResult | null> {
    const root = container || document;

    const titleSelectors = [
      'h1',
      '[class*="job-title" i]',
      '[class*="JobTitle" i]',
      '[class*="jobTitle" i]',
      'h2'
    ];

    let title = this.getBySelectors(titleSelectors, root) || (document.title ? document.title.split("|")[0]?.trim() : null);

    // Company extraction: check dedicated element, sibling above title, then general NLP/selectors
    let company: string | null = null;
    const companySelectors = [
      '[class*="companyName" i]',
      '[class*="company-name" i]',
      '[class*="company_name" i]',
      '[class*="company" i]:not([class*="company-card" i]):not([class*="company-info" i])',
      'a[href*="/co/"]',
      'a[href*="/company/"]'
    ];
    for (const sel of companySelectors) {
      const el = root.querySelector(sel);
      if (el && el.textContent) {
        const text = this.cleanCompanyName(el.textContent);
        if (text && this.isValidCompanyName(text, title)) {
          company = text;
          break;
        }
      }
    }

    if (!company) {
      // In Jobright, company is directly above the title (e.g. "Kaleidoscope Inc. · 3 days ago")
      const titleEl = root.querySelector('h1, [class*="job-title" i], [class*="JobTitle" i], h2');
      if (titleEl) {
        const prev = titleEl.previousElementSibling;
        if (prev && prev.textContent) {
          const raw = prev.textContent.replace(/·.*$/, "").trim();
          const clean = this.cleanCompanyName(raw);
          if (clean && this.isValidCompanyName(clean, title)) {
            company = clean;
          }
        }
      }
    }

    if (!company) {
      company = this.findCompanyName(root, title);
    }

    if (!title && !company) {
      return null;
    }

    const description = this.extractDescriptionFromDOM(container);
    let salary = this.extractSalaryFromDOM(root);
    if (!salary && container) {
      const m = container.innerText.match(/\$[0-9,]+(?:\.[0-9]+)?[Kk]?(?:\/[a-zA-Z]+)?\s*-\s*\$[0-9,]+(?:\.[0-9]+)?[Kk]?(?:\/[a-zA-Z]+)?/);
      if (m) salary = m[0];
    }

    const location = this.extractLocationFromDOM(root);
    const workModel = this.extractWorkModelFromText(description) || 
                      this.extractWorkModelFromText(location) || 
                      (container ? this.extractWorkModelFromText(container.innerText) : this.extractWorkModelFromText(document.body.innerText));

    // Direct ATS Apply URL
    let directApplyUrl = (mainWorldData?.applyUrl ? this.cleanDirectUrl(mainWorldData.applyUrl) : null);
    if (!directApplyUrl || this.isRootHomepage(directApplyUrl)) {
      const origLink = Array.from(root.querySelectorAll<HTMLAnchorElement>("a")).find(a =>
        (a.textContent || "").toLowerCase().includes("original job post")
      );
      if (origLink?.href && !this.isRootHomepage(origLink.href)) {
        directApplyUrl = this.cleanDirectUrl(origLink.href);
      }
    }
    if (!directApplyUrl || this.isRootHomepage(directApplyUrl)) {
      directApplyUrl = this.findDirectApplyUrl(root);
    }

    const jrId = this.extractJobId(directApplyUrl || window.location.href);
    const jobPermalink = jrId ? `https://jobright.ai/jobs/info/${jrId}` : (mainWorldData?.directLink || window.location.href);

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

  private extractJobId(url: string | null): string | null {
    if (!url) return null;
    const mJr = url.match(/jr_id=([a-f0-9]+)/i);
    if (mJr) return mJr[1];
    const mInfo = url.match(/\/jobs\/info\/([a-f0-9]+)/i);
    if (mInfo) return mInfo[1];
    return null;
  }

  private extractDescriptionFromDOM(container?: HTMLElement | null): string | null {
    const root = container || document;
    let description: string | null = null;

    const descSelectors = [
      "[class*='JobDetail_jobDescription' i]",
      "[class*='jobDescription' i]",
      "[class*='job-description' i]",
      "[class*='description' i]",
      "[class*='jobDetail' i]",
      "#job-description",
      ".job-description",
      "[itemprop='description']"
    ];

    for (const sel of descSelectors) {
      const el = root.querySelector(sel);
      if (el && el.textContent && el.textContent.trim().length > 150) {
        description = this.htmlToText(el.innerHTML);
        break;
      }
    }

    if (!description && container) {
      description = this.htmlToText(container.innerHTML);
    } else if (!description) {
      let bestBlock: { el: HTMLElement; len: number } | null = null;
      document.querySelectorAll<HTMLElement>("div, section, article").forEach((el) => {
        if (/\d+\s+results\s+for/i.test(el.textContent || "") || /JOBS\s*>\s*Recommended/i.test(el.textContent || "")) return;
        const len = el.textContent?.trim().length ?? 0;
        if (len > 300 && len < 25000 && (!bestBlock || len > bestBlock.len)) {
          bestBlock = { el, len };
        }
      });
      if (bestBlock) {
        description = this.htmlToText((bestBlock as { el: HTMLElement }).el.innerHTML);
      }
    }

    return this.sanitizeJobRightDescription(description);
  }

  private sanitizeJobRightDescription(rawText: string | null): string | null {
    if (!rawText) return null;
    let res = rawText.trim();

    // 1. Strip all HTML tags & tracking pixels
    res = res.replace(/<[^>]*>/g, "");

    // 2. Cut off search results list (11+ subsequent jobs dumped from sidebar)
    const searchIdx = res.search(/\d+\s+results\s+for\s+["']/i);
    if (searchIdx !== -1) res = res.substring(0, searchIdx).trim();

    // 3. Cut off company card (Glassdoor / Leadership / Funding / Recent News)
    const compIdx = res.search(/\nCompany\s*\n\s*[A-Za-z0-9&.,\s-]{1,50}\n\s*Glassdoor/i);
    if (compIdx !== -1) {
      res = res.substring(0, compIdx).trim();
    } else {
      const fundingIdx = res.search(/\nFunding\s*\n\s*Current Stage/i);
      if (fundingIdx !== -1) res = res.substring(0, fundingIdx).trim();
    }

    // 4. Cut off AI tools footer
    const aiIdx = res.search(/\bAI\s+Tools\b/i);
    if (aiIdx !== -1) res = res.substring(0, aiIdx).trim();

    // 5. Find start of description to strip top marketing / navigation
    const startMatch = res.match(/(?:^|\n)([^\n]+ (?:is hiring|is seeking|is looking for)[^\n]*)/i) ||
                       res.match(/(?:^|\n)(Responsibilities\b)/i) ||
                       res.match(/(?:^|\n)(About the (?:Job|Role|Company)\b)/i) ||
                       res.match(/(?:^|\n)(Job Summary\b)/i);
    if (startMatch && startMatch.index !== undefined && startMatch.index > 0) {
      res = res.substring(startMatch.index).trim();
    } else {
      // Fallback: strip top marketing banners and navigation if startMatch wasn't found
      res = res.replace(/🎁\s*Your Special offer ends soon[\s\S]*?(?:Upgrade Now|\d+:\d+)/gi, "");
      res = res.replace(/Jobs\s+Explore\s+Resume[\s\S]*?FeedbackSettings/gi, "");
      res = res.replace(/JOBSRecommendedLiked\d+[\s\S]*?Get Hired Faster/gi, "");
      res = res.replace(/Early applicant\s*<?\s*\d*\s*applicants?/gi, "");
      res = res.replace(/Apply with Autofill/gi, "");
      res = res.replace(/APPLY NOW\s*↗?/gi, "");
      res = res.replace(/Overview\s+Company\s+Share\s+Report Issue\s+Original Job Post/gi, "");
      res = res.replace(/\d+%\s*(?:STRONG|GOOD|FAIR|POOR)?\s*MATCH[\s\S]*?Industry Exp\.[^\n]+/gi, "");
      res = res.replace(/Why this job is a match[\s\S]*?(?:STRONG|GOOD|FAIR|POOR)\s*MATCH/gi, "");
    }

    // 6. Clean inside widgets and formatting
    res = res.replace(/Insider Connection\s*@[^\n]+[\s\S]*?Find Any Email\s*/gi, "");
    res = res.replace(/[A-Za-z\s]+(?:Growth Opportunities|No H1B|H1B Sponsor|H1B Sponsor Likely)/gi, "");
    res = res.replace(/Qualification\s*\n\s*Represents the skills you have[\s\S]*?(?:TypeScript|Required)\s*/gi, "Qualifications:\n\nRequired\n");

    // Ensure section headers have clean double spacing
    res = res.replace(/([^\n])\b(Responsibilities\b)/i, "$1\n\n$2");
    res = res.replace(/([^\n])\b(Qualifications?:\s*)/i, "$1\n\n$2");
    res = res.replace(/([^\n])\b(Benefits\b)/i, "$1\n\n$2");

    res = res.replace(/\n{3,}/g, "\n\n").trim();
    return res.length > 50 ? res : null;
  }
}

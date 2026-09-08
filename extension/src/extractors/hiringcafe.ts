import { BaseExtractor, type JobResult } from "./base";

export class HiringCafeExtractor extends BaseExtractor {
  match(url: string): boolean {
    const low = url.toLowerCase();
    return low.includes("hiringcafe.com") || low.includes("hiring.cafe");
  }

  async extract(mainWorldData?: any): Promise<JobResult[]> {
    console.log("[Hiring Cafe Extractor] 🚀 Extracting job details on:", window.location.href);

    // 1. Locate active job container (modal, drawer, dialog, or active details pane)
    const activeContainer = this.findActiveJobContainer();

    // 2. Obtain main world inspection data (Fiber props, window.open interception, directLink)
    const mainData = mainWorldData || await this.extractFromMainWorld();
    if (mainData) {
      console.log("[Hiring Cafe Extractor] Main world data received:", mainData);
    }

    // 3. Extract title
    let title = this.extractTitle(activeContainer) ||
                this.cleanStr(mainData?.jobData?.title) ||
                this.cleanStr(mainData?.jobData?.job_title);

    // 4. Extract company name using rock-solid multi-tier heuristics
    let company = this.extractCompanyName(activeContainer, title, null, mainData);

    if (!title && !company) {
      if (document.title) {
        const parts = document.title.split(/[|\-–·]/);
        title = parts[0]?.trim() || null;
        if (parts.length > 1) {
          company = parts[1]?.trim() || null;
        }
      }
    }

    if (!title && !company) {
      return [];
    }

    // 5. Resolve direct job permalink (NOT the search state URL)
    let jobPermalink = this.findJobPermalink(activeContainer, title, company);
    if (!jobPermalink || jobPermalink === window.location.href) {
      if (mainData?.directLink && this.matchesSlug(mainData.directLink, title, company)) {
        jobPermalink = mainData.directLink;
      }
    }

    // 6. Resolve direct external apply URL (ATS / company portal link)
    let directApplyUrl = mainData?.applyUrl;
    if (!directApplyUrl) {
      directApplyUrl = this.findDirectApplyUrl(activeContainer) || this.findDirectApplyUrl(document);
    }
    directApplyUrl = this.cleanDirectUrl(directApplyUrl);
    if (!directApplyUrl) {
      directApplyUrl = jobPermalink;
    }

    // 7. Resolve full job description
    let description: string | null = null;

    // A. Check current page __NEXT_DATA__ if directly on a /job/... page
    if (window.location.pathname.startsWith("/job/")) {
      const fromNext = this.extractDescriptionFromNextData(document);
      if (fromNext && fromNext.length > 150) {
        description = fromNext;
      }
    }

    // B. Check DOM of active container
    if (!description) {
      description = this.extractDescriptionFromDOM(activeContainer);
    }

    // C. Check Fiber jobData description
    if (!description && mainData?.jobData?.description) {
      const fiberDesc = this.cleanStr(mainData.jobData.description);
      if (fiberDesc && fiberDesc.length > 100 && !fiberDesc.toLowerCase().includes("we couldn't load this job description")) {
        description = fiberDesc;
      }
    }

    let fetchedPageData: { description: string | null; location: string | null; salary: string | null; workModel: string | null } | null = null;

    // D. Check if description is missing, an error, or just drawer summary tabs
    const isBadDesc = !description || 
                      description.toLowerCase().includes("we couldn't load this job description") || 
                      description.includes("Job InfoCompany Info") ||
                      description.length < 150;

    // E. If incomplete/broken and we have the dedicated jobPermalink, fetch the full job page!
    if (isBadDesc && jobPermalink && jobPermalink.includes("/job/")) {
      fetchedPageData = await this.fetchFullJobPageData(jobPermalink);
      if (fetchedPageData?.description && fetchedPageData.description.length > 150) {
        console.log("[Hiring Cafe Extractor] ✅ Loaded full pristine job description from dedicated page:", jobPermalink);
        description = fetchedPageData.description;
      }
    }

    // F. If still contains drawer chrome/error, clean it
    if (description && (description.includes("Job InfoCompany Info") || description.includes("We couldn't load this job description"))) {
      description = this.cleanDrawerDescription(description);
    }

    // Re-verify company name if it wasn't found before
    if (!company) {
      company = this.extractCompanyName(activeContainer, title, description, mainData);
    }

    // 8. Extract metrics
    const salary = this.cleanStr(mainData?.jobData?.salary) ||
                   this.cleanStr(mainData?.jobData?.compensation) ||
                   fetchedPageData?.salary ||
                   this.extractSalaryFromDOM(activeContainer);
    const location = this.cleanStr(mainData?.jobData?.location) ||
                     this.cleanStr(mainData?.jobData?.job_location) ||
                     fetchedPageData?.location ||
                     this.extractLocationFromDOM(activeContainer) ||
                     this.extractLocationFromText(description) || 
                     this.extractLocationFromText((activeContainer as HTMLElement).innerText || document.body.innerText) ||
                     this.extractLocationFromSlug(jobPermalink);
    const workModel = this.cleanStr(mainData?.jobData?.workModel) ||
                      this.cleanStr(mainData?.jobData?.workplace_type) ||
                      fetchedPageData?.workModel ||
                      this.extractWorkModelFromText(description) || 
                      this.extractWorkModelFromText(location) || 
                      this.extractWorkModelFromText((activeContainer as HTMLElement).innerText || document.body.innerText);

    return [{
      title,
      company: company || "Unknown Company",
      link: jobPermalink,
      description,
      applyUrl: directApplyUrl,
      source: "detail-page",
      platform: "Hiring Cafe",
      salary,
      location,
      workModel
    }];
  }

  private extractCompanyName(
    container: ParentNode,
    title: string | null,
    description: string | null,
    mainData: any
  ): string | null {
    // 1. Check React Fiber job data from Main World (snake_case API fields from HiringCafe)
    const fiberCompany = this.cleanStr(
      mainData?.jobData?.company_name ||
      mainData?.jobData?.companyName ||
      (typeof mainData?.jobData?.company === "object" ? mainData?.jobData?.company?.name : mainData?.jobData?.company) ||
      mainData?.jobData?.employer ||
      mainData?.jobData?.org_name ||
      mainData?.jobData?.organization
    );
    if (fiberCompany && !fiberCompany.toLowerCase().includes("hiring cafe")) {
      const cleaned = this.cleanCompanyName(fiberCompany);
      if (this.isValidCompanyName(cleaned, title)) {
        console.log("[Hiring Cafe Extractor] ✅ Company found via React Fiber props:", cleaned);
        return cleaned;
      }
    }

    // 2. Check React Fiber directly on activeContainer or active card if available
    const activeEl = (container instanceof Element ? container : null) ||
                     document.querySelector('[class*="border-black"], [class*="selected"], [class*="active"], article');
    if (activeEl) {
      const fiberData = this.extractFromReactFiber(activeEl);
      if (fiberData?.company && !fiberData.company.toLowerCase().includes("hiring cafe")) {
        const cleaned = this.cleanCompanyName(fiberData.company);
        if (this.isValidCompanyName(cleaned, title)) {
          console.log("[Hiring Cafe Extractor] ✅ Company found via container fiber:", cleaned);
          return cleaned;
        }
      }
    }

    // 3. Inspect Company Header / Org Section in activeContainer
    // On HiringCafe, company name is right next to the "/org/" link ("View all")
    const orgLinks = Array.from(container.querySelectorAll<HTMLAnchorElement>('a[href*="/org/"], a[href*="hiringcafe.com/org/"]'));
    for (const a of orgLinks) {
      const parent = a.parentElement;
      if (parent) {
        // A. Look for sibling elements (e.g. <span>Everest Tech</span> <a href="/org/...">View all</a>)
        const siblings = Array.from(parent.querySelectorAll<HTMLElement>("span, div, h2, h3, strong, b, p"))
          .filter(el => el !== a && !a.contains(el) && el.children.length === 0);
        for (const sib of siblings) {
          const text = this.cleanCompanyName(sib.textContent);
          if (text && this.isValidCompanyName(text, title)) {
            console.log("[Hiring Cafe Extractor] ✅ Company found via /org/ sibling element:", text);
            return text;
          }
        }

        // B. Clean parent's text by stripping trailing boilerplate like "View all"
        const parentText = this.cleanCompanyName(parent.textContent);
        if (parentText && this.isValidCompanyName(parentText, title)) {
          console.log("[Hiring Cafe Extractor] ✅ Company found via /org/ parent container text:", parentText);
          return parentText;
        }
      }
    }

    // 4. Check company logo alt text in container or near title
    const logos = Array.from(container.querySelectorAll<HTMLImageElement>('img[alt], img[title]'));
    for (const img of logos) {
      const alt = img.getAttribute("alt") || img.getAttribute("title");
      if (alt) {
        const cleanAlt = this.cleanCompanyName(alt.replace(/\b(logo|icon|avatar|company logo)\b/gi, ""));
        if (cleanAlt && this.isValidCompanyName(cleanAlt, title)) {
          console.log("[Hiring Cafe Extractor] ✅ Company found via logo alt:", cleanAlt);
          return cleanAlt;
        }
      }
    }

    // 5. Inspect subtitle / sibling elements near the job title H1
    const h1 = container.querySelector("h1, h2");
    if (h1 && h1.parentElement) {
      const candidates = Array.from(h1.parentElement.querySelectorAll<HTMLElement>("span, div, p, a, h3"))
        .filter(el => el !== h1 && !h1.contains(el) && el.children.length === 0);
      for (const el of candidates) {
        const text = this.cleanCompanyName(el.textContent);
        if (text && this.isValidCompanyName(text, title)) {
          console.log("[Hiring Cafe Extractor] ✅ Company found via title subtitle/sibling:", text);
          return text;
        }
      }
    }

    // 6. BaseExtractor multi-tier heuristics (Description NLP, DOM text, subtitles, meta, doc title)
    const baseCompany = this.findCompanyName(container, title, description);
    if (baseCompany) {
      console.log("[Hiring Cafe Extractor] ✅ Company found via BaseExtractor heuristics:", baseCompany);
      return baseCompany;
    }

    // 7. Fallback: Parse company from Job Posting permalink slug
    // e.g. /job/sr-c-developer-everest-technologies-united-states-mrw4kvbzele54nwj -> "Everest Technologies"
    const jobLinks = Array.from(container.querySelectorAll<HTMLAnchorElement>('a[href*="/job/"]'));
    for (const a of jobLinks) {
      const fromSlug = this.extractCompanyFromJobUrl(a.href, title);
      if (fromSlug) {
        console.log("[Hiring Cafe Extractor] ✅ Company found via Job Posting slug:", fromSlug);
        return fromSlug;
      }
    }
    if (window.location.pathname.startsWith("/job/")) {
      const fromSlug = this.extractCompanyFromJobUrl(window.location.href, title);
      if (fromSlug) {
        console.log("[Hiring Cafe Extractor] ✅ Company found via pathname slug:", fromSlug);
        return fromSlug;
      }
    }

    return null;
  }

  private extractCompanyFromJobUrl(url: string, title?: string | null): string | null {
    try {
      const parsed = new URL(url, window.location.href);
      const segments = parsed.pathname.split("/").filter(Boolean);
      const jobIdx = segments.indexOf("job");
      if (jobIdx === -1 || !segments[jobIdx + 1]) return null;

      const slug = decodeURIComponent(segments[jobIdx + 1]);
      // Pattern: <title-slug>-<company-slug>-<location-slug>-<16-char-id>
      // Example: sr-c-developer-everest-technologies-united-states-mrw4kvbzele54nwj
      const parts = slug.split("-");
      if (parts.length < 3) return null;

      // Drop the trailing hash ID if it looks like an ID (alphanumeric > 8 chars)
      if (/^[a-z0-9]{8,}$/i.test(parts[parts.length - 1])) {
        parts.pop();
      }

      // If title words match the start of the slug, remove them
      let remaining = parts;
      if (title) {
        const titleWords = title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(/\s+/).filter(w => w.length > 1);
        let matchCount = 0;
        for (let i = 0; i < Math.min(titleWords.length, remaining.length); i++) {
          if (remaining[i].toLowerCase() === titleWords[i].toLowerCase() || titleWords.includes(remaining[i].toLowerCase())) {
            matchCount++;
          } else {
            break;
          }
        }
        if (matchCount > 0) {
          remaining = remaining.slice(matchCount);
        }
      }

      // Remove common trailing location words
      const commonLocations = [
        "united", "states", "remote", "us", "uk", "canada", "austin", "texas", "california",
        "new", "york", "georgia", "atlanta", "chicago", "illinois", "seattle", "washington",
        "london", "toronto", "san", "francisco", "los", "angeles", "alabama", "tennessee",
        "madison", "oak", "ridge", "houston"
      ];
      while (remaining.length > 1 && commonLocations.includes(remaining[remaining.length - 1].toLowerCase())) {
        remaining.pop();
      }

      if (remaining.length > 0) {
        const candidate = remaining.join(" ").trim();
        const titleCased = candidate.replace(/\b\w/g, l => l.toUpperCase());
        if (this.isValidCompanyName(titleCased, title)) {
          return titleCased;
        }
      }
    } catch {}
    return null;
  }

  private findActiveJobContainer(): ParentNode {
    const dialogSelectors = [
      '[role="dialog"]',
      '[aria-modal="true"]',
      'div[class*="drawer" i]',
      'div[class*="modal" i]',
      'div[class*="sheet" i]',
      'div[class*="job-detail" i]',
      'div[class*="jobDetail" i]',
      'div.fixed',
      'article'
    ];

    for (const sel of dialogSelectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent && el.textContent.trim().length > 150) {
        if (sel === "article") {
          const modalParent = el.closest('[role="dialog"], [aria-modal="true"], div.fixed, div[class*="drawer" i], div[class*="modal" i]');
          if (modalParent) return modalParent;
        }
        return el;
      }
    }

    return document;
  }

  private extractTitle(container: ParentNode): string | null {
    const titleSelectors = [
      'h1',
      'h2[class*="title" i]',
      'h2[class*="job" i]',
      '[class*="JobTitle" i]',
      '[class*="jobTitle" i]',
      '[class*="job-title" i]',
      'h2'
    ];
    return this.getBySelectors(titleSelectors, container);
  }

  private findJobPermalink(container: ParentNode, title?: string | null, company?: string | null): string {
    // If currently on a dedicated /job/... page
    if (window.location.pathname.startsWith("/job/")) {
      return window.location.href;
    }

    // 1. Search container for target="_blank" job links or "Job Posting" text
    const containerLinks = Array.from(container.querySelectorAll<HTMLAnchorElement>('a[href*="/job/"]'));
    if (containerLinks.length > 0) {
      for (const a of containerLinks) {
        if (this.matchesSlug(a.href, title, company)) {
          return a.href;
        }
      }
      const postingLink = containerLinks.find(a => (a.textContent || "").toLowerCase().includes("job posting"));
      if (postingLink) return postingLink.href;
      return containerLinks[0].href;
    }

    // 2. Search entire document for a link matching the title & company slug
    const allJobLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/job/"]'));
    if (allJobLinks.length > 0 && (title || company)) {
      const titleWords = (title || "").toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(/\s+/).filter(w => w.length > 2);
      const companyWords = (company || "").toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(/\s+/).filter(w => w.length > 2);
      const allWords = [...titleWords, ...companyWords];

      let bestLink: { href: string; score: number } | null = null;
      for (const a of allJobLinks) {
        const hrefLow = a.href.toLowerCase();
        let score = 0;
        for (const w of allWords) {
          if (hrefLow.includes(w)) score++;
        }
        if (score > 0 && (!bestLink || score > bestLink.score)) {
          bestLink = { href: a.href, score };
        }
      }

      if (bestLink && bestLink.score >= 1) {
        return bestLink.href;
      }
    }

    // 3. Check active card on page
    const activeCard = document.querySelector('[class*="border-black"], [class*="selected"], [class*="active"]');
    if (activeCard) {
      const cardLink = activeCard.querySelector<HTMLAnchorElement>('a[href*="/job/"]');
      if (cardLink) return cardLink.href;
    }

    // 4. Check for any link with "Job Posting" text
    const postingLink = allJobLinks.find(a => (a.textContent || "").toLowerCase().includes("job posting"));
    if (postingLink) {
      return postingLink.href;
    }

    if (allJobLinks.length === 1) {
      return allJobLinks[0].href;
    }

    return window.location.href;
  }

  private matchesSlug(url: string, title?: string | null, company?: string | null): boolean {
    if (!url) return false;
    const low = url.toLowerCase();
    const words = [...(title || "").toLowerCase().split(/\s+/), ...(company || "").toLowerCase().split(/\s+/)].filter(w => w.length > 2);
    if (words.length === 0) return false;
    const matches = words.filter(w => low.includes(w));
    return matches.length >= Math.min(2, words.length);
  }

  private extractDescriptionFromDOM(container: ParentNode): string | null {
    const descSelectors = [
      "[data-testid*='job-description' i]",
      "[class*='job-description' i]",
      "[class*='jobDescription' i]",
      "[class*='descriptionText' i]",
      "[class*='prose' i]",
      "[class*='description' i]",
      "[class*='job-details' i]",
      "[class*='jobDetails' i]",
      "#description",
      "[itemprop='description']",
      "article"
    ];

    for (const sel of descSelectors) {
      const el = container.querySelector(sel);
      if (el && el.textContent && el.textContent.trim().length > 150) {
        const text = el.textContent.trim();
        if (!text.toLowerCase().includes("we couldn't load this job description")) {
          return this.htmlToText(el.innerHTML);
        }
      }
    }

    // Fallback: search for largest text block that does NOT contain the error message
    let bestBlock: { el: HTMLElement; len: number } | null = null;
    container.querySelectorAll<HTMLElement>("div, section, article").forEach((el) => {
      const text = el.textContent?.trim() || "";
      const len = text.length;
      if (len > 300 && len < 25000 && !text.toLowerCase().includes("we couldn't load this job description") && (!bestBlock || len > bestBlock.len)) {
        bestBlock = { el, len };
      }
    });

    if (bestBlock) {
      return this.htmlToText((bestBlock as { el: HTMLElement }).el.innerHTML);
    }

    return null;
  }

  /**
   * Fetches the full, unsummarized job description directly from the dedicated /job/... detail page,
   * avoiding drawer preview summaries and "We couldn't load this job description" errors.
   */
  private async fetchFullJobPageData(jobUrl: string): Promise<{
    description: string | null;
    location: string | null;
    salary: string | null;
    workModel: string | null;
  } | null> {
    if (!jobUrl || !jobUrl.includes("/job/")) return null;
    try {
      console.log("[Hiring Cafe Extractor] 🔄 Fetching dedicated job details page for full description:", jobUrl);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(jobUrl, {
        signal: controller.signal,
        headers: {
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        }
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        console.warn("[Hiring Cafe Extractor] Dedicated job page fetch returned status:", res.status);
        return null;
      }

      const html = await res.text();
      let description: string | null = null;
      let location: string | null = null;
      let salary: string | null = null;
      let workModel: string | null = null;

      // 1. Try __NEXT_DATA__ JSON inspection from fetched HTML
      description = this.extractDescriptionFromNextData(html);

      // 2. Try DOM parsing of the fetched page
      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");
        
        if (!description) {
          const domDesc = this.extractDescriptionFromDOM(doc);
          if (domDesc && domDesc.length > 150 && !domDesc.toLowerCase().includes("we couldn't load this job description")) {
            description = domDesc;
          }
        }
        if (!location) {
          location = this.extractLocationFromDOM(doc);
        }
        if (!salary) {
          salary = this.extractSalaryFromDOM(doc);
        }
      } catch (e) {
        console.warn("[Hiring Cafe Extractor] Error parsing DOM from fetched page:", e);
      }

      if (description || location || salary) {
        return { description, location, salary, workModel };
      }
    } catch (e) {
      console.warn("[Hiring Cafe Extractor] Failed to fetch full job page details:", e);
    }
    return null;
  }

  private extractDescriptionFromNextData(source: ParentNode | string): string | null {
    try {
      let jsonText: string | null = null;
      if (typeof source === "string") {
        const match = source.match(/<script\s+id="__NEXT_DATA__"\s+type="application\/json">([\s\S]*?)<\/script>/i);
        if (match && match[1]) jsonText = match[1];
      } else {
        const el = source.querySelector("#__NEXT_DATA__");
        if (el && el.textContent) jsonText = el.textContent;
      }

      if (!jsonText) return null;
      const data = JSON.parse(jsonText);

      const findJobDesc = (obj: any, depth = 0): string | null => {
        if (!obj || typeof obj !== "object" || depth > 8) return null;
        for (const k of [
          "description", "job_description", "jobDescription", "description_html", 
          "job_description_html", "raw_description", "full_description", "details"
        ]) {
          if (typeof obj[k] === "string" && obj[k].trim().length > 100) {
            const val = obj[k].trim();
            if (!val.toLowerCase().includes("we couldn't load this job description")) {
              return val;
            }
          }
        }
        for (const k of Object.keys(obj)) {
          if (k.startsWith("_") || k === "router") continue;
          try {
            const found = findJobDesc(obj[k], depth + 1);
            if (found) return found;
          } catch {}
        }
        return null;
      };

      const raw = findJobDesc(data?.props?.pageProps || data);
      if (raw) {
        return this.htmlToText(raw);
      }
    } catch {}
    return null;
  }

  private cleanDrawerDescription(raw: string | null | undefined): string | null {
    if (!raw) return null;
    let s = raw;
    // Strip tab header
    s = s.replace(/^(?:Job Info|Company Info|Job Description)[\s\S]*?(?:Posted \d+[a-z]+ ago|\n\n)/i, "");
    // Strip company header line (e.g. @ AvalaraView All JobsWebsite...)
    s = s.replace(/@\s*[^\n]+?(?:View All Jobs|Website)[\s\S]*?(?:Remote|Full Time|Part Time|Contract|\n\n)/i, "");
    // Strip Signals block
    s = s.replace(/Signals\s*See how many viewed or applied/gi, "");
    // Strip Action buttons
    s = s.replace(/(?:Apply now|Save|Mark Applied|Hide Job|Report & Hide)[\s\S]*?(?:Report & Hide|\n\n)/gi, "");
    s = s.replace(/\b(?:Apply now|Save|Mark Applied|Hide Job|Report & Hide)\b/gi, "");
    // Strip Job Description header / Copy Job Description / error message
    s = s.replace(/Job Description\s*Copy Job Description[\s\S]*$/gi, "");
    s = s.replace(/We couldn't load this job description\.?/gi, "");
    s = s.replace(/Copy Job Description/gi, "");
    
    s = s.replace(/\n{3,}/g, "\n\n").trim();
    return s.length > 50 ? s : null;
  }

  private extractLocationFromSlug(url: string): string | null {
    try {
      const parsed = new URL(url, window.location.href);
      const segments = parsed.pathname.split("/").filter(Boolean);
      const jobIdx = segments.indexOf("job");
      if (jobIdx === -1 || !segments[jobIdx + 1]) return null;

      const slug = decodeURIComponent(segments[jobIdx + 1]);
      const parts = slug.split("-");
      if (parts.length < 3) return null;

      if (/^[a-z0-9]{8,}$/i.test(parts[parts.length - 1])) {
        parts.pop();
      }

      const known = [
        "united states", "remote", "us", "uk", "canada", "texas", "california", "georgia",
        "new york", "florida", "washington", "illinois", "massachusetts", "virginia",
        "north carolina", "colorado", "pennsylvania", "ohio", "michigan", "arizona",
        "austin", "atlanta", "chicago", "seattle", "san francisco", "los angeles",
        "dallas", "boston", "denver", "houston", "san diego", "orlando"
      ];

      const slugStr = parts.join(" ").toLowerCase();
      for (const loc of known) {
        if (slugStr.endsWith(loc) || slugStr.includes(" " + loc + " ")) {
          return loc.replace(/\b\w/g, l => l.toUpperCase());
        }
      }
    } catch {}
    return null;
  }
}

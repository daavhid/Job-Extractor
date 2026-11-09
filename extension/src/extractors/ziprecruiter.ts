import { BaseExtractor, type JobResult } from "./base";

export class ZipRecruiterExtractor extends BaseExtractor {
  match(url: string): boolean {
    return url.includes("ziprecruiter.com");
  }

  async extract(mainWorldData?: any): Promise<JobResult[]> {
    console.log("[ZipRecruiter Extractor] 🚀 Extracting job details on:", window.location.href);

    // 0. Fetch main world data if not already provided
    const mainData = mainWorldData || await this.extractFromMainWorld();
    
    // 1. Locate active details pane
    const detailsPane = this.findActiveDetailsPane();
    const isSearchPage = window.location.pathname.includes("/jobs-search") || window.location.pathname.includes("/search");

    // 2. Extract description from active details pane
    const description = this.extractDescriptionFromDOM(detailsPane) || this.extractDescriptionFromDOM(document);

    // 3. Extract exact job title from active details pane
    const domTitle = this.extractJobTitle(detailsPane, description);

    // 4. Try React Fiber inspection on active details pane
    const fiberJob = this.extractFromReactFiber(detailsPane instanceof Element ? detailsPane : document.body) ||
                     (detailsPane !== document ? this.extractFromReactFiber(document.querySelector('[class*="jobDetails" i], [class*="job_details" i], article, section, [role="main"]')) : null);

    let finalTitle = domTitle;
    if (!finalTitle && fiberJob?.title) {
      const fTitle = this.cleanStr(fiberJob.title);
      if (fTitle && !this.isExcludedHeading(fTitle)) {
        finalTitle = this.cleanJobTitle(fTitle);
      }
    }

    // 5. Try JSON-LD ONLY on single-job pages (never on search pages with split views)
    if (!isSearchPage && !finalTitle) {
      const jsonLdJobs = this.extractFromJSONLD("ZipRecruiter");
      if (jsonLdJobs.length > 0 && jsonLdJobs[0].title) {
        return jsonLdJobs;
      }
    }

    // 6. Perform comprehensive DOM extraction on details pane
    const detailJob = await this.extractFromDOM(detailsPane, mainData, description, finalTitle, fiberJob);
    if (detailJob) {
      return [detailJob];
    }

    return [];
  }

  /**
   * Locates the active job details pane.
   * On ZipRecruiter search pages with split view, the right column is the details pane,
   * containing the active Apply button, job title H1, company link, and job description.
   */
  private findActiveDetailsPane(): ParentNode {
    // 1. Highest priority: Trace up from the active Apply button in the details pane
    const applyButtons = Array.from(document.querySelectorAll<HTMLElement>(
      '[data-testid="apply-now-button"], [data-testid="sticky-apply-button"], [data-testid*="apply-button" i], a[href*="job-redirect"]'
    ));

    for (const btn of applyButtons) {
      let curr: HTMLElement | null = btn.parentElement;
      let hops = 0;
      while (curr && curr !== document.body && hops < 10) {
        const hasTitle = !!curr.querySelector('h1, [data-testid*="title" i], [class*="jobTitle" i]');
        const textLen = (curr.textContent || '').trim().length;
        const isSearchList = curr.querySelectorAll('a[href*="job-redirect"]').length > 3 || 
                             curr.querySelectorAll('a[href*="/co/"]').length > 3;

        if (hasTitle && textLen > 200 && !isSearchList) {
          console.log("[ZipRecruiter Extractor] 🎯 Located active details pane via Apply button:", curr);
          return curr;
        }
        curr = curr.parentElement;
        hops++;
      }
    }

    // 2. Locate container via "Job description" section heading
    const allHeadings = Array.from(document.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, div, span, p'));
    const jobDescHeader = allHeadings.find(el => {
      const t = (el.textContent || '').trim().toLowerCase();
      return t === 'job description' || t === 'about the role' || t === 'job summary';
    });

    if (jobDescHeader) {
      let curr: HTMLElement | null = jobDescHeader.parentElement;
      let hops = 0;
      while (curr && curr !== document.body && hops < 8) {
        const hasTitle = !!curr.querySelector('h1, [data-testid*="title" i], [class*="jobTitle" i]');
        const textLen = (curr.textContent || '').trim().length;
        const isSearchList = curr.querySelectorAll('a[href*="job-redirect"]').length > 3;

        if (hasTitle && textLen > 200 && !isSearchList) {
          console.log("[ZipRecruiter Extractor] 🎯 Located active details pane via Job Description header:", curr);
          return curr;
        }
        curr = curr.parentElement;
        hops++;
      }
    }

    // 3. Known ZipRecruiter container selectors
    const paneSelectors = [
      '[data-testid="job-details-pane"]',
      '[data-testid*="job-details" i]',
      '[data-testid="job_details"]',
      '[class*="job_details" i]',
      '[class*="jobDetails" i]',
      '[class*="details_pane" i]',
      '[class*="detailsPane" i]',
      '#job-details',
      '.job-details',
      '.details-panel',
      '.job-details-panel',
      'article',
      'section',
      '[role="main"]'
    ];

    for (const sel of paneSelectors) {
      const els = Array.from(document.querySelectorAll<HTMLElement>(sel));
      for (const el of els) {
        const textLen = (el.textContent || '').trim().length;
        const hasTitle = !!el.querySelector('h1, h2');
        const isSearchList = el.querySelectorAll('a[href*="job-redirect"]').length > 3;
        if (hasTitle && textLen > 200 && !isSearchList) {
          return el;
        }
      }
    }

    return document;
  }

  /**
   * Filters out search result headings, counts, boilerplate text, and navigation labels
   * that must never be mistaken for a job title.
   */
  private isExcludedHeading(t: string): boolean {
    const low = t.toLowerCase().trim();
    return !low || 
           low === "ziprecruiter" || 
           low === "job description" || 
           low === "similar jobs" || 
           low === "job details" || 
           low === "about the company" ||
           low.startsWith("search ") ||
           low.startsWith("sign in") ||
           low.startsWith("create alert") ||
           /^\d+\+?\s+.*jobs?\b/i.test(low) || // e.g. "38 C#/.net jobs in United States"
           /\bjobs?\s+in\b/i.test(low) ||
           /\b\d+\s+best\b/i.test(low) ||
           /\bnow hiring\b/i.test(low) ||
           /\bjob search\b/i.test(low);
  }

  /**
   * Strips trailing badges (Remote, Hybrid, On-site, etc.), "Position- " prefixes,
   * and residual punctuation from raw title strings.
   */
  private cleanJobTitle(raw: string): string {
    let t = raw.replace(/\s+/g, " ").trim();
    // Strip trailing badges / pills
    t = t.replace(/\s+(?:Remote|Hybrid|On-site|Onsite|Full[- ]time|Part[- ]time|Contract|New|Urgent|Easy Apply)\s*$/i, "").trim();
    // Strip leading "Position- " or "Role: "
    t = t.replace(/^(?:Position|Role|Job Title)\s*[-:]\s*/i, "").trim();
    // Strip leading/trailing punctuation
    t = t.replace(/^[-–—:\s]+|[-–—:\s]+$/g, "").trim();
    return t;
  }

  /**
   * Extracts clean job title from a heading element by stripping child badge/pill elements
   * before extracting text content.
   */
  private cleanTitleFromHeading(el: HTMLElement): string | null {
    const clone = el.cloneNode(true) as HTMLElement;
    // Remove badge / tag elements inside the heading
    const badges = clone.querySelectorAll(
      '[class*="badge" i], [class*="pill" i], [class*="tag" i], [class*="chip" i], [class*="label" i], [aria-label*="remote" i], [data-testid*="badge" i]'
    );
    badges.forEach(b => b.remove());
    Array.from(clone.children).forEach(child => {
      const txt = (child.textContent || "").trim().toLowerCase();
      if (['remote', 'hybrid', 'on-site', 'onsite', 'full-time', 'part-time', 'contract', 'new', 'urgent', 'easy apply'].includes(txt)) {
        child.remove();
      }
    });

    const text = clone.textContent?.replace(/\s+/g, " ").trim();
    if (!text || this.isExcludedHeading(text)) return null;

    const cleaned = this.cleanJobTitle(text);
    return cleaned.length > 2 && !this.isExcludedHeading(cleaned) ? cleaned : null;
  }

  /**
   * Extracts the exact job title for the currently selected job.
   * Priority:
   * 1. H1 / title elements inside active details pane
   * 2. Non-excluded H2 in details pane
   * 3. Selected card in search results list
   * 4. Matching card by URL hash job_id
   * 5. NLP from description first lines ("Position- Solution Architect")
   * 6. NLP role match in description ("seeking a Solutions Architect")
   * 7. Document title (ONLY on single job pages, NEVER on search pages)
   */
  private extractJobTitle(detailsPane: ParentNode, description: string | null): string | null {
    // 1. Primary: Heading in detailsPane (h1 is the standard for active job details pane)
    const h1Candidates = Array.from(detailsPane.querySelectorAll<HTMLElement>(
      'h1, [data-testid="job-title"], [data-testid="job-details-title"], [data-testid*="jobTitle" i], [class*="jobTitle" i], [class*="job-title" i], [class*="job_title" i]'
    ));
    for (const el of h1Candidates) {
      const t = this.cleanTitleFromHeading(el);
      if (t) {
        console.log("[ZipRecruiter Extractor] ✅ Job title found via details pane H1:", t);
        return t;
      }
    }

    // 2. Secondary: Any h2 in detailsPane that is not an excluded section header
    const h2Candidates = Array.from(detailsPane.querySelectorAll<HTMLElement>('h2'));
    for (const el of h2Candidates) {
      const t = this.cleanTitleFromHeading(el);
      if (t) {
        console.log("[ZipRecruiter Extractor] ✅ Job title found via details pane H2:", t);
        return t;
      }
    }

    // 3. Selected job card in the search results list (split view)
    const selectedCards = Array.from(document.querySelectorAll<HTMLElement>(
      '[class*="selected" i], [class*="active" i], [aria-selected="true"], [data-selected="true"], [data-active="true"]'
    ));
    for (const card of selectedCards) {
      const cardTitleEl = card.querySelector<HTMLElement>('h1, h2, h3, [class*="title" i], a[href*="/job/"]');
      if (cardTitleEl) {
        const t = this.cleanTitleFromHeading(cardTitleEl);
        if (t) {
          console.log("[ZipRecruiter Extractor] ✅ Job title found via selected list card:", t);
          return t;
        }
      }
    }

    // 4. Job ID match from URL hash or query in job cards
    const hashMatch = window.location.hash.match(/job_id=([a-zA-Z0-9_-]+)/i) || 
                      window.location.search.match(/job_id=([a-zA-Z0-9_-]+)/i);
    if (hashMatch && hashMatch[1]) {
      const jid = hashMatch[1];
      const matchingCard = document.querySelector<HTMLElement>(`[id*="${jid}"], [data-job-id*="${jid}"], a[href*="${jid}"]`);
      if (matchingCard) {
        const cardParent = matchingCard.closest('article, li, [class*="card" i]') || matchingCard;
        const titleEl = cardParent.querySelector<HTMLElement>('h1, h2, h3, [class*="title" i]') || matchingCard;
        const t = this.cleanTitleFromHeading(titleEl);
        if (t) {
          console.log("[ZipRecruiter Extractor] ✅ Job title found via URL hash job_id card match:", t);
          return t;
        }
      }
    }

    // 5. NLP Extraction from first lines of Description (e.g. "Position- Solution Architect")
    if (description) {
      const descLines = description.split(/[\r\n]+/).slice(0, 5);
      for (const line of descLines) {
        const match = line.match(/^(?:Position|Role|Job\s*Title|Title)\s*[-:]\s*([A-Za-z0-9\s/&–-]+)$/i);
        if (match && match[1]) {
          const t = this.cleanJobTitle(match[1]);
          if (t && t.length > 2 && t.length < 80 && !this.isExcludedHeading(t)) {
            console.log("[ZipRecruiter Extractor] ✅ Job title found via description first line:", t);
            return t;
          }
        }
      }
    }

    // 6. Generic NLP match in description ("seeking a Solutions Architect")
    if (description) {
      const descRoleMatch = description.match(/(?:seeking|looking for|hiring)\s+(?:a|an)?\s*([A-Z][A-Za-z0-9\s/&–-]{3,50}?(?:Engineer|Developer|Manager|Analyst|Lead|Director|Specialist|Architect|Consultant|Scientist|Associate|Designer|Coordinator|Officer|Executive|Technician))/i);
      if (descRoleMatch && descRoleMatch[1]) {
        const t = this.cleanJobTitle(descRoleMatch[1]);
        if (t && !this.isExcludedHeading(t)) {
          console.log("[ZipRecruiter Extractor] ✅ Job title found via description NLP role:", t);
          return t;
        }
      }
    }

    // 7. Single job page document.title (ONLY IF not a search page)
    const isSearchPage = window.location.pathname.includes("/jobs-search") || window.location.pathname.includes("/search");
    if (!isSearchPage && document.title) {
      const jobInMatch = document.title.match(/^(.*?)\s+(?:job\s+in\b|at\s+ZipRecruiter\b|\|\s*Ziprecruiter\b)/i);
      let rawTitle = jobInMatch ? jobInMatch[1].trim() : document.title.split(/[|·]/)[0].trim();
      rawTitle = rawTitle.replace(/\s+at\s+ZipRecruiter.*$/i, "")
                         .replace(/\s+-\s+ZipRecruiter.*$/i, "")
                         .replace(/\s*\|\s*ZipRecruiter.*$/i, "")
                         .trim();
      if (rawTitle && rawTitle.length > 2 && !this.isExcludedHeading(rawTitle)) {
        return this.cleanJobTitle(rawTitle);
      }
    }

    return null;
  }

  /**
   * Extracts location specific to ZipRecruiter's layout:
   * 1. Subtitle near title heading in details pane (e.g. "Texas City, TX • On-site, Remote")
   * 2. DOM location selector inside detailsPane
   * 3. Description NLP ("Location : Remote (United States of America)")
   * 4. Selected card location in list view
   */
  private extractZipRecruiterLocation(detailsPane: ParentNode, description: string | null): string | null {
    // 1. Search text near the title / header in detailsPane
    const headerContainer = detailsPane.querySelector('header') || detailsPane;
    const candidates = Array.from(headerContainer.querySelectorAll<HTMLElement>('p, span, div, li'));
    for (const el of candidates) {
      if (el.children.length > 3) continue;
      const text = el.textContent?.trim();
      if (!text || text.length < 3 || text.length > 100) continue;
      if (text.includes("Apply") || text.includes("Posted") || text.includes("Full-time") || text.includes("Contract")) {
        const parts = text.split(/[•·|]/).map(p => p.trim());
        for (const p of parts) {
          const m = p.match(/\b([A-Z][a-zA-Z\s.-]+,\s*[A-Z]{2})\b/);
          if (m && m[1]) return m[1].trim();
        }
        continue;
      }
      const match = text.match(/\b([A-Z][a-zA-Z\s.-]+,\s*[A-Z]{2})\b/);
      if (match && match[1]) {
        return match[1].trim();
      }
    }

    // 2. Standard extractLocationFromDOM (on detailsPane)
    const domLoc = this.extractLocationFromDOM(detailsPane);
    if (domLoc) return domLoc;

    // 3. Search description for Location line (e.g. "Location : Remote (United States of America)")
    if (description) {
      const locMatch = description.match(/(?:Location|Job Location|Based in|Work Location)\s*:\s*([^\r\n]+)/i);
      if (locMatch && locMatch[1]) {
        let raw = locMatch[1].trim();
        const parenMatch = raw.match(/\(([^)]+)\)/);
        if (parenMatch && parenMatch[1] && parenMatch[1].length > 2) {
          return parenMatch[1].trim();
        }
        raw = raw.replace(/\s+(?:or\s+Remote|Remote).*$/i, "").trim();
        if (raw.length > 2 && raw.length < 60) {
          return raw;
        }
      }
    }

    // 4. Selected card in search list
    const selectedCard = document.querySelector<HTMLElement>('[class*="selected" i], [class*="active" i], [aria-selected="true"]');
    if (selectedCard) {
      const text = selectedCard.textContent || '';
      const match = text.match(/\b([A-Z][a-zA-Z\s.-]+,\s*[A-Z]{2})\b/);
      if (match && match[1]) {
        return match[1].trim();
      }
    }

    return null;
  }

  private async extractFromDOM(
    detailsPane: ParentNode,
    mainWorldData?: any,
    initialDesc?: string | null,
    initialTitle?: string | null,
    fiberJob?: any
  ): Promise<JobResult | null> {
    const isSearchPage = window.location.pathname.includes("/jobs-search") || window.location.pathname.includes("/search");
    const description = initialDesc || this.extractDescriptionFromDOM(detailsPane) || this.extractDescriptionFromDOM(document);
    const jobPermalink = mainWorldData?.directLink || window.location.href;

    // Direct ATS / company Apply URL
    let directApplyUrl = (mainWorldData?.applyUrl ? this.cleanDirectUrl(mainWorldData.applyUrl) : null) || 
                         this.findDirectApplyUrl(detailsPane);

    if (directApplyUrl) {
      directApplyUrl = this.cleanDirectUrl(directApplyUrl);
    }

    // 1. Inspect Apply buttons inside detailsPane
    if (!directApplyUrl || directApplyUrl.includes("ziprecruiter.com")) {
      const paneApplyLinks = Array.from(detailsPane.querySelectorAll<HTMLAnchorElement>('a[data-testid*="apply" i], a[href*="job-redirect"]'));
      for (const rl of paneApplyLinks) {
        if (rl.href) {
          const unwrapped = this.cleanDirectUrl(rl.href);
          if (unwrapped && !unwrapped.includes("ziprecruiter.com") && !this.isRootHomepage(unwrapped)) {
            directApplyUrl = unwrapped;
            break;
          }
        }
      }
    }

    // 2. Scan detailsPane HTML for embedded Base64 ATS URL (strictly within detailsPane to avoid cross-contamination!)
    if (!directApplyUrl || directApplyUrl.includes("ziprecruiter.com")) {
      try {
        const targetHtml = detailsPane instanceof HTMLElement ? detailsPane.innerHTML : "";
        const b64Matches = targetHtml.match(/aHR0cHM6Ly9[A-Za-z0-9+/=%_-]+/g);
        if (b64Matches) {
          for (const raw of b64Matches) {
            try {
              let b64 = decodeURIComponent(raw);
              while (b64.length % 4 !== 0) b64 += "=";
              const dec = atob(b64);
              if (dec.startsWith("http://") || dec.startsWith("https://")) {
                const cleaned = this.cleanDirectUrl(dec);
                if (cleaned && !cleaned.includes("ziprecruiter.com") && !this.isRootHomepage(cleaned)) {
                  directApplyUrl = cleaned;
                  break;
                }
              }
            } catch {}
          }
        }
      } catch {}
    }

    // 3. Fallback to fiberJob applyUrl
    if ((!directApplyUrl || directApplyUrl.includes("ziprecruiter.com")) && fiberJob?.applyUrl) {
      const fApply = this.cleanDirectUrl(fiberJob.applyUrl);
      if (fApply && !fApply.includes("ziprecruiter.com") && !this.isRootHomepage(fApply)) {
        directApplyUrl = fApply;
      }
    }

    // If still an internal ziprecruiter URL, reject unless it is a valid job-redirect specifically from detailsPane
    if (directApplyUrl && directApplyUrl.includes("ziprecruiter.com") && !directApplyUrl.includes("job-redirect")) {
      directApplyUrl = null;
    }

    // Title Extraction
    let title = initialTitle || this.extractJobTitle(detailsPane, description);

    // Fallback title from unwrapped direct ATS apply URL (e.g. Workday slug /job/Staff-Software-Engineer)
    if (!title && directApplyUrl) {
      const slugMatch = directApplyUrl.match(/\/job\/([A-Za-z0-9\-_]+)/i) || 
                         directApplyUrl.match(/\/jobs\/([A-Za-z0-9\-_]+)/i) ||
                         directApplyUrl.match(/\/posting\/([A-Za-z0-9\-_]+)/i);
      if (slugMatch) {
        const rawSlug = slugMatch[1]
          .replace(/_REQ.*$/i, "")
          .replace(/_JR.*$/i, "")
          .replace(/[-_]+/g, " ")
          .trim();
        if (rawSlug && rawSlug.length > 2 && rawSlug.length < 80) {
          title = rawSlug.replace(/\b\w/g, (c) => c.toUpperCase());
        }
      }
    }

    // Extract company name
    // Strategy 1: Dedicated ZipRecruiter company links (/co/<Company-Name>) inside detailsPane
    let company: string | null = null;
    const coLinks = Array.from(detailsPane.querySelectorAll<HTMLAnchorElement>('a[href*="/co/"]'));
    for (const cl of coLinks) {
      const text = this.cleanCompanyName(cl.textContent);
      if (text && this.isValidCompanyName(text, title)) {
        company = text;
        break;
      }
      if (cl.href) {
        const fromHref = this.extractFromCompanyHref(cl.href, title);
        if (fromHref && this.isValidCompanyName(fromHref, title)) {
          company = fromHref;
          break;
        }
      }
    }

    // Strategy 2: Details pane DOM
    if (!company) {
      company = this.findCompanyName(detailsPane, title, description);
    }
    
    // Strategy 3: Document DOM (ONLY if not a search page)
    if (!company && !isSearchPage && detailsPane !== document) {
      company = this.findCompanyName(document, title, description);
    }

    // Strategy 4: Description NLP (e.g. "Join Triumph!", "At Triumph, our vision...")
    if (!company && description) {
      company = this.extractCompanyFromDescription(description);
    }

    // Strategy 5: Direct ATS apply URL subdomain (e.g. "tbkbank.wd1.myworkdayjobs.com" -> "TBK Bank")
    if (!company && directApplyUrl) {
      try {
        const u = new URL(directApplyUrl);
        if (u.hostname.includes("myworkdayjobs.com") || u.hostname.includes("greenhouse.io") || u.hostname.includes("lever.co") || u.hostname.includes("ashbyhq.com")) {
          const sub = u.hostname.split(".")[0];
          if (sub && sub.length > 2) {
            company = sub.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim();
          }
        }
      } catch {}
    }

    // Strategy 6: React Fiber company
    if (!company && fiberJob?.company) {
      const fComp = this.cleanCompanyName(fiberJob.company);
      if (fComp && this.isValidCompanyName(fComp, title)) {
        company = fComp;
      }
    }

    // Strategy 7: Fallback to document company link ONLY if verified by description
    if (!company) {
      const docCoLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/co/"]'));
      for (const cl of docCoLinks) {
        const text = this.cleanCompanyName(cl.textContent);
        if (text && this.isValidCompanyName(text, title)) {
          if (!description || description.toLowerCase().includes(text.toLowerCase())) {
            company = text;
            break;
          }
        }
      }
    }

    if (!title && !company) {
      return null;
    }

    const salary = this.extractSalaryFromDOM(detailsPane) || 
                   fiberJob?.salary || 
                   (!isSearchPage ? this.extractSalaryFromDOM(document) : null);

    const location = this.extractZipRecruiterLocation(detailsPane, description) || 
                     fiberJob?.location || 
                     null;

    const workModel = fiberJob?.workModel || 
                      this.extractWorkModelFromText(description) || 
                      this.extractWorkModelFromText(location) || 
                      this.extractWorkModelFromText((detailsPane as HTMLElement).innerText || "");

    return {
      title,
      company: company || "Unknown Company",
      link: jobPermalink,
      description,
      applyUrl: directApplyUrl || jobPermalink,
      source: "detail-page",
      platform: "ZipRecruiter",
      salary,
      location,
      workModel
    };
  }

  private extractDescriptionFromDOM(detailsPane: ParentNode): string | null {
    let description: string | null = null;
    const descSelectors = [
      '[itemprop="description"]',
      '.jobdescription',
      '.jobDescriptionText',
      '.job_description',
      '.job-description',
      '[class*="jobDescriptionText" i]',
      '[class*="jobDescription" i]',
      '.jobDescriptionSection'
    ];
                   
    for (const selector of descSelectors) {
      const el = detailsPane.querySelector(selector);
      if (el && el.textContent && el.textContent.trim().length > 150) {
        description = this.htmlToText(el.innerHTML);
        break;
      }
    }

    // Check container following "Job description" heading
    if (!description) {
      const allHeaders = Array.from(detailsPane.querySelectorAll<HTMLElement>('h2, h3, h4, div, span'));
      const descHeader = allHeaders.find(el => /^(?:Job\s+description|Job\s+Summary|About\s+the\s+Role)$/i.test((el.textContent || '').trim()));
      if (descHeader) {
        if (descHeader.nextElementSibling && (descHeader.nextElementSibling.textContent || '').trim().length > 100) {
          description = this.htmlToText(descHeader.nextElementSibling.innerHTML);
        } else if (descHeader.parentElement) {
          const parentClone = descHeader.parentElement.cloneNode(true) as HTMLElement;
          const h = parentClone.querySelector('h1, h2, h3, h4');
          if (h) h.remove();
          if ((parentClone.textContent || '').trim().length > 150) {
            description = this.htmlToText(parentClone.innerHTML);
          }
        }
      }
    }

    if (!description) {
      let bestBlock: { el: HTMLElement; len: number } | null = null;
      const containers = detailsPane.querySelectorAll<HTMLElement>("article, section, [role='main']");
      const targetList = containers.length > 0 ? containers : detailsPane.querySelectorAll<HTMLElement>("div");
      
      targetList.forEach((el) => {
        const len = el.textContent?.trim().length ?? 0;
        if (len > 300 && len < 15000 && (!bestBlock || len > bestBlock.len)) {
          bestBlock = { el, len };
        }
      });
      
      if (bestBlock) {
        description = this.htmlToText((bestBlock as { el: HTMLElement }).el.innerHTML);
      }
    }

    if (description) {
      const headerIndex = description.search(/(?:Job\s+description|Job\s+Description|Job\s+Summary|About\s+the\s+Role)\b\s*[\r\n]+/i);
      if (headerIndex > 50) {
        const match = description.match(/(?:Job\s+description|Job\s+Description|Job\s+Summary|About\s+the\s+Role)/i);
        if (match) {
          const cutIndex = headerIndex + match[0].length;
          description = description.substring(cutIndex).trim();
        }
      }
      
      const footerIndex = description.search(/[\r\n]+\s*(?:Report|What\s+.*?\s+employees\s+say|Powered\s+by\s+real\s+frontline\s+workers|Share\s+this\s+job|Copy\s+job\s+link|Share\s+job\s+on\s+Facebook)\b/i);
      if (footerIndex !== -1) {
        description = description.substring(0, footerIndex).trim();
      }
    }

    return description;
  }
}

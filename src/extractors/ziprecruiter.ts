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

    const jobPermalink = mainData?.directLink || window.location.href;

    // 2. Try React Fiber inspection on active details pane or document
    const fiberJob = this.extractFromReactFiber(detailsPane instanceof Element ? detailsPane : document.body) ||
                     this.extractFromReactFiber(document.querySelector('[class*="jobDetails" i], [class*="job_details" i], article, section, [role="main"]'));
    if (fiberJob && fiberJob.title && (fiberJob.company || fiberJob.applyUrl || fiberJob.description)) {
      const fTitle = String(fiberJob.title).toLowerCase().trim();
      const isRelevant = !document.title || document.title.toLowerCase().includes(fTitle) || (fiberJob.description && fiberJob.description.toLowerCase().includes(fTitle));
      if (isRelevant) {
        console.log("[ZipRecruiter Extractor] ✅ Extracted job via React Fiber:", fiberJob);
        const fiberTitle = this.cleanStr(fiberJob.title);
        let finalTitle = fiberTitle;
        if (document.title) {
          const jobInMatch = document.title.match(/^(.*?)\s+(?:jobs?\s+in\b|at\s+ZipRecruiter\b|\|\s*Ziprecruiter\b)/i);
          let rawDocTitle = jobInMatch ? jobInMatch[1].trim() : document.title.split(/[|·]/)[0].trim();
          rawDocTitle = rawDocTitle.replace(/\s+at\s+ZipRecruiter.*$/i, "")
                                   .replace(/\s+-\s+ZipRecruiter.*$/i, "")
                                   .replace(/\s*\|\s*ZipRecruiter.*$/i, "")
                                   .trim();
          if (rawDocTitle && rawDocTitle.length > (fiberTitle?.length || 0) && !/^ziprecruiter$/i.test(rawDocTitle)) {
            finalTitle = rawDocTitle;
          }
        }

        const directApply = this.cleanDirectUrl(mainData?.applyUrl || fiberJob.applyUrl || this.findDirectApplyUrl(detailsPane) || this.findDirectApplyUrl(document));
        const desc = this.cleanStr(fiberJob.description) || this.extractDescriptionFromDOM(detailsPane) || this.extractDescriptionFromDOM(document);

        let comp: string | null = null;
        const coLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/co/"]'));
        for (const cl of coLinks) {
          const text = this.cleanCompanyName(cl.textContent);
          if (text && this.isValidCompanyName(text, finalTitle)) {
            comp = text;
            break;
          }
          if (cl.href) {
            const fromHref = this.extractFromCompanyHref(cl.href, finalTitle);
            if (fromHref && this.isValidCompanyName(fromHref, finalTitle)) {
              comp = fromHref;
              break;
            }
          }
        }

        if (!comp) {
          comp = this.findCompanyName(detailsPane, finalTitle, desc) || 
                 this.findCompanyName(document, finalTitle, desc) || 
                 this.cleanStr(fiberJob.company) || 
                 (desc ? this.extractCompanyFromDescription(desc) : null);
        }

        const loc = (desc ? this.extractLocationFromText(desc) : null) || 
                    fiberJob.location || 
                    this.extractLocationFromDOM(detailsPane) || 
                    this.extractLocationFromDOM(document);

        return [{
          title: finalTitle,
          company: comp,
          link: jobPermalink,
          description: desc,
          applyUrl: directApply || jobPermalink,
          source: "detail-page",
          platform: "ZipRecruiter",
          salary: fiberJob.salary || this.extractSalaryFromDOM(detailsPane) || this.extractSalaryFromDOM(document),
          location: loc,
          workModel: fiberJob.workModel || this.extractWorkModelFromText(desc) || this.extractWorkModelFromText(loc)
        }];
      }
    }

    // 3. Try JSON-LD
    const jsonLdJobs = this.extractFromJSONLD("ZipRecruiter");
    
    // 4. Perform DOM extraction
    const detailJob = await this.extractFromDOM(detailsPane, mainData);
    
    if (detailJob) {
      if (jsonLdJobs.length > 0) {
        const existing = jsonLdJobs[0];
        if (!existing.company && detailJob.company) existing.company = detailJob.company;
        if (!existing.applyUrl && detailJob.applyUrl) existing.applyUrl = detailJob.applyUrl;
        if (!existing.title && detailJob.title) existing.title = detailJob.title;
        if (!existing.location && detailJob.location) existing.location = detailJob.location;
        if (!existing.salary && detailJob.salary) existing.salary = detailJob.salary;
        if (!existing.workModel && detailJob.workModel) existing.workModel = detailJob.workModel;
        return jsonLdJobs;
      }
      return [detailJob];
    }
    
    return jsonLdJobs;
  }

  private findActiveDetailsPane(): ParentNode {
    const paneSelectors = [
      '[class*="job_details" i]',
      '[class*="jobDetails" i]',
      '[class*="details_pane" i]',
      '[class*="detailsPane" i]',
      '[data-testid*="job-details" i]',
      '#job-details',
      '.job-details',
      '.details-panel',
      '.job-details-panel',
      'article',
      'section',
      '[role="main"]'
    ];
    for (const sel of paneSelectors) {
      const els = document.querySelectorAll(sel);
      for (const el of Array.from(els)) {
        if (el.querySelector('.jobdescription, .jobDescriptionText, .job_description, .job-description, .jobDescriptionSection, [class*="jobDescription" i]')) {
          return el;
        }
      }
    }
    return document;
  }

  private async extractFromDOM(detailsPane: ParentNode, mainWorldData?: any): Promise<JobResult | null> {
    const description = this.extractDescriptionFromDOM(detailsPane) || this.extractDescriptionFromDOM(document);

    const jobPermalink = mainWorldData?.directLink || window.location.href;

    // Direct ATS / company Apply URL
    let directApplyUrl = (mainWorldData?.applyUrl ? this.cleanDirectUrl(mainWorldData.applyUrl) : null) || 
                         this.findDirectApplyUrl(detailsPane) || 
                         this.findDirectApplyUrl(document);
    if (directApplyUrl) {
      directApplyUrl = this.cleanDirectUrl(directApplyUrl);
    }

    // 1. Check for anchor tags explicitly pointing to job-redirect
    if (!directApplyUrl || directApplyUrl.includes("ziprecruiter.com")) {
      const redirectLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="job-redirect"]'));
      for (const rl of redirectLinks) {
        if (rl.href) {
          const unwrapped = this.cleanDirectUrl(rl.href);
          if (unwrapped && !unwrapped.includes("ziprecruiter.com") && !this.isRootHomepage(unwrapped)) {
            directApplyUrl = unwrapped;
            break;
          }
        }
      }
    }

    // 2. Scan page HTML for embedded Base64 ATS URL (e.g. Workday/Greenhouse apply link in match_token hydration)
    if (!directApplyUrl || directApplyUrl.includes("ziprecruiter.com")) {
      try {
        const b64Matches = document.documentElement.innerHTML.match(/aHR0cHM6Ly9[A-Za-z0-9+/=%_-]+/g);
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

    // 3. Reject any internal ziprecruiter URL (like /jobs-search)
    if (directApplyUrl && directApplyUrl.includes("ziprecruiter.com") && !directApplyUrl.includes("job-redirect")) {
      directApplyUrl = null;
    }

    // Title Extraction
    // 1. Extract job title from document.title (extremely reliable on ZipRecruiter: "<Title> job in, <Location> at ZipRecruiter | Ziprecruiter")
    let titleFromDoc: string | null = null;
    if (document.title) {
      const jobInMatch = document.title.match(/^(.*?)\s+(?:jobs?\s+in\b|at\s+ZipRecruiter\b|\|\s*Ziprecruiter\b)/i);
      let rawTitle = jobInMatch ? jobInMatch[1].trim() : document.title.split(/[|·]/)[0].trim();
      rawTitle = rawTitle.replace(/\s+at\s+ZipRecruiter.*$/i, "")
                         .replace(/\s+-\s+ZipRecruiter.*$/i, "")
                         .replace(/\s*\|\s*ZipRecruiter.*$/i, "")
                         .trim();
      if (rawTitle && rawTitle.length > 2 && !/^ziprecruiter$/i.test(rawTitle)) {
        titleFromDoc = rawTitle;
      }
    }

    const titleSelectors = [
      '[data-testid="job-title"]',
      '[data-testid="job-details-title"]',
      '[data-testid*="jobTitle" i]',
      '.job_title',
      'h1.job_title',
      '[class*="jobTitle" i]',
      '[class*="job-title" i]',
      '[class*="job_title" i]',
      'h1',
      'h2'
    ];

    const isExcludedHeading = (t: string): boolean => {
      const low = t.toLowerCase().trim();
      return !low || 
             low === "ziprecruiter" || 
             low === "job description" || 
             low === "similar jobs" || 
             low === "job details" || 
             low === "about the company" ||
             low.startsWith("search ") ||
             low.startsWith("sign in") ||
             low.startsWith("create alert");
    };

    let title: string | null = null;

    // 2. If titleFromDoc is available, find matching DOM heading to get exact casing & text
    if (titleFromDoc) {
      const candidates = Array.from(document.querySelectorAll<HTMLElement>(titleSelectors.join(",")));
      for (const el of candidates) {
        const text = this.cleanStr(el.textContent);
        if (text && !isExcludedHeading(text)) {
          if (text.toLowerCase() === titleFromDoc.toLowerCase() || 
              titleFromDoc.toLowerCase().includes(text.toLowerCase()) || 
              text.toLowerCase().includes(titleFromDoc.toLowerCase())) {
            title = text;
            break;
          }
        }
      }
      if (!title) {
        title = titleFromDoc;
      }
    }

    // 3. If still no title, inspect DOM heading candidates
    if (!title) {
      title = this.getBySelectors(titleSelectors, detailsPane) || 
              (detailsPane !== document ? this.getBySelectors(titleSelectors, document) : null);
      if (title && isExcludedHeading(title)) {
        title = null;
      }
    }

    // Check mainWorldData title ONLY if consistent with document.title or description
    if (!title && mainWorldData?.jobData?.title) {
      const jt = String(mainWorldData.jobData.title).trim();
      if (document.title.toLowerCase().includes(jt.toLowerCase()) || (description && description.toLowerCase().includes(jt.toLowerCase()))) {
        title = jt;
      }
    }

    // Fallback A: Extract role name from description NLP (e.g. "We're looking for Lead and Staff Software Engineers...")
    if (!title && description) {
      const descRoleMatch = description.match(/(?:seeking|looking for|hiring)\s+(?:a|an)?\s*([A-Z][A-Za-z0-9\s/&–-]{3,50}?(?:Engineer|Developer|Manager|Analyst|Lead|Director|Specialist|Architect|Consultant|Scientist|Associate|Designer|Coordinator|Officer|Executive|Technician))/i);
      if (descRoleMatch && descRoleMatch[1]) {
        title = descRoleMatch[1].trim();
      }
    }

    // Fallback B: Extract title from unwrapped direct ATS apply URL (e.g. Workday slug /job/Staff-Software-Engineer_REQ-4581) as last resort
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

    // Extract company name using multi-tier heuristics
    // Strategy 1: Dedicated ZipRecruiter company links (/co/<Company-Name>)
    let company: string | null = null;
    const coLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/co/"]'));
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

    // Strategy 2: Details pane DOM (with description hint)
    if (!company) {
      company = this.findCompanyName(detailsPane, title, description);
    }
    
    // Strategy 3: Document DOM (with description hint)
    if (!company && detailsPane !== document) {
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

    // Strategy 6: mainWorldData ONLY if verified
    if (!company && mainWorldData?.jobData?.company) {
      const rawComp = typeof mainWorldData.jobData.company === "object"
        ? (mainWorldData.jobData.company.name || mainWorldData.jobData.company.canonicalDisplayName || "")
        : String(mainWorldData.jobData.company);
      const cleanComp = this.cleanCompanyName(rawComp);
      if (cleanComp && this.isValidCompanyName(cleanComp, title)) {
        if (document.title.toLowerCase().includes(cleanComp.toLowerCase()) || (description && description.toLowerCase().includes(cleanComp.toLowerCase()))) {
          company = cleanComp;
        }
      }
    }

    if (!title && !company) {
      return null;
    }

    const salary = this.extractSalaryFromDOM(detailsPane) || this.extractSalaryFromDOM(document);
    let location: string | null = null;
    if (description) {
      location = this.extractLocationFromText(description);
    }
    if (!location && detailsPane !== document) {
      location = this.extractLocationFromDOM(detailsPane);
    }
    if (!location && document.title) {
      const docLocMatch = document.title.match(/\bjob\s+in,\s*([^|@]+?)(?:\s+at\s+|\s*\||$)/i);
      if (docLocMatch && docLocMatch[1]) {
        const candidate = docLocMatch[1].trim();
        if (candidate && candidate.length > 2 && candidate.length < 60) {
          location = candidate;
        }
      }
    }
    if (!location) {
      location = this.extractLocationFromDOM(document);
    }

    const workModel = this.extractWorkModelFromText(description) || 
                      this.extractWorkModelFromText(location) || 
                      this.extractWorkModelFromText((detailsPane as HTMLElement).innerText || document.body.innerText);

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

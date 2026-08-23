export interface JobResult {
  title: string | null;
  company: string | null;
  link: string;
  description: string | null;
  applyUrl: string | null;
  source: "json-ld" | "detail-page";
  platform: string;
  salary?: string | null;
  location?: string | null;
  workModel?: string | null;
}

export abstract class BaseExtractor {
  abstract match(url: string): boolean;
  abstract extract(): Promise<JobResult[]>;

  protected cleanStr(s: string | undefined | null): string | null {
    return s ? s.replace(/\s+/g, " ").trim() || null : null;
  }

  protected getBySelectors(selectors: string[]): string | null {
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el && el.textContent) {
        const cleaned = this.cleanStr(el.textContent);
        if (cleaned) return cleaned;
      }
    }
    return null;
  }

  protected htmlToText(html: string): string {
    if (!html) return "";
    try {
      const temp = document.createElement("div");
      temp.innerHTML = html;
      
      // Inject spacing for readable formatting in plain text
      temp.querySelectorAll("br").forEach(br => br.replaceWith("\n"));
      temp.querySelectorAll("p, div, li, h1, h2, h3, h4, h5, h6, tr").forEach(block => {
        const span = document.createElement("span");
        span.textContent = "\n";
        block.parentNode?.insertBefore(span, block.nextSibling);
      });
      
      return temp.textContent?.trim().replace(/\n{3,}/g, "\n\n") || "";
    } catch (e) {
      console.warn("[BaseExtractor] Failed to clean HTML:", e);
      return html.replace(/<[^>]*>/g, ""); // basic fallback regex
    }
  }

  protected parseSalaryFromJSONLD(item: any): string | null {
    if (!item.baseSalary) return null;
    try {
      const bs = item.baseSalary;
      const currency = bs.currency || "USD";
      const sym = currency === "USD" ? "$" : currency + " ";
      
      if (typeof bs === "object") {
        const val = bs.value;
        if (typeof val === "object" && val !== null) {
          const unit = val.unitText || bs.unitText || "YEAR";
          const unitSuffix = unit.toLowerCase() === "year" ? "/yr" : (unit.toLowerCase() === "hour" ? "/hr" : "");
          if (val.minValue !== undefined && val.maxValue !== undefined) {
            return `${sym}${this.formatNum(val.minValue)} - ${sym}${this.formatNum(val.maxValue)}${unitSuffix}`;
          }
          if (val.value !== undefined) {
            return `${sym}${this.formatNum(val.value)}${unitSuffix}`;
          }
        } else if (typeof val === "number" || typeof val === "string") {
          return `${sym}${this.formatNum(val)}`;
        }
      } else if (typeof bs === "number" || typeof bs === "string") {
        return `${sym}${this.formatNum(bs)}`;
      }
    } catch (e) {
      console.warn("Error parsing salary from JSON-LD:", e);
    }
    return null;
  }

  private formatNum(val: number | string): string {
    const num = typeof val === "string" ? parseFloat(val) : val;
    if (isNaN(num)) return String(val);
    if (num >= 1000) {
      if (num % 1000 === 0) {
        return (num / 1000) + "K";
      }
      return (num / 1000).toFixed(1) + "K";
    }
    return String(num);
  }

  protected parseLocationFromJSONLD(item: any): string | null {
    if (!item.jobLocation) return null;
    try {
      const loc = item.jobLocation;
      if (typeof loc === "object" && loc !== null) {
        const addr = loc.address;
        if (typeof addr === "object" && addr !== null) {
          const city = addr.addressLocality || "";
          const region = addr.addressRegion || "";
          const country = addr.addressCountry || "";
          
          const parts = [city, region, country].filter(p => !!p);
          if (parts.length > 0) return parts.join(", ");
        } else if (typeof addr === "string") {
          return addr;
        }
      } else if (typeof loc === "string") {
        return loc;
      }
    } catch (e) {
      console.warn("Error parsing location from JSON-LD:", e);
    }
    return null;
  }

  protected parseWorkModelFromJSONLD(item: any): string | null {
    if (!item) return null;
    if (item.jobLocationType === "TELECOMMUTE" || item.jobLocationType?.toLowerCase() === "telecommute") {
      return "Remote";
    }
    const locStr = typeof item.jobLocation === "string" ? item.jobLocation : JSON.stringify(item.jobLocation || "");
    if (locStr.toLowerCase().includes("remote") || locStr.toLowerCase().includes("telecommute")) {
      return "Remote";
    }
    return null;
  }

  protected extractSalaryFromDOM(): string | null {
    const salarySelectors = [
      ".job_salary", ".salary", "[class*='salary']", "[class*='Salary']",
      ".job-salary", ".salary-range", ".compensation"
    ];
    for (const sel of salarySelectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent) {
        const text = el.textContent.trim();
        if (text.includes("$")) return text;
      }
    }
    
    const textContent = document.body.innerText;
    const salaryRegex = /\$[0-9,]+[Kk]?\s*-\s*\$[0-9,]+[Kk]?(?:\/[a-zA-Z]+)?/g;
    const matches = textContent.match(salaryRegex);
    if (matches && matches.length > 0) {
      return matches[0];
    }
    return null;
  }

  protected extractLocationFromDOM(): string | null {
    const locSelectors = [
      ".location", ".job-location", "[class*='location']", "[class*='Location']",
      ".job_location", "[itemprop='jobLocation']", ".company-location", ".job-card-location"
    ];
    for (const sel of locSelectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent) {
        const text = el.textContent.trim();
        if (text.length > 2 && text.length < 100 && !text.includes("Apply")) return text;
      }
    }
    return null;
  }

  protected extractWorkModelFromText(text: string | null): string | null {
    if (!text) return null;
    const low = text.toLowerCase();
    if (low.includes("remote") || low.includes("telecommute") || low.includes("work from home") || low.includes("wfh")) return "Remote";
    if (low.includes("hybrid")) return "Hybrid";
    if (low.includes("onsite") || low.includes("on-site") || low.includes("in-office") || low.includes("in office")) return "Onsite";
    return null;
  }

  protected extractFromJSONLD(platform: string): JobResult[] {
    console.log(`[${platform} Extractor] 🔍 Querying schema.org JSON-LD...`);
    const results: JobResult[] = [];
    
    document
      .querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]')
      .forEach((script) => {
        try {
          const data = JSON.parse(script.textContent ?? "");
          const items = Array.isArray(data) ? data : [data];
          
          items.forEach((item) => {
            if (!item) return;
            const type = item["@type"];
            if (type === "JobPosting" || (typeof type === "string" && type.endsWith("JobPosting"))) {
              const rawDesc = item.description || "";
              const plainDesc = this.htmlToText(rawDesc);
              
              const salary = this.parseSalaryFromJSONLD(item);
              const location = this.parseLocationFromJSONLD(item);
              const workModel = this.parseWorkModelFromJSONLD(item) || this.extractWorkModelFromText(plainDesc) || this.extractWorkModelFromText(location);
              
              results.push({
                title: this.cleanStr(item.title),
                company: this.cleanStr(item.hiringOrganization?.name),
                link: this.cleanStr(item.url) || window.location.href,
                description: this.cleanStr(plainDesc),
                applyUrl: null,
                source: "json-ld",
                platform: platform,
                salary,
                location,
                workModel
              });
            }
          });
        } catch (err) {
          console.warn(`[${platform} Extractor] JSON-LD parse error:`, err);
        }
      });
      
    console.log(`[${platform} Extractor] JSON-LD extraction found ${results.length} job(s)`);
    return results;
  }

  protected extractFromNextData(platform: string): JobResult[] {
    console.log(`[${platform} Extractor] 🔍 Querying Next.js __NEXT_DATA__...`);
    try {
      const script = document.getElementById("__NEXT_DATA__");
      if (!script) return [];
      
      const data = JSON.parse(script.textContent ?? "{}");
      
      // Dedicated parser for JobRight structure
      if (platform === "JobRight" || platform === "Generic") {
        const ds = data?.props?.pageProps?.dataSource;
        if (ds && ds.jobResult) {
          const jr = ds.jobResult;
          const cr = ds.companyResult || {};
          
          console.log(`[${platform} Extractor] Found JobRight structured NextProps!`);
          
          const title = jr.jobTitle || jr.jobNlpTitle || "";
          const company = cr.companyName || jr.companyName || "";
          
          // Build description from components
          let description = jr.jobSummary || "";
          if (jr.coreResponsibilities && jr.coreResponsibilities.length > 0) {
            description += "\n\nCore Responsibilities:\n" + jr.coreResponsibilities.map((r: string) => `• ${r}`).join("\n");
          }
          if (jr.qualifications?.mustHave && jr.qualifications.mustHave.length > 0) {
            description += "\n\nQualifications (Must Have):\n" + jr.qualifications.mustHave.map((q: string) => `• ${q}`).join("\n");
          }
          if (jr.qualifications?.preferredHave && jr.qualifications.preferredHave.length > 0) {
            description += "\n\nQualifications (Preferred):\n" + jr.qualifications.preferredHave.map((q: string) => `• ${q}`).join("\n");
          }
          if (jr.benefitsSummaries && jr.benefitsSummaries.length > 0) {
            description += "\n\nBenefits:\n" + jr.benefitsSummaries.map((b: string) => `• ${b}`).join("\n");
          }
          
          const location = jr.jobLocation || null;
          const salary = jr.salaryDesc || jr.salary || null;
          const workModel = jr.workModel || (jr.isRemote ? "Remote" : null);
          const applyUrl = jr.applyUrl || cr.companyURL || window.location.href;
          
          return [{
            title: this.cleanStr(title),
            company: this.cleanStr(company),
            link: window.location.href,
            description: this.cleanStr(description),
            applyUrl: this.cleanStr(applyUrl),
            source: "json-ld", // Indicate structured source
            platform: platform,
            salary: this.cleanStr(salary),
            location: this.cleanStr(location),
            workModel: this.cleanStr(workModel)
          }];
        }
      }
      
      // Recursive scanner (fallback)
      const findJob = (obj: any, visited = new Set()): any => {
        if (!obj || typeof obj !== "object") return null;
        if (visited.has(obj)) return null;
        visited.add(obj);
        
        const hasTitle = obj.title || obj.jobTitle || obj.job_title;
        const hasDesc = obj.description || obj.jobDescription || obj.job_description;
        const hasCompany = obj.company || obj.companyName || obj.company_name || obj.employer;
        
        if (hasTitle && hasDesc && hasCompany && typeof hasDesc === "string" && hasDesc.length > 100) {
          return obj;
        }
        
        for (const key of Object.keys(obj)) {
          if (key === "parent" || key === "_reactInternalFiber" || key.startsWith("_")) continue;
          try {
            const found = findJob(obj[key], visited);
            if (found) return found;
          } catch (e) {
            // ignore access errors
          }
        }
        return null;
      };
      
      const jobObj = findJob(data);
      if (jobObj) {
        console.log(`[${platform} Extractor] Found job object in Next.js props:`, jobObj);
        
        const title = jobObj.title || jobObj.jobTitle || jobObj.job_title;
        
        let company = "";
        if (typeof jobObj.company === "object" && jobObj.company !== null) {
          company = jobObj.company.name || jobObj.company.title || "";
        } else {
          company = jobObj.company || jobObj.companyName || jobObj.company_name || jobObj.employer || "";
        }
        
        const rawDesc = jobObj.description || jobObj.jobDescription || jobObj.job_description || "";
        const plainDesc = rawDesc.includes("<") ? this.htmlToText(rawDesc) : rawDesc;
        
        const applyUrl = jobObj.applyUrl || jobObj.apply_url || jobObj.sourceUrl || jobObj.source_url || jobObj.externalUrl || jobObj.url || null;
        
        const salary = jobObj.salary || jobObj.salaryRange || jobObj.compensation || null;
        const location = jobObj.location || jobObj.jobLocation || jobObj.city || null;
        const workModel = jobObj.workModel || jobObj.work_model || jobObj.remoteType || this.extractWorkModelFromText(plainDesc);
        
        return [{
          title: this.cleanStr(title),
          company: this.cleanStr(company),
          link: window.location.href,
          description: this.cleanStr(plainDesc),
          applyUrl: this.cleanStr(applyUrl),
          source: "json-ld", // Indicate structured source
          platform: platform,
          salary: this.cleanStr(salary),
          location: this.cleanStr(location),
          workModel: this.cleanStr(workModel)
        }];
      }
    } catch (e) {
      console.warn(`[${platform} Extractor] Error parsing __NEXT_DATA__:`, e);
    }
    return [];
  }

  protected waitForElement<T extends Element>(
    selector: string,
    timeout = 8000,
    interval = 300
  ): Promise<T | null> {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const check = (): void => {
        const el = document.querySelector<T>(selector);
        if (el) {
          resolve(el);
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

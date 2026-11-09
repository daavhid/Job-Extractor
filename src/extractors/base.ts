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
  abstract extract(mainWorldData?: any): Promise<JobResult[]>;

  protected cleanStr(s: string | undefined | null): string | null {
    return s ? s.replace(/\s+/g, " ").trim() || null : null;
  }

  /**
   * Checks if a URL is just a bare company root homepage (e.g. "https://bloomerang.com" or "https://bloomerang.com/")
   * instead of a real job application / career link.
   */
  protected isRootHomepage(urlStr: string | null | undefined): boolean {
    if (!urlStr) return false;
    try {
      const u = new URL(urlStr, window.location.href);
      const path = u.pathname.replace(/\/+$/, "").toLowerCase();
      if (path === "" && !u.search && !u.hash) return true;
      if (["/home", "/index", "/index.html", "/en", "/en-us", "/us"].includes(path) && !u.search && !u.hash) return true;
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Cleans a URL by unwrapping redirect links (e.g. linkedin.com/safety/go?url=...)
   * and removing tracking query parameters
   */
  protected cleanDirectUrl(url: string | null | undefined): string | null {
    if (!url) return null;
    try {
      let current = url.trim();

      // Check for base64 encoded URL (e.g. ZipRecruiter match_token: aHR0c...)
      const b64Idx = current.indexOf("aHR0c");
      if (b64Idx !== -1) {
        try {
          const rawSub = current.substring(b64Idx);
          const match = rawSub.match(/^[A-Za-z0-9+/=%_-]+/);
          if (match) {
            let b64 = decodeURIComponent(match[0]);
            while (b64.length % 4 !== 0) b64 += "=";
            const decoded = atob(b64);
            const foundUrl = decoded.match(/https?:\/\/[^\s"'<>\\]+/);
            if (foundUrl && (foundUrl[0].startsWith("http://") || foundUrl[0].startsWith("https://"))) {
              current = decodeURIComponent(foundUrl[0]);
            }
          }
        } catch {}
      }

      // Repeatedly unwrap redirect wrappers (e.g. linkedin.com/safety/go?url=..., google.com/url?q=...)
      for (let i = 0; i < 3; i++) {
        const parsed = new URL(current, window.location.href);
        const redirectParam = parsed.searchParams.get("url") ||
                              parsed.searchParams.get("q") ||
                              parsed.searchParams.get("dest") ||
                              parsed.searchParams.get("target") ||
                              parsed.searchParams.get("redirect") ||
                              parsed.searchParams.get("u") ||
                              parsed.searchParams.get("match_token");
        if (redirectParam) {
          if (redirectParam.includes("aHR0c")) {
            const b64Sub = redirectParam.substring(redirectParam.indexOf("aHR0c"));
            const m = b64Sub.match(/^[A-Za-z0-9+/=%_-]+/);
            if (m) {
              try {
                let b64 = decodeURIComponent(m[0]);
                while (b64.length % 4 !== 0) b64 += "=";
                const dec = atob(b64);
                const matchUrl = dec.match(/https?:\/\/[^\s"'<>\\]+/);
                if (matchUrl) {
                  current = decodeURIComponent(matchUrl[0]);
                  continue;
                }
              } catch {}
            }
          }
          const decoded = decodeURIComponent(redirectParam).trim();
          if (decoded.startsWith("http://") || decoded.startsWith("https://")) {
            current = decoded;
            continue;
          }
        }
        break;
      }

      const parsed = new URL(current, window.location.href);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return null;
      }

      // Remove common tracking params
      const trackingParams = [
        "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
        "refId", "trackingId", "trk", "trkEmail", "midToken", "eType", "ref",
        "referenceId", "gh_jid", "ref_src", "from", "source", "urlhash", "mt", "isSdui"
      ];
      trackingParams.forEach(p => parsed.searchParams.delete(p));
      return parsed.toString();
    } catch {
      return url;
    }
  }

  /**
   * Runs an inspector in the page's MAIN execution context (bypassing Chrome MV3 isolated world limitations).
   * This gives 100% direct access to React Fiber (__reactFiber$) and state attached to DOM nodes.
   */
  protected async extractFromMainWorld(): Promise<{ applyUrl: string | null; directLink: string | null; jobData: any } | null> {
    // 1. Ask background service worker to execute via chrome.scripting (bypasses strict CSP on sites like HiringCafe)
    try {
      if (typeof chrome !== "undefined" && chrome.runtime?.sendMessage) {
        const bgData = await new Promise<any>((resolve) => {
          chrome.runtime.sendMessage({ action: "getMainWorldData" }, (response) => {
            if (chrome.runtime.lastError || !response) {
              resolve(null);
            } else {
              resolve(response.result);
            }
          });
        });

        if (bgData) {
          console.log("[BaseExtractor] ✅ Main world data received via background scripting:", bgData);
          return bgData;
        }
      }
    } catch (e) {
      console.warn("[BaseExtractor] Background main world communication error, falling back to script injection:", e);
    }

    // 2. Fallback: inline script tag injection
    return new Promise((resolve) => {
      const eventId = "job_extractor_main_" + Math.random().toString(36).substring(2);

      const handler = (e: any) => {
        window.removeEventListener(eventId, handler);
        resolve(e.detail);
      };

      window.addEventListener(eventId, handler);

      const script = document.createElement("script");
      script.textContent = `
        (function() {
          try {
            var blacklisted = ["hiringcafe.com", "hiring.cafe", "reddit.com", "twitter.com", "x.com", "facebook.com", "instagram.com", "youtube.com", "docs.google.com", "forms.gle", "google.com", "linkedin.com/sharing", "linkedin.com/feed"];
            function unwrapUrl(u) {
              if (!u || typeof u !== 'string') return null;
              var cur = u.trim();
              for (var ui = 0; ui < 3; ui++) {
                try {
                  var up = new URL(cur);
                  var rp = up.searchParams.get("url") || up.searchParams.get("q") || up.searchParams.get("dest") || up.searchParams.get("target") || up.searchParams.get("redirect") || up.searchParams.get("u");
                  if (rp) {
                    var dec = decodeURIComponent(rp).trim();
                    if (dec.indexOf("http://") === 0 || dec.indexOf("https://") === 0) {
                      cur = dec;
                      continue;
                    }
                  }
                } catch(e) {}
                break;
              }
              return cur;
            }
            function isCareerUrl(u) {
              if (!u || typeof u !== 'string') return false;
              var unwrapped = unwrapUrl(u) || u;
              var low = unwrapped.toLowerCase().trim();
              if (low.indexOf('http://') !== 0 && low.indexOf('https://') !== 0) return false;
              try {
                var p = new URL(unwrapped);
                var path = p.pathname.replace(/\/+$/, '').toLowerCase();
                if (path === '' && !p.search && !p.hash) return false;
                if (['/home', '/index', '/index.html', '/en', '/en-us', '/us'].indexOf(path) !== -1 && !p.search && !p.hash) return false;
              } catch(e) {
                return false;
              }
              return !blacklisted.some(function(b) { return low.indexOf(b) !== -1; });
            }

            var applyUrl = null;
            var jobData = null;

            function isRichJobObject(obj) {
              if (!obj || typeof obj !== 'object') return false;
              var hasCompany = !!(obj.company_name || obj.companyName || obj.company || obj.employer || obj.organization || obj.orgName);
              var hasTitle = !!(obj.title || obj.job_title || obj.jobTitle || obj.position);
              return hasCompany || hasTitle;
            }

            // 1. Search buttons and links with "Apply"
            var allBtns = Array.from(document.querySelectorAll('button, a, [role="button"]'));
            var applyBtns = allBtns.filter(function(el) {
              var t = (el.textContent || '').toLowerCase();
              var a = (el.getAttribute('aria-label') || '').toLowerCase();
              return (t.includes('apply') || a.includes('apply')) && !t.includes('apply process') && !t.includes('encouraged to apply') && !t.includes('how to apply');
            });

            for (var i = 0; i < applyBtns.length; i++) {
              var btn = applyBtns[i];

              // Check if button is an anchor or contains/is contained by an anchor
              var anchor = (btn instanceof HTMLAnchorElement ? btn : (btn.closest && btn.closest('a[href]')) || (btn.querySelector && btn.querySelector('a[href]')));
              if (anchor && anchor.href && isCareerUrl(anchor.href)) {
                applyUrl = unwrapUrl(anchor.href) || anchor.href;
              }

              // Check data attributes
              var dataAttrs = ['data-url', 'data-href', 'data-apply-url', 'data-external-url', 'data-source-url', 'data-job-url', 'data-link'];
              for (var da = 0; da < dataAttrs.length; da++) {
                var dVal = btn.getAttribute ? btn.getAttribute(dataAttrs[da]) : null;
                if (dVal && isCareerUrl(dVal)) {
                  applyUrl = unwrapUrl(dVal) || dVal;
                  break;
                }
              }

              // Traverse up fiber from button
              var curr = btn;
              var hops = 0;
              while (curr && hops < 25) {
                var keys = Object.keys(curr);
                for (var k = 0; k < keys.length; k++) {
                  var key = keys[k];
                  if (key.indexOf('__reactFiber') === 0 || key.indexOf('__reactProps') === 0) {
                    var fiber = curr[key];
                    var f = fiber;
                    var fHops = 0;
                    while (f && fHops < 25) {
                      var props = f.memoizedProps || f.pendingProps;
                      if (props) {
                        var j = props.job || props.jobResult || props.jobData || props.jobDetail || props.dataSource || props.data || props.item || props.jobPosting || props.selectedJob;
                        if (j && typeof j === 'object') {
                          if (!jobData || (!isRichJobObject(jobData) && isRichJobObject(j))) {
                            jobData = j;
                          } else if (jobData && isRichJobObject(j)) {
                            jobData = Object.assign({}, j, jobData);
                          } else if (!jobData) {
                            jobData = j;
                          }
                          var candUrls = [
                            j.apply_url, j.applyUrl, j.application_url, j.applicationUrl,
                            j.source_url, j.sourceUrl, j.external_url, j.externalUrl,
                            j.original_url, j.originalUrl, j.job_url, j.jobUrl,
                            j.apply_link, j.applyLink, j.target_url, j.targetUrl,
                            j.redirect_url, j.redirectUrl, j.url, j.link
                          ];
                          for (var cu = 0; cu < candUrls.length; cu++) {
                            if (isCareerUrl(candUrls[cu]) && !applyUrl) {
                              applyUrl = unwrapUrl(candUrls[cu]) || candUrls[cu];
                              break;
                            }
                          }
                        }
                        for (var pKey in props) {
                          var val = props[pKey];
                          if (isCareerUrl(val) && !applyUrl) {
                            applyUrl = unwrapUrl(val) || val;
                            break;
                          }
                        }
                      }
                      if (applyUrl && isRichJobObject(jobData)) break;
                      f = f.return;
                      fHops++;
                    }
                  }
                  if (applyUrl && isRichJobObject(jobData)) break;
                }
                if (applyUrl && isRichJobObject(jobData)) break;
                curr = curr.parentElement;
                hops++;
              }
              if (applyUrl && isRichJobObject(jobData)) break;
            }

            // 1.5. Scan active modal / container / card fiber for rich job data if not yet found
            if (!isRichJobObject(jobData)) {
              var containerSels = [
                '[role="dialog"]',
                '[aria-modal="true"]',
                'div[class*="drawer" i]',
                'div[class*="modal" i]',
                'div[class*="sheet" i]',
                'article',
                '[class*="border-black"]',
                '[class*="selected"]',
                '[class*="active"]',
                'div.cursor-pointer'
              ];
              for (var cs = 0; cs < containerSels.length; cs++) {
                var cEl = document.querySelector(containerSels[cs]);
                if (!cEl) continue;
                var cCurr = cEl;
                var cHops = 0;
                while (cCurr && cHops < 15 && !isRichJobObject(jobData)) {
                  var cKeys = Object.keys(cCurr);
                  for (var ck = 0; ck < cKeys.length; ck++) {
                    if (cKeys[ck].indexOf('__reactFiber') === 0 || cKeys[ck].indexOf('__reactProps') === 0) {
                      var cf = cCurr[cKeys[ck]];
                      var cfHops = 0;
                      while (cf && cfHops < 20) {
                        var cp = cf.memoizedProps || cf.pendingProps;
                        if (cp) {
                          var cj = cp.job || cp.jobResult || cp.jobData || cp.jobDetail || cp.dataSource || cp.data || cp.item || cp.jobPosting || cp.selectedJob;
                          if (cj && typeof cj === 'object' && isRichJobObject(cj)) {
                            jobData = Object.assign({}, cj, jobData || {});
                            var cUrls = [
                              cj.apply_url, cj.applyUrl, cj.application_url, cj.applicationUrl,
                              cj.source_url, cj.sourceUrl, cj.external_url, cj.externalUrl,
                              cj.original_url, cj.originalUrl, cj.job_url, cj.jobUrl,
                              cj.apply_link, cj.applyLink, cj.target_url, cj.targetUrl,
                              cj.redirect_url, cj.redirectUrl, cj.url, cj.link
                            ];
                            for (var cu = 0; cu < cUrls.length; cu++) {
                              if (isCareerUrl(cUrls[cu]) && !applyUrl) {
                                applyUrl = unwrapUrl(cUrls[cu]) || cUrls[cu];
                                break;
                              }
                            }
                            break;
                          }
                        }
                        cf = cf.return;
                        cfHops++;
                      }
                    }
                    if (isRichJobObject(jobData)) break;
                  }
                  cCurr = cCurr.parentElement;
                  cHops++;
                }
                if (isRichJobObject(jobData)) break;
              }
            }

            function finishAndDispatch() {
              // 2. Safe ATS links and __NEXT_DATA__ inspection
              if (!applyUrl) {
                var atsDomains = [
                  'greenhouse.io', 'lever.co', 'ashbyhq.com', 'myworkdayjobs.com', 'workday.com',
                  'smartrecruiters.com', 'taleo.net', 'icims.com', 'jobvite.com', 'bamboohr.com',
                  'rippling.com', 'workable.com', 'recruitee.com', 'breezy.hr', 'paylocity.com'
                ];
                var allAnchors = Array.from(document.querySelectorAll('a[href]'));
                for (var ai = 0; ai < allAnchors.length; ai++) {
                  var ah = allAnchors[ai].href;
                  if (ah && isCareerUrl(ah)) {
                    var ahLow = ah.toLowerCase();
                    if (atsDomains.some(function(d) { return ahLow.indexOf(d) !== -1; })) {
                      applyUrl = unwrapUrl(ah) || ah;
                      break;
                    }
                  }
                }
              }

              if (!applyUrl) {
                try {
                  var nextScript = document.getElementById('__NEXT_DATA__');
                  if (nextScript && nextScript.textContent) {
                    var nextData = JSON.parse(nextScript.textContent);
                    var pProps = nextData && nextData.props && nextData.props.pageProps;
                    var ds = pProps && pProps.dataSource;
                    var jr = ds ? (ds.jobResult || ds) : (pProps && (pProps.jobResult || pProps.job));
                    if (jr) {
                      var nCand = [
                        jr.applyUrl, jr.apply_url, jr.applicationUrl, jr.application_url,
                        jr.sourceUrl, jr.source_url, jr.externalUrl, jr.external_url,
                        jr.originalUrl, jr.original_url, jr.jobUrl, jr.job_url,
                        jr.applyLink, jr.apply_link, jr.url, jr.link
                      ];
                      for (var nc = 0; nc < nCand.length; nc++) {
                        if (isCareerUrl(nCand[nc])) {
                          applyUrl = unwrapUrl(nCand[nc]) || nCand[nc];
                          break;
                        }
                      }
                    }
                  }
                } catch(e) {}
              }

              // 3. Look for direct job link (prioritize active modal / active card)
              var directLink = null;
              var activeModal = document.querySelector('[role="dialog"], [aria-modal="true"], div[class*="drawer" i], div[class*="modal" i], div[class*="sheet" i], div.fixed, article');
              if (activeModal) {
                var modalLinks = Array.from(activeModal.querySelectorAll('a[href*="/job/"], a[href*="/jobs/view/"]'));
                if (modalLinks.length > 0) {
                  var pLink = modalLinks.find(function(a) {
                    return (a.textContent || '').toLowerCase().includes('job posting');
                  });
                  directLink = pLink ? pLink.href : modalLinks[0].href;
                }
              }
              if (!directLink) {
                var activeCard = document.querySelector('[class*="border-black"], [class*="selected"], [class*="active"]');
                if (activeCard) {
                  var cardLink = activeCard.querySelector('a[href*="/job/"], a[href*="/jobs/view/"]');
                  if (cardLink) directLink = cardLink.href;
                }
              }
              if (!directLink) {
                var jobLinks = Array.from(document.querySelectorAll('a[href*="/job/"], a[href*="/jobs/view/"]'));
                if (jobLinks.length > 0) {
                  var postingLink = jobLinks.find(function(a) {
                    return (a.textContent || '').toLowerCase().includes('job posting');
                  });
                  directLink = postingLink ? postingLink.href : jobLinks[0].href;
                }
              }

              window.dispatchEvent(new CustomEvent('${eventId}', {
                detail: {
                  applyUrl: applyUrl,
                  directLink: directLink,
                  jobData: jobData
                }
              }));
            }

            // Controlled synthetic click with navigation suppression
            if (!applyUrl && applyBtns.length > 0) {
              var primaryBtn = applyBtns.find(function(b) {
                var txt = (b.textContent || '').toLowerCase();
                return txt.includes('company') || txt.includes('apply now') || txt.includes('apply externally') || txt.includes('direct apply');
              }) || applyBtns.find(function(b) {
                var txt = (b.textContent || '').toLowerCase().trim();
                return txt === 'apply' || txt.indexOf('apply') === 0;
              }) || applyBtns[0];

              if (primaryBtn) {
                var interceptedUrl = null;
                var origOpen = window.open;
                var origAnchorClick = HTMLAnchorElement.prototype.click;

                window.open = function(url) {
                  if (url && typeof url === 'string') interceptedUrl = url;
                  return { focus: function() {}, close: function() {}, closed: false, document: {} };
                };

                HTMLAnchorElement.prototype.click = function() {
                  if (this.href && typeof this.href === 'string') {
                    interceptedUrl = this.href;
                  }
                };

                var preventNav = function(e) {
                  var a = (e.target && (e.target.tagName === 'A' ? e.target : (e.target.closest ? e.target.closest('a[href]') : null)));
                  if (a && a.href) {
                    interceptedUrl = a.href;
                  }
                  e.preventDefault();
                  e.stopPropagation();
                };
                window.addEventListener('click', preventNav, true);

                try {
                  var btnAnchor = (primaryBtn instanceof HTMLAnchorElement ? primaryBtn : (primaryBtn.closest && primaryBtn.closest('a[href]')) || (primaryBtn.querySelector && primaryBtn.querySelector('a[href]')));
                  if (btnAnchor && btnAnchor.href && isCareerUrl(btnAnchor.href)) {
                    interceptedUrl = btnAnchor.href;
                  }
                  primaryBtn.dispatchEvent(new MouseEvent('click', {
                    bubbles: true,
                    cancelable: true,
                    view: window
                  }));
                } catch(e) {
                  console.warn('[MainWorld] Apply click dispatch error:', e);
                }

                setTimeout(function() {
                  window.removeEventListener('click', preventNav, true);
                  window.open = origOpen;
                  HTMLAnchorElement.prototype.click = origAnchorClick;
                  if (isCareerUrl(interceptedUrl)) {
                    applyUrl = unwrapUrl(interceptedUrl) || interceptedUrl;
                  }
                  finishAndDispatch();
                }, 300);
              } else {
                finishAndDispatch();
              }
            } else {
              finishAndDispatch();
            }
          } catch (err) {
            window.dispatchEvent(new CustomEvent('${eventId}', {
              detail: { applyUrl: null, directLink: null, jobData: null, error: String(err) }
            }));
          }
        })();
      `;

      try {
        (document.head || document.documentElement).appendChild(script);
        script.remove();
      } catch (e) {
        resolve(null);
      }

      // Safety timeout
      setTimeout(() => {
        window.removeEventListener(eventId, handler);
        resolve(null);
      }, 1500);
    });
  }

  /**
   * Scans a DOM node and its parents/children for React Fiber props/state.
   */
  protected extractFromReactFiber(element: Element | null): any {
    if (!element) return null;

    const isNonCareerUrl = (url: string | null | undefined): boolean => {
      if (!url || typeof url !== "string") return true;
      const low = url.toLowerCase();
      if (!low.startsWith("http://") && !low.startsWith("https://")) return true;
      return low.includes("hiringcafe.com") || low.includes("hiring.cafe") ||
             low.includes("reddit.com") || low.includes("twitter.com") || low.includes("x.com") ||
             low.includes("facebook.com") || low.includes("instagram.com") || low.includes("youtube.com") ||
             low.includes("discord.") || low.includes("github.com") || low.includes("tiktok.com");
    };

    const findJobInProps = (obj: any, depth = 0, visited = new Set()): any => {
      if (!obj || typeof obj !== "object" || depth > 8 || visited.has(obj)) return null;
      visited.add(obj);

      const title = obj.title || obj.jobTitle || obj.job_title || obj.position;
      const company = obj.company || obj.companyName || obj.company_name || obj.employer || obj.company_title || obj.orgName;
      
      let candidateApplyUrl = obj.applyUrl || obj.apply_url || obj.applicationUrl || obj.application_url || 
                              obj.sourceUrl || obj.source_url || obj.externalUrl || obj.external_url || 
                              obj.originalUrl || obj.original_url || obj.jobUrl || obj.job_url || 
                              obj.apply_link || obj.applyLink || obj.url;

      if (isNonCareerUrl(candidateApplyUrl)) {
        candidateApplyUrl = null;
      }

      const desc = obj.description || obj.jobDescription || obj.job_description || obj.summary;

      if (title && (company || candidateApplyUrl || (desc && typeof desc === "string" && desc.length > 50))) {
        return {
          title: typeof title === "string" ? title : title?.name || null,
          company: typeof company === "string" ? company : company?.name || company?.title || null,
          applyUrl: candidateApplyUrl,
          description: typeof desc === "string" ? desc : null,
          salary: obj.salary || obj.salaryDesc || obj.compensation || obj.salary_range || null,
          location: obj.location || obj.jobLocation || obj.city || null,
          workModel: obj.workModel || obj.remoteType || (obj.isRemote ? "Remote" : null),
          raw: obj
        };
      }

      for (const key of Object.keys(obj)) {
        if (key.startsWith("_react") || key === "parent" || key === "stateNode") continue;
        try {
          const found = findJobInProps(obj[key], depth + 1, visited);
          if (found) return found;
        } catch {}
      }
      return null;
    };

    let curr: Element | null = element;
    let hops = 0;
    while (curr && hops < 10) {
      for (const key in curr) {
        if (key.startsWith("__reactFiber$") || key.startsWith("__reactProps$") || key.startsWith("__reactInternalInstance$")) {
          try {
            const fiber = (curr as any)[key];
            const found = findJobInProps(fiber?.memoizedProps || fiber?.pendingProps || fiber);
            if (found) return found;
          } catch (e) {
            console.warn("[BaseExtractor] Fiber traversal error:", e);
          }
        }
      }
      curr = curr.parentElement;
      hops++;
    }
    return null;
  }

  /**
   * Detects direct external ATS and application URLs across links and buttons
   */
  protected findDirectApplyUrl(container: ParentNode = document): string | null {
    const atsDomains = [
      "greenhouse.io", "lever.co", "ashbyhq.com", "myworkdayjobs.com", "workday.com",
      "smartrecruiters.com", "taleo.net", "icims.com", "jobvite.com", "bamboohr.com",
      "rippling.com", "workable.com", "recruitee.com", "breezy.hr", "paylocity.com",
      "ultipro.com", "adp.com", "jazz.co", "hireology.com", "pinpointhq.com",
      "applytojob.com", "polywork.com", "careerplug.com", "phenompeople.com",
      "eightfold.ai", "applicantstack.com", "successfactors.com"
    ];

    const blacklistedDomains = [
      "reddit.com", "twitter.com", "x.com", "facebook.com", "instagram.com",
      "youtube.com", "discord.com", "discord.gg", "github.com", "tiktok.com",
      "t.me", "telegram.org", "medium.com", "hiringcafe.com", "hiring.cafe",
      "ziprecruiter.com/jobs/v2", "ziprecruiter.com/co/",
      "linkedin.com/in", "linkedin.com/sharing", "linkedin.com/company/hiring-cafe",
      "docs.google.com", "forms.gle", "google.com/forms", "support.google.com",
      "accounts.google.com", "typeform.com"
    ];

    const isNonCareerUrl = (url: string | null | undefined): boolean => {
      if (!url || typeof url !== "string") return true;
      const low = url.toLowerCase().trim();
      if (!low.startsWith("http://") && !low.startsWith("https://")) return true;
      if (this.isRootHomepage(url)) return true;
      if (low.includes("ziprecruiter.com") && !low.includes("job-redirect")) return true;
      return blacklistedDomains.some(b => low.includes(b));
    };

    const searchRoots = container !== document ? [container, document] : [document];

    for (const root of searchRoots) {
      // 1. Highest Priority: Inspect all Apply buttons / links directly (e.g. pink "Apply now" buttons on HiringCafe)
      const applyElements = Array.from(root.querySelectorAll<HTMLElement>("button, a, [role='button']"));
      for (const el of applyElements) {
        const text = (el.textContent || "").toLowerCase().trim();
        const aria = (el.getAttribute("aria-label") || "").toLowerCase();
        if (text.includes("apply") || aria.includes("apply")) {
          // A. If it's an anchor tag or wrapped inside/contains an anchor tag
          const anchor = (el instanceof HTMLAnchorElement ? el : el.closest("a[href]") || el.querySelector("a[href]")) as HTMLAnchorElement | null;
          if (anchor && anchor.href && !isNonCareerUrl(anchor.href)) {
            console.log("[BaseExtractor] Found direct apply link on anchor:", anchor.href);
            return anchor.href;
          }

          // B. Check data attributes
          for (const attr of ["data-url", "data-href", "data-apply-url", "data-external-url", "data-source-url", "data-job-url", "data-link"]) {
            const val = el.getAttribute(attr);
            if (val && !isNonCareerUrl(val)) return val;
          }

          // C. Traverse React Fiber up the tree from the Apply button
          for (const key in el) {
            if (key.startsWith("__reactFiber$") || key.startsWith("__reactProps$") || key.startsWith("__reactInternalInstance$")) {
              try {
                let fiber = (el as any)[key];
                let hops = 0;
                while (fiber && hops < 20) {
                  const props = fiber.memoizedProps || fiber.pendingProps;
                  if (props) {
                    // Check direct string props
                    for (const p of [
                      "applyUrl", "apply_url", "applicationUrl", "application_url",
                      "sourceUrl", "source_url", "externalUrl", "external_url",
                      "originalUrl", "original_url", "jobUrl", "job_url",
                      "applyLink", "apply_link", "targetUrl", "target_url",
                      "redirectUrl", "redirect_url", "href", "url", "link"
                    ]) {
                      if (typeof props[p] === "string" && !isNonCareerUrl(props[p])) {
                        console.log(`[BaseExtractor] Found apply URL in button fiber prop '${p}':`, props[p]);
                        return props[p];
                      }
                    }

                    // Check nested job objects
                    const job = props.job || props.jobResult || props.jobData || props.jobDetail || props.dataSource || props.data || props.item || props.jobPosting || props.selectedJob;
                    if (job && typeof job === "object") {
                      for (const p of [
                        "apply_url", "applyUrl", "application_url", "applicationUrl",
                        "source_url", "sourceUrl", "external_url", "externalUrl",
                        "original_url", "originalUrl", "job_url", "jobUrl",
                        "apply_link", "applyLink", "target_url", "targetUrl",
                        "redirect_url", "redirectUrl", "url", "link"
                      ]) {
                        if (typeof job[p] === "string" && !isNonCareerUrl(job[p])) {
                          console.log(`[BaseExtractor] Found apply URL in button fiber job object '${p}':`, job[p]);
                          return job[p];
                        }
                      }
                    }
                  }
                  fiber = fiber.return;
                  hops++;
                }
              } catch (e) {
                console.warn("[BaseExtractor] Button fiber traversal error:", e);
              }
            }
          }
        }
      }

      const allLinks = Array.from(root.querySelectorAll<HTMLAnchorElement>("a[href]"));

      // 2. Second priority: links matching known ATS providers
      for (const link of allLinks) {
        const href = link.href;
        if (!href || isNonCareerUrl(href)) continue;
        if (atsDomains.some(domain => href.toLowerCase().includes(domain))) {
          console.log("[BaseExtractor] Found direct ATS URL:", href);
          return href;
        }
      }

      // 3. Third priority: Links on buttons / anchors with explicit Apply labels
      const applyKeywords = ["apply on company", "apply via company", "apply on website", "apply externally", "direct apply", "company site", "apply now", "apply"];
      for (const link of allLinks) {
        const href = link.href;
        if (!href || isNonCareerUrl(href)) continue;

        const text = (link.textContent || "").toLowerCase().trim();
        const aria = (link.getAttribute("aria-label") || "").toLowerCase();
        const title = (link.getAttribute("title") || "").toLowerCase();
        const className = (link.className || "").toString().toLowerCase();

        const isApply = applyKeywords.some(k => text.includes(k) || aria.includes(k) || title.includes(k) || className.includes(k));
        if (isApply) {
          const cleaned = this.cleanDirectUrl(href);
          if (cleaned && !isNonCareerUrl(cleaned)) {
            console.log("[BaseExtractor] Found direct apply link via Apply button cleanDirectUrl:", cleaned);
            return cleaned;
          }

          try {
            const urlObj = new URL(href);
            const redirectParam = urlObj.searchParams.get("url") || 
                                  urlObj.searchParams.get("redirect") || 
                                  urlObj.searchParams.get("dest") || 
                                  urlObj.searchParams.get("target") ||
                                  urlObj.searchParams.get("match_token") ||
                                  urlObj.searchParams.get("u");
            if (redirectParam && !isNonCareerUrl(redirectParam)) {
              return decodeURIComponent(redirectParam);
            }
          } catch {}

          if (link.target === "_blank" || href.includes("/apply") || href.includes("careers") || href.includes("job") || !isNonCareerUrl(href)) {
            return href;
          }
        }
      }

      // 4. Fourth priority: External target="_blank" career links (excluding social media & forms)
      for (const link of allLinks) {
        const href = link.href;
        if (!href || isNonCareerUrl(href)) continue;

        if (link.target === "_blank" || link.getAttribute("rel")?.includes("noopener")) {
          const text = (link.textContent || "").toLowerCase();
          if (!text.includes("privacy") && !text.includes("terms") && !text.includes("contact") && !text.includes("support") && !text.includes("help us discover")) {
            console.log("[BaseExtractor] Found external career link:", href);
            return href;
          }
        }
      }
    }

    return null;
  }

  /**
   * Cleans raw company name text by removing prefixes like '@', 'at ',
   * and trailing button/badge labels like 'View All Jobs', 'Website', etc.
   */
  protected cleanCompanyName(raw: string | null | undefined): string | null {
    if (!raw) return null;
    let s = raw.replace(/\s+/g, " ").trim();

    // 1. Strip leading '@', 'at ', bullets, hyphens
    s = s.replace(/^[@•·\-\s]+/, "").replace(/^at\s+/i, "").trim();

    // 2. Strip leading navigation/action labels like "View All", "See All", "Jobs at"
    s = s.replace(/^(?:View|See)\s+All(?:\s+Open)?\s+/i, "").trim();
    s = s.replace(/^Jobs\s+at\s+/i, "").trim();

    // 3. Trailing boilerplate phrases to strip (repeated to handle chained phrases like "View All JobsWebsite")
    const trailingPhrases = [
      /\s*(?:View\s+All(?:\s+Jobs?)?|See\s+All(?:\s+Jobs?)?|View\s+Jobs?|All\s+Jobs?|All\s+Open\s+Jobs?|More\s+Jobs?)\s*$/i,
      /\s*(?:Company\s+Website|Visit\s+Website|Visit\s+Site|Website)\s*$/i,
      /\s*(?:Follow(?:ing)?|Share|Save|Saved|Apply(?:\s+Now)?|Easy\s+Apply|Report)\s*$/i,
      /\s+(?:Jobs|Openings|Positions|Careers)\s*$/i
    ];

    for (let i = 0; i < 4; i++) {
      let changed = false;
      for (const pattern of trailingPhrases) {
        if (pattern.test(s)) {
          s = s.replace(pattern, "").trim();
          changed = true;
        }
      }
      if (!changed) break;
    }

    // 4. Strip any residual trailing punctuation or symbols
    s = s.replace(/[@•·\-\s]+$/, "").trim();

    return s || null;
  }


  protected isValidCompanyName(name: string | null | undefined, titleHint?: string | null): boolean {
    if (!name) return false;
    const clean = this.cleanCompanyName(name);
    if (!clean) return false;
    if (clean.length < 2 || clean.length > 80) return false;

    const boilerplatePatterns = [
      /^view\s+all(?:\s+jobs?)?$/i,
      /^see\s+all(?:\s+jobs?)?$/i,
      /^view\s+jobs?$/i,
      /^all\s+jobs?$/i,
      /^all\s+open\s+jobs?$/i,
      /^more\s+jobs?$/i,
      /^company\s+website$/i,
      /^visit\s+(?:website|site|company)$/i,
      /^website$/i,
      /^about\s+(?:the\s+)?company$/i,
      /^explore\s+jobs?$/i,
      /^open\s+positions?$/i,
      /^careers?$/i,
      /^apply(?:\s+now|\s+on\s+company|\s+externally)?$/i,
      /^easy\s+apply$/i,
      /^apply\s+process$/i,
      /^encouraged\s+to\s+apply$/i,
      /^job\s+posting$/i,
      /^share(?:\s+this\s+job)?$/i,
      /^save(?:\s+job)?$/i,
      /^saved$/i,
      /^follow(?:ing)?$/i,
      /^reviews?$/i,
      /^ratings?$/i,
      /^report(?:\s+job)?$/i,
      /^copy\s+link$/i,
      /^overview$/i,
      /^benefits$/i,
      /^requirements$/i,
      /^qualifications$/i,
      /^responsibilities$/i,
      /^about\s+us$/i,
      /^about\s+the\s+role$/i,
      /^about\s+the\s+position$/i,
      /^verified$/i,
      /^settings$/i,
      /^menu$/i,
      /^log\s*in$/i,
      /^sign\s*up$/i,
      /^dashboard$/i,
      /^notifications$/i,
      /^messages$/i,
      /^profile$/i,
      /^jobs?$/i,
      /^remote$/i,
      /^hybrid$/i,
      /^on-?site$/i,
      /^full-?time$/i,
      /^part-?time$/i,
      /^contract$/i,
      /^posted$/i,
      /^employer$/i,
      /^hiring\s+cafe$/i,
      /^linkedin$/i,
      /^ziprecruiter$/i,
      /^indeed$/i,
      /^glassdoor$/i
    ];

    if (boilerplatePatterns.some(pattern => pattern.test(clean))) return false;
    if (/\b(?:follow\s+.*?on\s+(?:linkedin|twitter|facebook|instagram|youtube)|follow\s+us\b)/i.test(clean)) return false;
    if (/\b(?:ziprecruiter|hiring\s*cafe|linkedin|indeed|glassdoor)\b/i.test(clean)) return false;
    if (/^follow\b/i.test(clean)) return false;
    if (/posted\b/i.test(clean)) return false;
    if (/\b(?:ago|today|yesterday|just now)\b/i.test(clean)) return false;
    if (/\d+\s*(?:d|w|m|mo|y|h|min|sec|days?|weeks?|months?|hours?|mins?|years?)\b/i.test(clean)) return false;
    if (/(?:full|part)[- ]time/i.test(clean)) return false;
    if (/(?:remote|hybrid|on[- ]site|in[- ]office)\b/i.test(clean)) return false;
    if (/(?:usd|eur|gbp|\$|€|£)\s*\d+/i.test(clean)) return false;
    if (titleHint && clean.toLowerCase() === titleHint.toLowerCase()) return false;
    if (/^(http|\/\/|www\.)/i.test(clean)) return false;
    if (/^\d+(\.\d+)?(\s*(reviews?|ratings?|stars?|\/5|\/10|k|m))?$/i.test(clean)) return false;
    return true;
  }

  /**
   * Helper to extract company name from URL / href (e.g. /co/Triumph-Financial -> Triumph Financial)
   */
  protected extractFromCompanyHref(href: string | null | undefined, titleHint?: string | null): string | null {
    if (!href) return null;
    try {
      const url = new URL(href, window.location.href);
      const compParam = url.searchParams.get("company") || url.searchParams.get("companyName") || url.searchParams.get("employer");
      if (compParam) {
        const decoded = decodeURIComponent(compParam).replace(/\+/g, " ").trim();
        if (this.isValidCompanyName(decoded, titleHint)) return this.cleanCompanyName(decoded);
      }
      
      const pathSegments = url.pathname.split("/").filter(Boolean);
      const compIdx = pathSegments.findIndex(s => s === "company" || s === "companies" || s === "co" || s === "c" || s === "employer" || s === "org");
      if (compIdx !== -1 && pathSegments[compIdx + 1]) {
        const rawSlug = decodeURIComponent(pathSegments[compIdx + 1])
          .replace(/\.(com|org|net|io|ai|co|tech|us|ca|uk|gov)$/i, "");
        const spaced = rawSlug.replace(/[-_]+/g, " ").trim();
        const titleCased = spaced.replace(/\b\w/g, l => l.toUpperCase());
        if (this.isValidCompanyName(titleCased, titleHint)) return this.cleanCompanyName(titleCased);
      }
    } catch {}
    return null;
  }

  /**
   * Extracts company name using multi-tier heuristics
   */
  protected findCompanyName(container: ParentNode = document, titleHint: string | null = null, descriptionHint: string | null = null): string | null {
    // Strategy 1: Company Links & Elements in DOM
    const companyLinkSelectors = [
      'a[href*="company="]',
      'a[href*="/co/"]',
      'a[href*="/company/"]',
      'a[href*="/companies/"]',
      'a[href*="/c/"]',
      'a[href*="/org/"]',
      'a[href*="/employer/"]',
      'a[href*="/search?company="]',
      'a[href*="hiring.cafe/company/"]',
      'a[href*="hiringcafe.com/org/"]',
      '[data-testid="company-name"]',
      '[data-company-name]',
      '[class*="companyName" i]',
      '[class*="company-name" i]',
      '[class*="company_name" i]',
      '[class*="employer" i]',
      '.hiring_company'
    ];

    for (const sel of companyLinkSelectors) {
      const els = Array.from(container.querySelectorAll(sel));
      for (const el of els) {
        // Skip social media links
        if (el instanceof HTMLAnchorElement && el.href) {
          const h = el.href.toLowerCase();
          if (h.includes("linkedin.com") || h.includes("twitter.com") || h.includes("x.com") || h.includes("facebook.com") || h.includes("instagram.com") || h.includes("youtube.com")) {
            continue;
          }
        }
        const text = this.cleanCompanyName(el.textContent);
        if (this.isValidCompanyName(text, titleHint)) {
          return text;
        }

        const aria = el.getAttribute("aria-label") || el.getAttribute("title");
        if (aria) {
          const cleanAria = this.cleanCompanyName(aria.replace(/^(view all jobs by|view all jobs at|jobs at|about)\s+/i, ""));
          if (this.isValidCompanyName(cleanAria, titleHint)) {
            return cleanAria;
          }
        }

        // If the element has boilerplate text like "View all", inspect sibling elements in its parent container
        if (el.parentElement) {
          const siblings = Array.from(el.parentElement.querySelectorAll<HTMLElement>("span, div, h2, h3, strong, b, p"))
            .filter(sib => sib !== el && !el.contains(sib) && sib.children.length === 0);
          for (const sib of siblings) {
            const sibText = this.cleanCompanyName(sib.textContent);
            if (this.isValidCompanyName(sibText, titleHint)) {
              return sibText;
            }
          }

          // Also test cleaning the parent element's text (e.g. "Everest Tech View all" -> "Everest Tech")
          const parentClean = this.cleanCompanyName(el.parentElement.textContent);
          if (this.isValidCompanyName(parentClean, titleHint)) {
            return parentClean;
          }
        }
      }
    }

    // Strategy 2: Company Logo alt / title attributes
    const logoSelectors = [
      'img[alt*="logo" i]',
      'img[alt*="company" i]',
      'img[class*="company" i]',
      'img[class*="logo" i]',
      'img[data-test-company-logo]',
      'img[alt]'
    ];

    for (const sel of logoSelectors) {
      const imgs = Array.from(container.querySelectorAll<HTMLImageElement>(sel));
      for (const img of imgs) {
        const alt = img.getAttribute("alt") || img.getAttribute("title");
        if (alt) {
          const cleanAlt = this.cleanCompanyName(alt.replace(/\b(logo|icon|avatar|company logo|official logo)\b/gi, ""));
          if (this.isValidCompanyName(cleanAlt, titleHint)) {
            return cleanAlt;
          }
        }
      }
    }

    // Strategy 3: Subtitle / Adjacent sibling to Job Title H1/H2
    const h1 = container.querySelector("h1, h2");
    if (h1 && h1.parentElement) {
      const siblings = Array.from(h1.parentElement.querySelectorAll("p, span, div, a, h3"));
      for (const sib of siblings) {
        if (sib !== h1 && !h1.contains(sib)) {
          // Check leaf elements inside sibling container first to avoid concatenated buttons
          const leaves = Array.from(sib.querySelectorAll<HTMLElement>("span, a, p, strong, b"))
            .filter(el => el.children.length === 0 && (el.textContent || "").trim().length > 1);
          for (const leaf of leaves) {
            const leafText = this.cleanCompanyName(leaf.textContent);
            if (this.isValidCompanyName(leafText, titleHint)) {
              return leafText;
            }
          }

          const text = this.cleanCompanyName(sib.textContent);
          if (this.isValidCompanyName(text, titleHint)) {
            return text;
          }
        }
      }
    }

    // Strategy 4: Extract Company Name from Description NLP as fallback
    if (descriptionHint) {
      const fromDesc = this.extractCompanyFromDescription(descriptionHint);
      if (fromDesc && this.isValidCompanyName(fromDesc, titleHint)) {
        console.log("[BaseExtractor] ✅ Company found via description NLP:", fromDesc);
        return this.cleanCompanyName(fromDesc);
      }
    }

    // Strategy 5: Meta tags
    const ogSite = document.querySelector('meta[property="og:site_name"]')?.getAttribute("content");
    if (this.isValidCompanyName(ogSite, titleHint) && !["LinkedIn", "Hiring Cafe", "ZipRecruiter", "Indeed", "JobRight"].includes(ogSite!)) {
      return this.cleanCompanyName(ogSite);
    }

    // Strategy 6: Parse Document Title heuristics
    if (document.title) {
      const atMatch = document.title.match(/(?:at|@)\s+([^|\-–·]+)/i);
      if (atMatch && this.isValidCompanyName(atMatch[1], titleHint)) {
        return this.cleanCompanyName(atMatch[1]);
      }
      const parts = document.title.split(/[|\-–·]/).map(p => p.trim());
      for (const part of parts) {
        if (this.isValidCompanyName(part, titleHint) && !["Jobs", "Job Search", "Hiring Cafe", "LinkedIn", "ZipRecruiter"].includes(part)) {
          return this.cleanCompanyName(part);
        }
      }
    }

    // Strategy 7: Fallback to Company Links Href / URL slug ONLY as last resort
    for (const sel of companyLinkSelectors) {
      const els = Array.from(container.querySelectorAll<HTMLAnchorElement>(sel));
      for (const el of els) {
        if (el.href) {
          const fromHref = this.extractFromCompanyHref(el.href, titleHint);
          if (fromHref && this.isValidCompanyName(fromHref, titleHint)) {
            return fromHref;
          }
        }
      }
    }

    return null;
  }

  /**
   * Intelligently extracts the company name from common opening/closing sentences in job descriptions
   */
  protected extractCompanyFromDescription(desc: string): string | null {
    if (!desc || desc.length < 20) return null;

    // Pattern 1: "<Company> is recruiting / hiring / seeking / looking for a <Title>..."
    const recruitMatch = desc.match(/(?:^|\n|\.\s+)\s*([A-Z0-9][A-Za-z0-9&,.'\- ]{2,55}?)\s+is\s+(?:recruiting|hiring|seeking|looking for|searching for|accepting applications for)\b/i);
    if (recruitMatch && recruitMatch[1]) {
      const name = recruitMatch[1].trim();
      if (!/^(the|a|this|our|we|our company|who|why)\b/i.test(name)) {
        return name;
      }
    }

    // Pattern 2: "<Company> is an award-winning / leading / premier provider..."
    const leaderMatch = desc.match(/(?:^|\n|\.\s+)\s*([A-Z0-9][A-Za-z0-9&,.'\- ]{2,55}?)\s+is\s+(?:an?\s+(?:award-winning|leading|premier|global|rapidly growing|innovative|equal opportunity|industry-leading|established)\b)/i);
    if (leaderMatch && leaderMatch[1]) {
      const name = leaderMatch[1].trim();
      if (!/^(the|a|this|our|we|who|why)\b/i.test(name)) {
        return name;
      }
    }

    // Pattern 3: "About <Company>:", "At <Company>,", "Welcome to <Company>", "Join <Company>!"
    const aboutMatch = desc.match(/(?:^|\n)\s*(?:About|At|Welcome to|Join)\s+([A-Z0-9][A-Za-z0-9&,.'\- ]{2,55}?)(?::|\.|\s*!|,|\s+we\b|\s+is\b|\s+our\b|\s+-)/i);
    if (aboutMatch && aboutMatch[1]) {
      const name = aboutMatch[1].trim();
      if (!/^(the role|the job|the position|the team|us|our team|our company)\b/i.test(name)) {
        return name;
      }
    }

    return null;
  }

  protected getBySelectors(selectors: string[], container: ParentNode = document): string | null {
    const boilerplate = [
      "settings", "menu", "log in", "login", "sign up", "signup", 
      "dashboard", "notifications", "messages", "profile", "jobs",
      "ziprecruiter", "job description", "similar jobs", "search jobs",
      "create alert", "job details", "overview", "apply"
    ];
    for (const selector of selectors) {
      try {
        const elements = container.querySelectorAll(selector);
        for (const el of Array.from(elements)) {
          if (el && el.textContent) {
            const cleaned = this.cleanStr(el.textContent);
            if (cleaned) {
              const low = cleaned.toLowerCase().trim();
              if (!boilerplate.includes(low)) {
                return cleaned;
              }
            }
          }
        }
      } catch (e) {
        console.warn("[BaseExtractor] Selector query failed:", selector, e);
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

  protected extractSalaryFromDOM(container: ParentNode = document): string | null {
    const salarySelectors = [
      ".job_salary", ".salary", "[class*='salary']", "[class*='Salary']",
      ".job-salary", ".salary-range", ".compensation"
    ];
    for (const sel of salarySelectors) {
      const el = container.querySelector(sel);
      if (el && el.textContent) {
        const text = el.textContent.trim();
        if (text.includes("$")) return text;
      }
    }
    
    const textContent = (container as HTMLElement).innerText || document.body.innerText;
    const salaryRegex = /\$[0-9,]+[Kk]?\s*-\s*\$[0-9,]+[Kk]?(?:\/[a-zA-Z]+)?/g;
    const matches = textContent.match(salaryRegex);
    if (matches && matches.length > 0) {
      return matches[0];
    }
    return null;
  }

  protected extractLocationFromDOM(container: ParentNode = document): string | null {
    const locSelectors = [
      '[data-testid="job-location"]',
      '[data-testid="job-details-location"]',
      '[data-testid*="location" i]',
      '.location',
      '.job-location',
      '.job_location',
      '[class*="jobLocation" i]',
      '[class*="job-location" i]',
      '[class*="job_location" i]',
      '[class*="location" i]',
      '[class*="Location"]',
      '[itemprop="jobLocation"]',
      '.company-location',
      '.job-card-location'
    ];
    for (const sel of locSelectors) {
      const els = Array.from(container.querySelectorAll<HTMLElement>(sel));
      for (const el of els) {
        if (el.closest('header, nav, form, [role="search"], [class*="search" i]')) {
          continue;
        }
        const text = el.textContent?.trim();
        if (text && text.length > 2 && text.length < 100 && !text.includes("Apply")) {
          return text;
        }
      }
    }
    return null;
  }

  protected extractLocationFromText(text: string | null): string | null {
    if (!text) return null;
    const patterns = [
      /(?:Location|Job Location|Based in|Work Location):\s*([A-Za-z\s]+(?:,\s*[A-Z]{2})?)/i,
      /(?:Location|Job Location):\s*([A-Za-z\s]+,\s*[A-Za-z\s]+)/i
    ];
    for (const pat of patterns) {
      const match = text.match(pat);
      if (match && match[1]) {
        let loc = match[1].trim();
        loc = loc.replace(/\s+(?:or\s+Remote|Remote).*$/i, "").trim();
        if (loc.length > 2 && loc.length < 60) {
          return loc;
        }
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
              const directApply = this.cleanDirectUrl(item.directApplyUrl || item.applyUrl || item.url || null);

              results.push({
                title: this.cleanStr(item.title),
                company: this.cleanStr(item.hiringOrganization?.name || item.hiringOrganization?.legalName),
                link: this.cleanDirectUrl(item.url) || window.location.href,
                description: this.cleanStr(plainDesc),
                applyUrl: directApply || this.findDirectApplyUrl() || window.location.href,
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

          // Find genuine application URL - NEVER accept cr.companyURL (marketing homepage)
          const candUrls = [
            jr.applyUrl, jr.apply_url, jr.applicationUrl, jr.application_url,
            jr.sourceUrl, jr.source_url, jr.externalUrl, jr.external_url,
            jr.originalUrl, jr.original_url, jr.jobUrl, jr.job_url,
            jr.applyLink, jr.apply_link, jr.jobPostUrl, jr.url, jr.link,
            ds.applyUrl, ds.apply_url, ds.sourceUrl, ds.source_url,
            ds.externalUrl, ds.external_url, ds.originalUrl, ds.original_url,
            ds.jobUrl, ds.job_url
          ];

          let applyUrl: string | null = null;
          for (const cand of candUrls) {
            if (typeof cand === "string" && cand.trim().startsWith("http") && !this.isRootHomepage(cand)) {
              applyUrl = this.cleanDirectUrl(cand);
              break;
            }
          }

          if (!applyUrl || this.isRootHomepage(applyUrl)) {
            applyUrl = this.findDirectApplyUrl(document);
          }

          if (!applyUrl || this.isRootHomepage(applyUrl)) {
            applyUrl = window.location.href;
          }
          
          return [{
            title: this.cleanStr(title),
            company: this.cleanStr(company),
            link: window.location.href,
            description: this.cleanStr(description),
            applyUrl: this.cleanDirectUrl(applyUrl) || window.location.href,
            source: "json-ld",
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
          } catch {
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
        
        const applyUrl = jobObj.applyUrl || jobObj.apply_url || jobObj.sourceUrl || jobObj.source_url || jobObj.externalUrl || jobObj.url || this.findDirectApplyUrl() || null;
        
        const salary = jobObj.salary || jobObj.salaryRange || jobObj.compensation || null;
        const location = jobObj.location || jobObj.jobLocation || jobObj.city || null;
        const workModel = jobObj.workModel || jobObj.work_model || jobObj.remoteType || this.extractWorkModelFromText(plainDesc);
        
        return [{
          title: this.cleanStr(title),
          company: this.cleanStr(company),
          link: window.location.href,
          description: this.cleanStr(plainDesc),
          applyUrl: this.cleanDirectUrl(applyUrl),
          source: "json-ld",
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

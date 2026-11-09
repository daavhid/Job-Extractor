/**
 * Helper that runs inside the target tab's MAIN execution context (page world).
 * This function has full access to window.open, React Fiber props (__reactFiber$),
 * and internal component state.
 *
 * NOTE: This function must remain 100% self-contained as it is serialized and
 * executed in the target tab via chrome.scripting.executeScript.
 */
export async function extractMainWorldPageData(): Promise<{
  applyUrl: string | null;
  directLink: string | null;
  jobData: any;
}> {
  try {
    const blacklisted = [
      "hiringcafe.com", "hiring.cafe", "reddit.com", "twitter.com", "x.com",
      "facebook.com", "instagram.com", "youtube.com", "docs.google.com", "forms.gle",
      "google.com", "linkedin.com/sharing", "linkedin.com/feed"
    ];

    function unwrapUrl(u: any): string | null {
      if (!u || typeof u !== "string") return null;
      let cur = u.trim();

      // Check for base64-encoded URL (e.g. ZipRecruiter match_token: aHR0c...)
      const b64Idx = cur.indexOf("aHR0c");
      if (b64Idx !== -1) {
        try {
          const rawSub = cur.substring(b64Idx);
          const match = rawSub.match(/^[A-Za-z0-9+/=%_-]+/);
          if (match) {
            let b64 = decodeURIComponent(match[0]);
            while (b64.length % 4 !== 0) b64 += "=";
            const decoded = atob(b64);
            const foundUrl = decoded.match(/https?:\/\/[^\s"'<>\\]+/);
            if (foundUrl && (foundUrl[0].startsWith("http://") || foundUrl[0].startsWith("https://"))) {
              cur = decodeURIComponent(foundUrl[0]);
            }
          }
        } catch {}
      }

      for (let i = 0; i < 3; i++) {
        try {
          const p = new URL(cur);
          const r = p.searchParams.get("url") || p.searchParams.get("q") || p.searchParams.get("dest") || p.searchParams.get("target") || p.searchParams.get("redirect") || p.searchParams.get("u") || p.searchParams.get("match_token");
          if (r) {
            if (r.includes("aHR0c")) {
              const b64Sub = r.substring(r.indexOf("aHR0c"));
              const m = b64Sub.match(/^[A-Za-z0-9+/=%_-]+/);
              if (m) {
                try {
                  let b64 = decodeURIComponent(m[0]);
                  while (b64.length % 4 !== 0) b64 += "=";
                  const dec = atob(b64);
                  const matchUrl = dec.match(/https?:\/\/[^\s"'<>\\]+/);
                  if (matchUrl) {
                    cur = decodeURIComponent(matchUrl[0]);
                    continue;
                  }
                } catch {}
              }
            }
            const dec = decodeURIComponent(r).trim();
            if (dec.startsWith("http://") || dec.startsWith("https://")) {
              cur = dec;
              continue;
            }
          }
        } catch {}
        break;
      }
      return cur;
    }

    function isCareerUrl(u: any): boolean {
      if (!u || typeof u !== "string") return false;
      const unwrapped = unwrapUrl(u) || u;
      const low = unwrapped.toLowerCase().trim();
      if (!low.startsWith("http://") && !low.startsWith("https://")) return false;
      try {
        const p = new URL(unwrapped);
        const path = p.pathname.replace(/\/+$/, "").toLowerCase();
        if (path === "" && !p.search && !p.hash) return false;
        if (["/home", "/index", "/index.html", "/en", "/en-us", "/us"].includes(path) && !p.search && !p.hash) return false;
      } catch {
        return false;
      }
      if (low.includes("ziprecruiter.com") && !low.includes("job-redirect")) return false;
      return !blacklisted.some(b => low.includes(b));
    }

    let applyUrl: string | null = null;
    let directLink: string | null = null;
    let jobData: any = null;

    function isRichJobObject(obj: any): boolean {
      if (!obj || typeof obj !== 'object') return false;
      const hasCompany = !!(obj.company_name || obj.companyName || obj.company || obj.employer || obj.organization || obj.orgName);
      const hasTitle = !!(obj.title || obj.job_title || obj.jobTitle || obj.position);
      return hasCompany || hasTitle;
    }

    // 1. Direct Job Link (prioritize active modal / drawer / active card)
    const activeModal = document.querySelector('[role="dialog"], [aria-modal="true"], div[class*="drawer" i], div[class*="modal" i], div[class*="sheet" i], div.fixed, article');
    if (activeModal) {
      const modalLinks = Array.from(activeModal.querySelectorAll<HTMLAnchorElement>('a[href*="/job/"], a[href*="/jobs/view/"]'));
      if (modalLinks.length > 0) {
        const postingLink = modalLinks.find(a => (a.textContent || "").toLowerCase().includes("job posting"));
        directLink = postingLink ? postingLink.href : modalLinks[0].href;
      }
    }
    if (!directLink) {
      const activeCard = document.querySelector('[class*="border-black"], [class*="selected"], [class*="active"]');
      if (activeCard) {
        const cardLink = activeCard.querySelector<HTMLAnchorElement>('a[href*="/job/"], a[href*="/jobs/view/"]');
        if (cardLink) directLink = cardLink.href;
      }
    }
    if (!directLink) {
      const jobLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/job/"], a[href*="/jobs/view/"]'));
      if (jobLinks.length > 0) {
        const postingLink = jobLinks.find(a => (a.textContent || "").toLowerCase().includes("job posting"));
        directLink = postingLink ? postingLink.href : jobLinks[0].href;
      }
    }

    // 2. Identify Apply Buttons
    const allClickables = Array.from(document.querySelectorAll<HTMLElement>('button, a, [role="button"]'));
    const applyBtns = allClickables.filter(el => {
      const t = (el.textContent || "").toLowerCase().trim();
      const a = (el.getAttribute("aria-label") || "").toLowerCase().trim();
      const isApply = t.includes("apply") || a.includes("apply");
      const isMetadata = t.includes("apply process") || t.includes("encouraged to apply") || t.includes("how to apply");
      return isApply && !isMetadata;
    });

    applyBtns.sort((a, b) => {
      const aPrimary = (a.className || "").includes("primary") || (a instanceof HTMLAnchorElement && a.href.includes("job-redirect")) ? 1 : 0;
      const bPrimary = (b.className || "").includes("primary") || (b instanceof HTMLAnchorElement && b.href.includes("job-redirect")) ? 1 : 0;
      return bPrimary - aPrimary;
    });

    // 3. Inspect Apply Buttons for direct anchors, data attributes, and React Fiber
    for (const btn of applyBtns) {
      const anchor = (btn instanceof HTMLAnchorElement ? btn : (btn.closest && btn.closest('a[href]')) || (btn.querySelector && btn.querySelector('a[href]'))) as HTMLAnchorElement | null;
      if (anchor && anchor.href && isCareerUrl(anchor.href) && !applyUrl) {
        applyUrl = unwrapUrl(anchor.href) || anchor.href;
      }

      const dataAttrs = ['data-url', 'data-href', 'data-apply-url', 'data-external-url', 'data-source-url', 'data-job-url', 'data-link'];
      for (const da of dataAttrs) {
        const dVal = btn.getAttribute ? btn.getAttribute(da) : null;
        if (dVal && isCareerUrl(dVal) && !applyUrl) {
          applyUrl = unwrapUrl(dVal) || dVal;
          break;
        }
      }

      let curr: any = btn;
      let hops = 0;
      while (curr && hops < 30) {
        for (const k in curr) {
          if (k.startsWith("__reactFiber$") || k.startsWith("__reactProps$")) {
            let f = curr[k];
            let fHops = 0;
            while (f && fHops < 30) {
              const props = f.memoizedProps || f.pendingProps;
              if (props) {
                const j = props.job || props.jobResult || props.jobData || props.jobDetail || props.dataSource || props.data || props.item || props.jobPosting || props.selectedJob;
                if (j && typeof j === "object") {
                  const jTitle = (j.title || j.job_title || j.jobTitle || "").toString().toLowerCase().trim();
                  const isRelevant = !jTitle || document.title.toLowerCase().includes(jTitle) || (document.body.innerText && document.body.innerText.substring(0, 3000).toLowerCase().includes(jTitle));
                  if (isRelevant) {
                    if (!jobData || (!isRichJobObject(jobData) && isRichJobObject(j))) {
                      jobData = j;
                    } else if (jobData && isRichJobObject(j)) {
                      jobData = Object.assign({}, j, jobData);
                    } else if (!jobData) {
                      jobData = j;
                    }
                  }
                  const candUrls = [
                    j.apply_url, j.applyUrl, j.application_url, j.applicationUrl,
                    j.source_url, j.sourceUrl, j.external_url, j.externalUrl,
                    j.original_url, j.originalUrl, j.job_url, j.jobUrl,
                    j.apply_link, j.applyLink, j.target_url, j.targetUrl,
                    j.redirect_url, j.redirectUrl, j.url, j.link
                  ];
                  for (const cu of candUrls) {
                    if (isCareerUrl(cu) && !applyUrl) {
                      applyUrl = unwrapUrl(cu) || cu;
                      break;
                    }
                  }
                }
                for (const p of ["applyUrl", "apply_url", "applicationUrl", "application_url", "externalUrl", "external_url", "sourceUrl", "source_url", "originalUrl", "original_url", "targetUrl", "target_url", "redirectUrl", "redirect_url", "jobUrl", "job_url", "url", "link", "href"]) {
                  if (typeof props[p] === "string" && isCareerUrl(props[p]) && !applyUrl) {
                    applyUrl = unwrapUrl(props[p]) || props[p];
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

    // 4. Scan active container / modal / card fiber if jobData not yet rich
    if (!isRichJobObject(jobData)) {
      const containerSels = [
        '[role="dialog"]', '[aria-modal="true"]', 'div[class*="drawer" i]', 'div[class*="modal" i]',
        'div[class*="sheet" i]', 'article', '[class*="border-black"]', '[class*="selected"]', '[class*="active"]', 'div.cursor-pointer'
      ];
      for (const sel of containerSels) {
        const cEl = document.querySelector(sel);
        if (!cEl) continue;
        let cCurr: any = cEl;
        let cHops = 0;
        while (cCurr && cHops < 15 && !isRichJobObject(jobData)) {
          for (const k in cCurr) {
            if (k.startsWith("__reactFiber$") || k.startsWith("__reactProps$")) {
              let cf = cCurr[k];
              let cfHops = 0;
              while (cf && cfHops < 20) {
                const cp = cf.memoizedProps || cf.pendingProps;
                if (cp) {
                  const cj = cp.job || cp.jobResult || cp.jobData || cp.jobDetail || cp.dataSource || cp.data || cp.item || cp.jobPosting || cp.selectedJob;
                  if (cj && typeof cj === 'object' && isRichJobObject(cj)) {
                    jobData = Object.assign({}, cj, jobData || {});
                    const cUrls = [
                      cj.apply_url, cj.applyUrl, cj.application_url, cj.applicationUrl,
                      cj.source_url, cj.sourceUrl, cj.external_url, cj.externalUrl,
                      cj.original_url, cj.originalUrl, cj.job_url, cj.jobUrl,
                      cj.apply_link, cj.applyLink, cj.target_url, cj.targetUrl,
                      cj.redirect_url, cj.redirectUrl, cj.url, cj.link
                    ];
                    for (const cu of cUrls) {
                      if (isCareerUrl(cu) && !applyUrl) {
                        applyUrl = unwrapUrl(cu) || cu;
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

    // 5. Safe non-invasive ATS & redirect anchor scanner (NO synthetic clicks)
    if (!applyUrl) {
      const redirectAnchors = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="job-redirect"]'));
      for (const ra of redirectAnchors) {
        if (ra.href) {
          const unwrapped = unwrapUrl(ra.href);
          if (unwrapped && isCareerUrl(unwrapped)) {
            applyUrl = unwrapped;
            break;
          }
        }
      }
    }

    // 6. Safe page HTML Base64 URL scanner (e.g. ZipRecruiter match_token in hydration data)
    if (!applyUrl) {
      try {
        const b64Matches = document.documentElement.innerHTML.match(/aHR0cHM6Ly9[A-Za-z0-9+/=%_-]+/g);
        if (b64Matches) {
          for (const raw of b64Matches) {
            try {
              let b64 = decodeURIComponent(raw);
              while (b64.length % 4 !== 0) b64 += "=";
              const dec = atob(b64);
              if ((dec.startsWith("http://") || dec.startsWith("https://")) && isCareerUrl(dec)) {
                applyUrl = unwrapUrl(dec) || dec;
                break;
              }
            } catch {}
          }
        }
      } catch {}
    }

    // 6. Safe ATS links search
    if (!applyUrl) {
      const atsDomains = [
        'greenhouse.io', 'lever.co', 'ashbyhq.com', 'myworkdayjobs.com', 'workday.com',
        'smartrecruiters.com', 'taleo.net', 'icims.com', 'jobvite.com', 'bamboohr.com',
        'rippling.com', 'workable.com', 'recruitee.com', 'breezy.hr', 'paylocity.com'
      ];
      const allAnchors = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'));
      for (const a of allAnchors) {
        if (a.href && isCareerUrl(a.href)) {
          const low = a.href.toLowerCase();
          if (atsDomains.some(d => low.includes(d))) {
            applyUrl = unwrapUrl(a.href) || a.href;
            break;
          }
        }
      }
    }

    // 7. Safe __NEXT_DATA__ inspection
    if (!applyUrl) {
      try {
        const nextScript = document.getElementById('__NEXT_DATA__');
        if (nextScript && nextScript.textContent) {
          const nextData = JSON.parse(nextScript.textContent);
          const pProps = nextData?.props?.pageProps;
          const ds = pProps?.dataSource;
          const jr = ds ? (ds.jobResult || ds) : (pProps?.jobResult || pProps?.job);
          if (jr) {
            const nCand = [
              jr.applyUrl, jr.apply_url, jr.applicationUrl, jr.application_url,
              jr.sourceUrl, jr.source_url, jr.externalUrl, jr.external_url,
              jr.originalUrl, jr.original_url, jr.jobUrl, jr.job_url,
              jr.applyLink, jr.apply_link, jr.url, jr.link
            ];
            for (const nc of nCand) {
              if (isCareerUrl(nc)) {
                applyUrl = unwrapUrl(nc) || nc;
                break;
              }
            }
          }
        }
      } catch {}
    }

    return {
      applyUrl,
      directLink,
      jobData: jobData ? {
        title: jobData.title || jobData.job_title || jobData.role,
        company: jobData.company || jobData.company_name || jobData.organization,
        applyUrl: jobData.apply_url || jobData.applyUrl || jobData.application_url,
        description: jobData.description || jobData.job_description,
        location: jobData.location || jobData.formatted_address,
        salary: jobData.salary || jobData.compensation
      } : null
    };
  } catch (err) {
    return { applyUrl: null, directLink: null, jobData: null };
  }
}

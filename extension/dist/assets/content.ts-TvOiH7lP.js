(function(){var e=class{cleanStr(e){return e&&e.replace(/\s+/g,` `).trim()||null}isRootHomepage(e){if(!e)return!1;try{let t=new URL(e,window.location.href),n=t.pathname.replace(/\/+$/,``).toLowerCase();return!!(n===``&&!t.search&&!t.hash||[`/home`,`/index`,`/index.html`,`/en`,`/en-us`,`/us`].includes(n)&&!t.search&&!t.hash)}catch{return!1}}cleanDirectUrl(e){if(!e)return null;try{let t=e.trim(),n=t.indexOf(`aHR0c`);if(n!==-1)try{let e=t.substring(n).match(/^[A-Za-z0-9+/=%_-]+/);if(e){let n=decodeURIComponent(e[0]);for(;n.length%4!=0;)n+=`=`;let r=atob(n).match(/https?:\/\/[^\s"'<>\\]+/);r&&(r[0].startsWith(`http://`)||r[0].startsWith(`https://`))&&(t=decodeURIComponent(r[0]))}}catch{}for(let e=0;e<3;e++){let e=new URL(t,window.location.href),n=e.searchParams.get(`url`)||e.searchParams.get(`q`)||e.searchParams.get(`dest`)||e.searchParams.get(`target`)||e.searchParams.get(`redirect`)||e.searchParams.get(`u`)||e.searchParams.get(`match_token`);if(n){if(n.includes(`aHR0c`)){let e=n.substring(n.indexOf(`aHR0c`)).match(/^[A-Za-z0-9+/=%_-]+/);if(e)try{let n=decodeURIComponent(e[0]);for(;n.length%4!=0;)n+=`=`;let r=atob(n).match(/https?:\/\/[^\s"'<>\\]+/);if(r){t=decodeURIComponent(r[0]);continue}}catch{}}let e=decodeURIComponent(n).trim();if(e.startsWith(`http://`)||e.startsWith(`https://`)){t=e;continue}}break}let r=new URL(t,window.location.href);return r.protocol!==`http:`&&r.protocol!==`https:`?null:([`utm_source`,`utm_medium`,`utm_campaign`,`utm_term`,`utm_content`,`refId`,`trackingId`,`trk`,`trkEmail`,`midToken`,`eType`,`ref`,`referenceId`,`gh_jid`,`ref_src`,`from`,`source`,`urlhash`,`mt`,`isSdui`].forEach(e=>r.searchParams.delete(e)),r.toString())}catch{return e}}async extractFromMainWorld(){try{if(typeof chrome<`u`&&chrome.runtime?.sendMessage){let e=await new Promise(e=>{chrome.runtime.sendMessage({action:`getMainWorldData`},t=>{chrome.runtime.lastError||!t?e(null):e(t.result)})});if(e)return console.log(`[BaseExtractor] ✅ Main world data received via background scripting:`,e),e}}catch(e){console.warn(`[BaseExtractor] Background main world communication error, falling back to script injection:`,e)}return new Promise(e=>{let t=`job_extractor_main_`+Math.random().toString(36).substring(2),n=r=>{window.removeEventListener(t,n),e(r.detail)};window.addEventListener(t,n);let r=document.createElement(`script`);r.textContent=`
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

              window.dispatchEvent(new CustomEvent('${t}', {
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
            window.dispatchEvent(new CustomEvent('${t}', {
              detail: { applyUrl: null, directLink: null, jobData: null, error: String(err) }
            }));
          }
        })();
      `;try{(document.head||document.documentElement).appendChild(r),r.remove()}catch{e(null)}setTimeout(()=>{window.removeEventListener(t,n),e(null)},1500)})}extractFromReactFiber(e){if(!e)return null;let t=e=>{if(!e||typeof e!=`string`)return!0;let t=e.toLowerCase();return!t.startsWith(`http://`)&&!t.startsWith(`https://`)||t.includes(`hiringcafe.com`)||t.includes(`hiring.cafe`)||t.includes(`reddit.com`)||t.includes(`twitter.com`)||t.includes(`x.com`)||t.includes(`facebook.com`)||t.includes(`instagram.com`)||t.includes(`youtube.com`)||t.includes(`discord.`)||t.includes(`github.com`)||t.includes(`tiktok.com`)},n=(e,r=0,i=new Set)=>{if(!e||typeof e!=`object`||r>8||i.has(e))return null;i.add(e);let a=e.title||e.jobTitle||e.job_title||e.position,o=e.company||e.companyName||e.company_name||e.employer||e.company_title||e.orgName,s=e.applyUrl||e.apply_url||e.applicationUrl||e.application_url||e.sourceUrl||e.source_url||e.externalUrl||e.external_url||e.originalUrl||e.original_url||e.jobUrl||e.job_url||e.apply_link||e.applyLink||e.url;t(s)&&(s=null);let c=e.description||e.jobDescription||e.job_description||e.summary;if(a&&(o||s||c&&typeof c==`string`&&c.length>50))return{title:typeof a==`string`?a:a?.name||null,company:typeof o==`string`?o:o?.name||o?.title||null,applyUrl:s,description:typeof c==`string`?c:null,salary:e.salary||e.salaryDesc||e.compensation||e.salary_range||null,location:e.location||e.jobLocation||e.city||null,workModel:e.workModel||e.remoteType||(e.isRemote?`Remote`:null),raw:e};for(let t of Object.keys(e))if(!(t.startsWith(`_react`)||t===`parent`||t===`stateNode`))try{let a=n(e[t],r+1,i);if(a)return a}catch{}return null},r=e,i=0;for(;r&&i<10;){for(let e in r)if(e.startsWith(`__reactFiber$`)||e.startsWith(`__reactProps$`)||e.startsWith(`__reactInternalInstance$`))try{let t=r[e],i=n(t?.memoizedProps||t?.pendingProps||t);if(i)return i}catch(e){console.warn(`[BaseExtractor] Fiber traversal error:`,e)}r=r.parentElement,i++}return null}findDirectApplyUrl(e=document){let t=`greenhouse.io,lever.co,ashbyhq.com,myworkdayjobs.com,workday.com,smartrecruiters.com,taleo.net,icims.com,jobvite.com,bamboohr.com,rippling.com,workable.com,recruitee.com,breezy.hr,paylocity.com,ultipro.com,adp.com,jazz.co,hireology.com,pinpointhq.com,applytojob.com,polywork.com,careerplug.com,phenompeople.com,eightfold.ai,applicantstack.com,successfactors.com`.split(`,`),n=`reddit.com,twitter.com,x.com,facebook.com,instagram.com,youtube.com,discord.com,discord.gg,github.com,tiktok.com,t.me,telegram.org,medium.com,hiringcafe.com,hiring.cafe,ziprecruiter.com/jobs/v2,ziprecruiter.com/co/,linkedin.com/in,linkedin.com/sharing,linkedin.com/company/hiring-cafe,docs.google.com,forms.gle,google.com/forms,support.google.com,accounts.google.com,typeform.com`.split(`,`),r=e=>{if(!e||typeof e!=`string`)return!0;let t=e.toLowerCase().trim();return!t.startsWith(`http://`)&&!t.startsWith(`https://`)||this.isRootHomepage(e)||t.includes(`ziprecruiter.com`)&&!t.includes(`job-redirect`)?!0:n.some(e=>t.includes(e))},i=e===document?[document]:[e,document];for(let e of i){let n=Array.from(e.querySelectorAll(`button, a, [role='button']`));for(let e of n){let t=(e.textContent||``).toLowerCase().trim(),n=(e.getAttribute(`aria-label`)||``).toLowerCase();if(t.includes(`apply`)||n.includes(`apply`)){let t=e instanceof HTMLAnchorElement?e:e.closest(`a[href]`)||e.querySelector(`a[href]`);if(t&&t.href&&!r(t.href))return console.log(`[BaseExtractor] Found direct apply link on anchor:`,t.href),t.href;for(let t of[`data-url`,`data-href`,`data-apply-url`,`data-external-url`,`data-source-url`,`data-job-url`,`data-link`]){let n=e.getAttribute(t);if(n&&!r(n))return n}for(let t in e)if(t.startsWith(`__reactFiber$`)||t.startsWith(`__reactProps$`)||t.startsWith(`__reactInternalInstance$`))try{let n=e[t],i=0;for(;n&&i<20;){let e=n.memoizedProps||n.pendingProps;if(e){for(let t of[`applyUrl`,`apply_url`,`applicationUrl`,`application_url`,`sourceUrl`,`source_url`,`externalUrl`,`external_url`,`originalUrl`,`original_url`,`jobUrl`,`job_url`,`applyLink`,`apply_link`,`targetUrl`,`target_url`,`redirectUrl`,`redirect_url`,`href`,`url`,`link`])if(typeof e[t]==`string`&&!r(e[t]))return console.log(`[BaseExtractor] Found apply URL in button fiber prop '${t}':`,e[t]),e[t];let t=e.job||e.jobResult||e.jobData||e.jobDetail||e.dataSource||e.data||e.item||e.jobPosting||e.selectedJob;if(t&&typeof t==`object`){for(let e of[`apply_url`,`applyUrl`,`application_url`,`applicationUrl`,`source_url`,`sourceUrl`,`external_url`,`externalUrl`,`original_url`,`originalUrl`,`job_url`,`jobUrl`,`apply_link`,`applyLink`,`target_url`,`targetUrl`,`redirect_url`,`redirectUrl`,`url`,`link`])if(typeof t[e]==`string`&&!r(t[e]))return console.log(`[BaseExtractor] Found apply URL in button fiber job object '${e}':`,t[e]),t[e]}}n=n.return,i++}}catch(e){console.warn(`[BaseExtractor] Button fiber traversal error:`,e)}}}let i=Array.from(e.querySelectorAll(`a[href]`));for(let e of i){let n=e.href;if(!(!n||r(n))&&t.some(e=>n.toLowerCase().includes(e)))return console.log(`[BaseExtractor] Found direct ATS URL:`,n),n}let a=[`apply on company`,`apply via company`,`apply on website`,`apply externally`,`direct apply`,`company site`,`apply now`,`apply`];for(let e of i){let t=e.href;if(!t||r(t))continue;let n=(e.textContent||``).toLowerCase().trim(),i=(e.getAttribute(`aria-label`)||``).toLowerCase(),o=(e.getAttribute(`title`)||``).toLowerCase(),s=(e.className||``).toString().toLowerCase();if(a.some(e=>n.includes(e)||i.includes(e)||o.includes(e)||s.includes(e))){let n=this.cleanDirectUrl(t);if(n&&!r(n))return console.log(`[BaseExtractor] Found direct apply link via Apply button cleanDirectUrl:`,n),n;try{let e=new URL(t),n=e.searchParams.get(`url`)||e.searchParams.get(`redirect`)||e.searchParams.get(`dest`)||e.searchParams.get(`target`)||e.searchParams.get(`match_token`)||e.searchParams.get(`u`);if(n&&!r(n))return decodeURIComponent(n)}catch{}if(e.target===`_blank`||t.includes(`/apply`)||t.includes(`careers`)||t.includes(`job`)||!r(t))return t}}for(let e of i){let t=e.href;if(!(!t||r(t))&&(e.target===`_blank`||e.getAttribute(`rel`)?.includes(`noopener`))){let n=(e.textContent||``).toLowerCase();if(!n.includes(`privacy`)&&!n.includes(`terms`)&&!n.includes(`contact`)&&!n.includes(`support`)&&!n.includes(`help us discover`))return console.log(`[BaseExtractor] Found external career link:`,t),t}}}return null}cleanCompanyName(e){if(!e)return null;let t=e.replace(/\s+/g,` `).trim();t=t.replace(/^[@•·\-\s]+/,``).replace(/^at\s+/i,``).trim(),t=t.replace(/^(?:View|See)\s+All(?:\s+Open)?\s+/i,``).trim(),t=t.replace(/^Jobs\s+at\s+/i,``).trim();let n=[/\s*(?:View\s+All(?:\s+Jobs?)?|See\s+All(?:\s+Jobs?)?|View\s+Jobs?|All\s+Jobs?|All\s+Open\s+Jobs?|More\s+Jobs?)\s*$/i,/\s*(?:Company\s+Website|Visit\s+Website|Visit\s+Site|Website)\s*$/i,/\s*(?:Follow(?:ing)?|Share|Save|Saved|Apply(?:\s+Now)?|Easy\s+Apply|Report)\s*$/i,/\s+(?:Jobs|Openings|Positions|Careers)\s*$/i];for(let e=0;e<4;e++){let e=!1;for(let r of n)r.test(t)&&(t=t.replace(r,``).trim(),e=!0);if(!e)break}return t=t.replace(/[@•·\-\s]+$/,``).trim(),t||null}isValidCompanyName(e,t){if(!e)return!1;let n=this.cleanCompanyName(e);return!(!n||n.length<2||n.length>80||[/^view\s+all(?:\s+jobs?)?$/i,/^see\s+all(?:\s+jobs?)?$/i,/^view\s+jobs?$/i,/^all\s+jobs?$/i,/^all\s+open\s+jobs?$/i,/^more\s+jobs?$/i,/^company\s+website$/i,/^visit\s+(?:website|site|company)$/i,/^website$/i,/^about\s+(?:the\s+)?company$/i,/^explore\s+jobs?$/i,/^open\s+positions?$/i,/^careers?$/i,/^apply(?:\s+now|\s+on\s+company|\s+externally)?$/i,/^easy\s+apply$/i,/^apply\s+process$/i,/^encouraged\s+to\s+apply$/i,/^job\s+posting$/i,/^share(?:\s+this\s+job)?$/i,/^save(?:\s+job)?$/i,/^saved$/i,/^follow(?:ing)?$/i,/^reviews?$/i,/^ratings?$/i,/^report(?:\s+job)?$/i,/^copy\s+link$/i,/^overview$/i,/^benefits$/i,/^requirements$/i,/^qualifications$/i,/^responsibilities$/i,/^about\s+us$/i,/^about\s+the\s+role$/i,/^about\s+the\s+position$/i,/^verified$/i,/^settings$/i,/^menu$/i,/^log\s*in$/i,/^sign\s*up$/i,/^dashboard$/i,/^notifications$/i,/^messages$/i,/^profile$/i,/^jobs?$/i,/^remote$/i,/^hybrid$/i,/^on-?site$/i,/^full-?time$/i,/^part-?time$/i,/^contract$/i,/^posted$/i,/^employer$/i,/^hiring\s+cafe$/i,/^linkedin$/i,/^ziprecruiter$/i,/^indeed$/i,/^glassdoor$/i].some(e=>e.test(n))||/\b(?:follow\s+.*?on\s+(?:linkedin|twitter|facebook|instagram|youtube)|follow\s+us\b)/i.test(n)||/\b(?:ziprecruiter|hiring\s*cafe|linkedin|indeed|glassdoor)\b/i.test(n)||/^follow\b/i.test(n)||/posted\b/i.test(n)||/\b(?:ago|today|yesterday|just now)\b/i.test(n)||/\d+\s*(?:d|w|m|mo|y|h|min|sec|days?|weeks?|months?|hours?|mins?|years?)\b/i.test(n)||/(?:full|part)[- ]time/i.test(n)||/(?:remote|hybrid|on[- ]site|in[- ]office)\b/i.test(n)||/(?:usd|eur|gbp|\$|€|£)\s*\d+/i.test(n)||t&&n.toLowerCase()===t.toLowerCase()||/^(http|\/\/|www\.)/i.test(n)||/^\d+(\.\d+)?(\s*(reviews?|ratings?|stars?|\/5|\/10|k|m))?$/i.test(n))}extractFromCompanyHref(e,t){if(!e)return null;try{let n=new URL(e,window.location.href),r=n.searchParams.get(`company`)||n.searchParams.get(`companyName`)||n.searchParams.get(`employer`);if(r){let e=decodeURIComponent(r).replace(/\+/g,` `).trim();if(this.isValidCompanyName(e,t))return this.cleanCompanyName(e)}let i=n.pathname.split(`/`).filter(Boolean),a=i.findIndex(e=>e===`company`||e===`companies`||e===`co`||e===`c`||e===`employer`||e===`org`);if(a!==-1&&i[a+1]){let e=decodeURIComponent(i[a+1]).replace(/\.(com|org|net|io|ai|co|tech|us|ca|uk|gov)$/i,``).replace(/[-_]+/g,` `).trim().replace(/\b\w/g,e=>e.toUpperCase());if(this.isValidCompanyName(e,t))return this.cleanCompanyName(e)}}catch{}return null}findCompanyName(e=document,t=null,n=null){let r=[`a[href*="company="]`,`a[href*="/co/"]`,`a[href*="/company/"]`,`a[href*="/companies/"]`,`a[href*="/c/"]`,`a[href*="/org/"]`,`a[href*="/employer/"]`,`a[href*="/search?company="]`,`a[href*="hiring.cafe/company/"]`,`a[href*="hiringcafe.com/org/"]`,`[data-testid="company-name"]`,`[data-company-name]`,`[class*="companyName" i]`,`[class*="company-name" i]`,`[class*="company_name" i]`,`[class*="employer" i]`,`.hiring_company`];for(let n of r){let r=Array.from(e.querySelectorAll(n));for(let e of r){if(e instanceof HTMLAnchorElement&&e.href){let t=e.href.toLowerCase();if(t.includes(`linkedin.com`)||t.includes(`twitter.com`)||t.includes(`x.com`)||t.includes(`facebook.com`)||t.includes(`instagram.com`)||t.includes(`youtube.com`))continue}let n=this.cleanCompanyName(e.textContent);if(this.isValidCompanyName(n,t))return n;let r=e.getAttribute(`aria-label`)||e.getAttribute(`title`);if(r){let e=this.cleanCompanyName(r.replace(/^(view all jobs by|view all jobs at|jobs at|about)\s+/i,``));if(this.isValidCompanyName(e,t))return e}if(e.parentElement){let n=Array.from(e.parentElement.querySelectorAll(`span, div, h2, h3, strong, b, p`)).filter(t=>t!==e&&!e.contains(t)&&t.children.length===0);for(let e of n){let n=this.cleanCompanyName(e.textContent);if(this.isValidCompanyName(n,t))return n}let r=this.cleanCompanyName(e.parentElement.textContent);if(this.isValidCompanyName(r,t))return r}}}for(let n of[`img[alt*="logo" i]`,`img[alt*="company" i]`,`img[class*="company" i]`,`img[class*="logo" i]`,`img[data-test-company-logo]`,`img[alt]`]){let r=Array.from(e.querySelectorAll(n));for(let e of r){let n=e.getAttribute(`alt`)||e.getAttribute(`title`);if(n){let e=this.cleanCompanyName(n.replace(/\b(logo|icon|avatar|company logo|official logo)\b/gi,``));if(this.isValidCompanyName(e,t))return e}}}let i=e.querySelector(`h1, h2`);if(i&&i.parentElement){let e=Array.from(i.parentElement.querySelectorAll(`p, span, div, a, h3`));for(let n of e)if(n!==i&&!i.contains(n)){let e=Array.from(n.querySelectorAll(`span, a, p, strong, b`)).filter(e=>e.children.length===0&&(e.textContent||``).trim().length>1);for(let n of e){let e=this.cleanCompanyName(n.textContent);if(this.isValidCompanyName(e,t))return e}let r=this.cleanCompanyName(n.textContent);if(this.isValidCompanyName(r,t))return r}}if(n){let e=this.extractCompanyFromDescription(n);if(e&&this.isValidCompanyName(e,t))return console.log(`[BaseExtractor] ✅ Company found via description NLP:`,e),this.cleanCompanyName(e)}let a=document.querySelector(`meta[property="og:site_name"]`)?.getAttribute(`content`);if(this.isValidCompanyName(a,t)&&![`LinkedIn`,`Hiring Cafe`,`ZipRecruiter`,`Indeed`,`JobRight`].includes(a))return this.cleanCompanyName(a);if(document.title){let e=document.title.match(/(?:at|@)\s+([^|\-–·]+)/i);if(e&&this.isValidCompanyName(e[1],t))return this.cleanCompanyName(e[1]);let n=document.title.split(/[|\-–·]/).map(e=>e.trim());for(let e of n)if(this.isValidCompanyName(e,t)&&![`Jobs`,`Job Search`,`Hiring Cafe`,`LinkedIn`,`ZipRecruiter`].includes(e))return this.cleanCompanyName(e)}for(let n of r){let r=Array.from(e.querySelectorAll(n));for(let e of r)if(e.href){let n=this.extractFromCompanyHref(e.href,t);if(n&&this.isValidCompanyName(n,t))return n}}return null}extractCompanyFromDescription(e){if(!e||e.length<20)return null;let t=e.match(/(?:^|\n|\.\s+)\s*([A-Z0-9][A-Za-z0-9&,.'\- ]{2,55}?)\s+is\s+(?:recruiting|hiring|seeking|looking for|searching for|accepting applications for)\b/i);if(t&&t[1]){let e=t[1].trim();if(!/^(the|a|this|our|we|our company|who|why)\b/i.test(e))return e}let n=e.match(/(?:^|\n|\.\s+)\s*([A-Z0-9][A-Za-z0-9&,.'\- ]{2,55}?)\s+is\s+(?:an?\s+(?:award-winning|leading|premier|global|rapidly growing|innovative|equal opportunity|industry-leading|established)\b)/i);if(n&&n[1]){let e=n[1].trim();if(!/^(the|a|this|our|we|who|why)\b/i.test(e))return e}let r=e.match(/(?:^|\n)\s*(?:About|At|Welcome to|Join)\s+([A-Z0-9][A-Za-z0-9&,.'\- ]{2,55}?)(?::|\.|\s*!|,|\s+we\b|\s+is\b|\s+our\b|\s+-)/i);if(r&&r[1]){let e=r[1].trim();if(!/^(the role|the job|the position|the team|us|our team|our company)\b/i.test(e))return e}return null}getBySelectors(e,t=document){let n=[`settings`,`menu`,`log in`,`login`,`sign up`,`signup`,`dashboard`,`notifications`,`messages`,`profile`,`jobs`,`ziprecruiter`,`job description`,`similar jobs`,`search jobs`,`create alert`,`job details`,`overview`,`apply`];for(let r of e)try{let e=t.querySelectorAll(r);for(let t of Array.from(e))if(t&&t.textContent){let e=this.cleanStr(t.textContent);if(e){let t=e.toLowerCase().trim();if(!n.includes(t))return e}}}catch(e){console.warn(`[BaseExtractor] Selector query failed:`,r,e)}return null}htmlToText(e){if(!e)return``;try{let t=document.createElement(`div`);return t.innerHTML=e,t.querySelectorAll(`br`).forEach(e=>e.replaceWith(`
`)),t.querySelectorAll(`p, div, li, h1, h2, h3, h4, h5, h6, tr`).forEach(e=>{let t=document.createElement(`span`);t.textContent=`
`,e.parentNode?.insertBefore(t,e.nextSibling)}),t.textContent?.trim().replace(/\n{3,}/g,`

`)||``}catch(t){return console.warn(`[BaseExtractor] Failed to clean HTML:`,t),e.replace(/<[^>]*>/g,``)}}parseSalaryFromJSONLD(e){if(!e.baseSalary)return null;try{let t=e.baseSalary,n=t.currency||`USD`,r=n===`USD`?`$`:n+` `;if(typeof t==`object`){let e=t.value;if(typeof e==`object`&&e){let n=e.unitText||t.unitText||`YEAR`,i=n.toLowerCase()===`year`?`/yr`:n.toLowerCase()===`hour`?`/hr`:``;if(e.minValue!==void 0&&e.maxValue!==void 0)return`${r}${this.formatNum(e.minValue)} - ${r}${this.formatNum(e.maxValue)}${i}`;if(e.value!==void 0)return`${r}${this.formatNum(e.value)}${i}`}else if(typeof e==`number`||typeof e==`string`)return`${r}${this.formatNum(e)}`}else if(typeof t==`number`||typeof t==`string`)return`${r}${this.formatNum(t)}`}catch(e){console.warn(`Error parsing salary from JSON-LD:`,e)}return null}formatNum(e){let t=typeof e==`string`?parseFloat(e):e;return isNaN(t)?String(e):t>=1e3?t%1e3==0?t/1e3+`K`:(t/1e3).toFixed(1)+`K`:String(t)}parseLocationFromJSONLD(e){if(!e.jobLocation)return null;try{let t=e.jobLocation;if(typeof t==`object`&&t){let e=t.address;if(typeof e==`object`&&e){let t=[e.addressLocality||``,e.addressRegion||``,e.addressCountry||``].filter(e=>!!e);if(t.length>0)return t.join(`, `)}else if(typeof e==`string`)return e}else if(typeof t==`string`)return t}catch(e){console.warn(`Error parsing location from JSON-LD:`,e)}return null}parseWorkModelFromJSONLD(e){if(!e)return null;if(e.jobLocationType===`TELECOMMUTE`||e.jobLocationType?.toLowerCase()===`telecommute`)return`Remote`;let t=typeof e.jobLocation==`string`?e.jobLocation:JSON.stringify(e.jobLocation||``);return t.toLowerCase().includes(`remote`)||t.toLowerCase().includes(`telecommute`)?`Remote`:null}extractSalaryFromDOM(e=document){for(let t of[`.job_salary`,`.salary`,`[class*='salary']`,`[class*='Salary']`,`.job-salary`,`.salary-range`,`.compensation`]){let n=e.querySelector(t);if(n&&n.textContent){let e=n.textContent.trim();if(e.includes(`$`))return e}}let t=(e.innerText||document.body.innerText).match(/\$[0-9,]+[Kk]?\s*-\s*\$[0-9,]+[Kk]?(?:\/[a-zA-Z]+)?/g);return t&&t.length>0?t[0]:null}extractLocationFromDOM(e=document){for(let t of[`[data-testid="job-location"]`,`[data-testid="job-details-location"]`,`[data-testid*="location" i]`,`.location`,`.job-location`,`.job_location`,`[class*="jobLocation" i]`,`[class*="job-location" i]`,`[class*="job_location" i]`,`[class*="location" i]`,`[class*="Location"]`,`[itemprop="jobLocation"]`,`.company-location`,`.job-card-location`]){let n=Array.from(e.querySelectorAll(t));for(let e of n){if(e.closest(`header, nav, form, [role="search"], [class*="search" i]`))continue;let t=e.textContent?.trim();if(t&&t.length>2&&t.length<100&&!t.includes(`Apply`))return t}}return null}extractLocationFromText(e){if(!e)return null;for(let t of[/(?:Location|Job Location|Based in|Work Location):\s*([A-Za-z\s]+(?:,\s*[A-Z]{2})?)/i,/(?:Location|Job Location):\s*([A-Za-z\s]+,\s*[A-Za-z\s]+)/i]){let n=e.match(t);if(n&&n[1]){let e=n[1].trim();if(e=e.replace(/\s+(?:or\s+Remote|Remote).*$/i,``).trim(),e.length>2&&e.length<60)return e}}return null}extractWorkModelFromText(e){if(!e)return null;let t=e.toLowerCase();return t.includes(`remote`)||t.includes(`telecommute`)||t.includes(`work from home`)||t.includes(`wfh`)?`Remote`:t.includes(`hybrid`)?`Hybrid`:t.includes(`onsite`)||t.includes(`on-site`)||t.includes(`in-office`)||t.includes(`in office`)?`Onsite`:null}extractFromJSONLD(e){console.log(`[${e} Extractor] 🔍 Querying schema.org JSON-LD...`);let t=[];return document.querySelectorAll(`script[type="application/ld+json"]`).forEach(n=>{try{let r=JSON.parse(n.textContent??``);(Array.isArray(r)?r:[r]).forEach(n=>{if(!n)return;let r=n[`@type`];if(r===`JobPosting`||typeof r==`string`&&r.endsWith(`JobPosting`)){let r=n.description||``,i=this.htmlToText(r),a=this.parseSalaryFromJSONLD(n),o=this.parseLocationFromJSONLD(n),s=this.parseWorkModelFromJSONLD(n)||this.extractWorkModelFromText(i)||this.extractWorkModelFromText(o),c=this.cleanDirectUrl(n.directApplyUrl||n.applyUrl||n.url||null);t.push({title:this.cleanStr(n.title),company:this.cleanStr(n.hiringOrganization?.name||n.hiringOrganization?.legalName),link:this.cleanDirectUrl(n.url)||window.location.href,description:this.cleanStr(i),applyUrl:c||this.findDirectApplyUrl()||window.location.href,source:`json-ld`,platform:e,salary:a,location:o,workModel:s})}})}catch(t){console.warn(`[${e} Extractor] JSON-LD parse error:`,t)}}),console.log(`[${e} Extractor] JSON-LD extraction found ${t.length} job(s)`),t}extractFromNextData(e){console.log(`[${e} Extractor] 🔍 Querying Next.js __NEXT_DATA__...`);try{let t=document.getElementById(`__NEXT_DATA__`);if(!t)return[];let n=JSON.parse(t.textContent??`{}`);if(e===`JobRight`||e===`Generic`){let t=n?.props?.pageProps?.dataSource;if(t&&t.jobResult){let n=t.jobResult,r=t.companyResult||{};console.log(`[${e} Extractor] Found JobRight structured NextProps!`);let i=n.jobTitle||n.jobNlpTitle||``,a=r.companyName||n.companyName||``,o=n.jobSummary||``;n.coreResponsibilities&&n.coreResponsibilities.length>0&&(o+=`

Core Responsibilities:
`+n.coreResponsibilities.map(e=>`• ${e}`).join(`
`)),n.qualifications?.mustHave&&n.qualifications.mustHave.length>0&&(o+=`

Qualifications (Must Have):
`+n.qualifications.mustHave.map(e=>`• ${e}`).join(`
`)),n.qualifications?.preferredHave&&n.qualifications.preferredHave.length>0&&(o+=`

Qualifications (Preferred):
`+n.qualifications.preferredHave.map(e=>`• ${e}`).join(`
`)),n.benefitsSummaries&&n.benefitsSummaries.length>0&&(o+=`

Benefits:
`+n.benefitsSummaries.map(e=>`• ${e}`).join(`
`));let s=n.jobLocation||null,c=n.salaryDesc||n.salary||null,l=n.workModel||(n.isRemote?`Remote`:null),u=[n.applyUrl,n.apply_url,n.applicationUrl,n.application_url,n.sourceUrl,n.source_url,n.externalUrl,n.external_url,n.originalUrl,n.original_url,n.jobUrl,n.job_url,n.applyLink,n.apply_link,n.jobPostUrl,n.url,n.link,t.applyUrl,t.apply_url,t.sourceUrl,t.source_url,t.externalUrl,t.external_url,t.originalUrl,t.original_url,t.jobUrl,t.job_url],d=null;for(let e of u)if(typeof e==`string`&&e.trim().startsWith(`http`)&&!this.isRootHomepage(e)){d=this.cleanDirectUrl(e);break}return(!d||this.isRootHomepage(d))&&(d=this.findDirectApplyUrl(document)),(!d||this.isRootHomepage(d))&&(d=window.location.href),[{title:this.cleanStr(i),company:this.cleanStr(a),link:window.location.href,description:this.cleanStr(o),applyUrl:this.cleanDirectUrl(d)||window.location.href,source:`json-ld`,platform:e,salary:this.cleanStr(c),location:this.cleanStr(s),workModel:this.cleanStr(l)}]}}let r=(e,t=new Set)=>{if(!e||typeof e!=`object`||t.has(e))return null;t.add(e);let n=e.title||e.jobTitle||e.job_title,i=e.description||e.jobDescription||e.job_description,a=e.company||e.companyName||e.company_name||e.employer;if(n&&i&&a&&typeof i==`string`&&i.length>100)return e;for(let n of Object.keys(e))if(!(n===`parent`||n===`_reactInternalFiber`||n.startsWith(`_`)))try{let i=r(e[n],t);if(i)return i}catch{}return null},i=r(n);if(i){console.log(`[${e} Extractor] Found job object in Next.js props:`,i);let t=i.title||i.jobTitle||i.job_title,n=``;n=typeof i.company==`object`&&i.company!==null?i.company.name||i.company.title||``:i.company||i.companyName||i.company_name||i.employer||``;let r=i.description||i.jobDescription||i.job_description||``,a=r.includes(`<`)?this.htmlToText(r):r,o=i.applyUrl||i.apply_url||i.sourceUrl||i.source_url||i.externalUrl||i.url||this.findDirectApplyUrl()||null,s=i.salary||i.salaryRange||i.compensation||null,c=i.location||i.jobLocation||i.city||null,l=i.workModel||i.work_model||i.remoteType||this.extractWorkModelFromText(a);return[{title:this.cleanStr(t),company:this.cleanStr(n),link:window.location.href,description:this.cleanStr(a),applyUrl:this.cleanDirectUrl(o),source:`json-ld`,platform:e,salary:this.cleanStr(s),location:this.cleanStr(c),workModel:this.cleanStr(l)}]}}catch(t){console.warn(`[${e} Extractor] Error parsing __NEXT_DATA__:`,t)}return[]}waitForElement(e,t=8e3,n=300){return new Promise(r=>{let i=Date.now(),a=()=>{let o=document.querySelector(e);if(o){r(o);return}if(Date.now()-i>=t){r(null);return}setTimeout(a,n)};a()})}},t=class extends e{match(e){return e.includes(`linkedin.com`)}async extract(e){console.log(`[LI Extractor] 🚀 Extraction started on:`,window.location.href);let t=await this.extractFromActivePage(e);if(t)return console.log(`[LI Extractor] ✅ Extracted job from DOM details pane:`,t),[t];let n=this.extractFromJSONLD(`LinkedIn`);return n.length>0?n:[]}async extractFromActivePage(e){let t=this.findActiveDetailsPane();console.log(`[LI Extractor] Active details pane found:`,!!t);let{title:n,company:r}=this.getTitleAndCompany(t);if(console.log(`[LI Extractor] Title: "${n}" | Company: "${r}"`),!n&&!r)return console.warn(`[LI Extractor] ❌ No title or company found`),null;let i=this.extractJobId(t),a=i?`https://www.linkedin.com/jobs/view/${i}/`:window.location.href,o=await this.extractDescription(t),s=(e?.applyUrl?this.cleanDirectUrl(e.applyUrl):null)||await this.extractRealApplyUrl(t)||a,c=this.extractSalaryFromDOM(t||document),l=this.extractLocation(t),u=this.extractWorkModelFromText(o)||this.extractWorkModelFromText(l)||this.extractWorkModelFromText(t?t.innerText:document.body.innerText);return{title:n,company:r,link:a,description:o,applyUrl:this.cleanDirectUrl(s),source:`detail-page`,platform:`LinkedIn`,salary:c,location:l,workModel:u}}findActiveDetailsPane(){for(let e of[`.jobs-search__job-details`,`.jobs-search-two-pane__details`,`.jobs-details__main-content`,`.job-view-layout`,`.job-details-jobs-unified-top-card`,`.jobs-details`,`#job-details`,`main`]){let t=document.querySelector(e);if(t&&t.textContent&&t.textContent.trim().length>100)return t}return document}extractJobId(e){try{let e=new URL(window.location.href),t=e.searchParams.get(`currentJobId`)||e.searchParams.get(`jobId`);if(t&&/^\d+$/.test(t))return t}catch{}let t=window.location.pathname.match(/\/jobs\/view\/(\d+)/);if(t&&t[1])return t[1];let n=document.querySelector(`li.jobs-search-results__list-item--active, [data-occludable-job-id], .job-card-container--clickable`);if(n){let e=n.getAttribute(`data-occludable-job-id`)||n.getAttribute(`data-job-id`)||n.getAttribute(`data-entity-urn`)?.split(`:`).pop();if(e&&/^\d+$/.test(e))return e}let r=e.querySelector(`[data-job-id]`);if(r){let e=r.getAttribute(`data-job-id`);if(e&&/^\d+$/.test(e))return e}return null}getTitleAndCompany(e){let t=[`h1.job-details-jobs-unified-top-card__job-title`,`.job-details-jobs-unified-top-card__job-title h1`,`.jobs-unified-top-card__job-title h1`,`.job-details-jobs-unified-top-card__job-title a`,`.jobs-unified-top-card__job-title a`,`h1.t-24`,`.jobs-details__main-content h1`,`.jobs-description__title`,`h1`],n=[`.job-details-jobs-unified-top-card__company-name a`,`.job-details-jobs-unified-top-card__company-name`,`.jobs-unified-top-card__company-name a`,`.jobs-unified-top-card__company-name`,`.job-details-jobs-unified-top-card__primary-description-container a`,`.jobs-details__main-content a[href*="/company/"]`,`a[href*="/company/"]`],r=this.getBySelectors(t,e),i=null;for(let t of n){let n=e.querySelector(t);if(n&&n.textContent){let e=this.cleanStr(n.textContent);if(e&&!/^(see all|follow|visit|view|about the company)/i.test(e)){i=e;break}}}if(i||=this.findCompanyName(e,r),!i){let e=document.querySelector(`li.jobs-search-results__list-item--active`);if(e){let t=e.querySelector(`.artdeco-entity-lockup__subtitle, .job-card-container__primary-description`);t&&t.textContent&&(i=this.cleanStr(t.textContent))}}let a=r;if(!a&&document.title){let e=document.title.split(` | `)[0]?.trim();e&&e.length>2&&!/^linkedin$/i.test(e)&&(a=e)}return{title:a,company:i}}extractLocation(e){for(let t of[`.job-details-jobs-unified-top-card__bullet`,`.job-details-jobs-unified-top-card__primary-description-container span`,`.jobs-unified-top-card__bullet`,`.jobs-unified-top-card__workplace-type`]){let n=Array.from(e.querySelectorAll(t));for(let e of n){let t=this.cleanStr(e.textContent);if(t&&t.length>2&&!t.includes(`ago`)&&!t.includes(`applicant`)&&!t.includes(`repost`))return t}}return this.extractLocationFromDOM(e)}async extractDescription(e){console.log(`[LI Extractor] 🔍 Extracting description...`);let t=this.getBySelectors([`#job-details`,`.jobs-description__content`,`.jobs-description`,`.jobs-box__html-content`,`.description__text`],e);if(t){let e=t.replace(/^About the job\s*/i,``).trim();return console.log(`[LI Extractor] ✅ Description found via selectors (${e.length} chars)`),e}let n=await this.waitForAboutTheJobH2();if(n){let e=n.parentElement?.parentElement;if(e){let t=(e.textContent?.trim()??``).replace(`About the job`,``).replace(/\s+/g,` `).trim();if(t.length>50)return t}}return null}async extractRealApplyUrl(e){console.log(`[LI Extractor] 🔍 Searching for direct ATS Apply link...`);let t=this.findDirectApplyUrl(e);if(t)return t;let n=e.querySelector(`a[href*="safety/go"]`)||document.querySelector(`a[href*="safety/go"]`);if(n)try{let e=new URL(n.href).searchParams.get(`url`);if(e){let t=decodeURIComponent(e);return console.log(`[LI Extractor] ✅ Real external apply URL decoded:`,t),t}}catch(e){console.warn(`[LI Extractor] ⚠️ Failed to parse Apply URL:`,e)}let r=Array.from(e.querySelectorAll(`a.jobs-apply-button, a[data-control-name="jobdetails_topcard_inapply"]`));for(let e of r)if(e.href&&!e.href.startsWith(`javascript:`)&&!e.href.includes(`linkedin.com/jobs/view`))return e.href;return null}async waitForAboutTheJobH2(e=2e3,t=200){return new Promise(n=>{let r=Date.now(),i=()=>{let a=Array.from(document.querySelectorAll(`h2`)).find(e=>(e.textContent??``).trim()===`About the job`);if(a){n(a);return}if(Date.now()-r>=e){n(null);return}setTimeout(i,t)};i()})}},n=class extends e{match(e){return e.includes(`jobright.ai`)}async extract(e){console.log(`[JobRight Extractor] 🚀 Extracting job details on:`,window.location.href);let t=e||await this.extractFromMainWorld();t&&console.log(`[JobRight Extractor] Main world data received:`,t);let n=t?.directLink||window.location.href,r=this.extractFromNextData(`JobRight`);if(r.length>0){console.log(`[JobRight Extractor] ✅ Extraction successful via Next.js props:`,r);let e=r[0],i=t?.applyUrl;return(!i||this.isRootHomepage(i))&&(i=this.findDirectApplyUrl(document)),(!i||this.isRootHomepage(i))&&(i=e.applyUrl&&!this.isRootHomepage(e.applyUrl)?e.applyUrl:null),i=this.cleanDirectUrl(i)||n,[{...e,applyUrl:i,link:n}]}let i=this.extractFromReactFiber(document.querySelector(`main, article, [role='main']`)||document.body);if(i&&i.title&&(i.company||i.applyUrl||i.description)){console.log(`[JobRight Extractor] ✅ Extracted job via React Fiber:`,i);let e=this.cleanDirectUrl(t?.applyUrl||i.applyUrl);return(!e||this.isRootHomepage(e))&&(e=this.findDirectApplyUrl(document)||n),[{title:this.cleanStr(i.title),company:this.cleanStr(i.company)||this.findCompanyName(document,i.title),link:n,description:this.cleanStr(i.description)||this.extractDescriptionFromDOM(),applyUrl:e,source:`detail-page`,platform:`JobRight`,salary:i.salary||this.extractSalaryFromDOM(),location:i.location||this.extractLocationFromDOM(),workModel:i.workModel||this.extractWorkModelFromText(i.description)}]}let a=this.extractFromJSONLD(`JobRight`),o=await this.extractFromDOM(t);if(o){if(a.length>0){let e=a[0];return!e.company&&o.company&&(e.company=o.company),(!e.applyUrl||this.isRootHomepage(e.applyUrl))&&o.applyUrl&&(e.applyUrl=o.applyUrl),!e.title&&o.title&&(e.title=o.title),a}return[o]}return a}async extractFromDOM(e){let t=this.getBySelectors([`h1`,`[class*="job-title" i]`,`[class*="JobTitle" i]`,`[class*="jobTitle" i]`,`h2`])||(document.title?document.title.split(`|`)[0]?.trim():null),n=this.findCompanyName(document,t);if(!t&&!n)return null;let r=this.extractDescriptionFromDOM(),i=this.extractSalaryFromDOM(),a=this.extractLocationFromDOM(),o=this.extractWorkModelFromText(r)||this.extractWorkModelFromText(a)||this.extractWorkModelFromText(document.body.innerText),s=e?.directLink||window.location.href,c=e?.applyUrl?this.cleanDirectUrl(e.applyUrl):null;return(!c||this.isRootHomepage(c))&&(c=this.findDirectApplyUrl(document)),(!c||this.isRootHomepage(c))&&(c=s),{title:t,company:n||`Unknown Company`,link:s,description:r,applyUrl:this.cleanDirectUrl(c),source:`detail-page`,platform:`JobRight`,salary:i,location:a,workModel:o}}extractDescriptionFromDOM(){let e=null;for(let t of[`[class*='JobDetail_jobDescription' i]`,`[class*='jobDescription' i]`,`[class*='description' i]`,`#job-description`,`.job-description`,`[itemprop='description']`]){let n=document.querySelector(t);if(n&&n.textContent&&n.textContent.trim().length>150){e=this.htmlToText(n.innerHTML);break}}if(!e){let t=null;document.querySelectorAll(`div, section, article`).forEach(e=>{let n=e.textContent?.trim().length??0;n>300&&n<25e3&&(!t||n>t.len)&&(t={el:e,len:n})}),t&&(e=this.htmlToText(t.el.innerHTML))}return e}},r=class extends e{match(e){let t=e.toLowerCase();return t.includes(`hiringcafe.com`)||t.includes(`hiring.cafe`)}async extract(e){console.log(`[Hiring Cafe Extractor] 🚀 Extracting job details on:`,window.location.href);let t=this.findActiveJobContainer(),n=e||await this.extractFromMainWorld();n&&console.log(`[Hiring Cafe Extractor] Main world data received:`,n);let r=this.extractTitle(t)||this.cleanStr(n?.jobData?.title)||this.cleanStr(n?.jobData?.job_title),i=this.extractCompanyName(t,r,null,n);if(!r&&!i&&document.title){let e=document.title.split(/[|\-–·]/);r=e[0]?.trim()||null,e.length>1&&(i=e[1]?.trim()||null)}if(!r&&!i)return[];let a=this.findJobPermalink(t,r,i);(!a||a===window.location.href)&&n?.directLink&&this.matchesSlug(n.directLink,r,i)&&(a=n.directLink);let o=n?.applyUrl;o||=this.findDirectApplyUrl(t)||this.findDirectApplyUrl(document),o=this.cleanDirectUrl(o),o||=a;let s=null;if(window.location.pathname.startsWith(`/job/`)){let e=this.extractDescriptionFromNextData(document);e&&e.length>150&&(s=e)}if(s||=this.extractDescriptionFromDOM(t),!s&&n?.jobData?.description){let e=this.cleanStr(n.jobData.description);e&&e.length>100&&!e.toLowerCase().includes(`we couldn't load this job description`)&&(s=e)}let c=null;(!s||s.toLowerCase().includes(`we couldn't load this job description`)||s.includes(`Job InfoCompany Info`)||s.length<150)&&a&&a.includes(`/job/`)&&(c=await this.fetchFullJobPageData(a),c?.description&&c.description.length>150&&(console.log(`[Hiring Cafe Extractor] ✅ Loaded full pristine job description from dedicated page:`,a),s=c.description)),s&&(s.includes(`Job InfoCompany Info`)||s.includes(`We couldn't load this job description`))&&(s=this.cleanDrawerDescription(s)),i||=this.extractCompanyName(t,r,s,n);let l=this.cleanStr(n?.jobData?.salary)||this.cleanStr(n?.jobData?.compensation)||c?.salary||this.extractSalaryFromDOM(t),u=this.cleanStr(n?.jobData?.location)||this.cleanStr(n?.jobData?.job_location)||c?.location||this.extractLocationFromDOM(t)||this.extractLocationFromText(s)||this.extractLocationFromText(t.innerText||document.body.innerText)||this.extractLocationFromSlug(a),d=this.cleanStr(n?.jobData?.workModel)||this.cleanStr(n?.jobData?.workplace_type)||c?.workModel||this.extractWorkModelFromText(s)||this.extractWorkModelFromText(u)||this.extractWorkModelFromText(t.innerText||document.body.innerText);return[{title:r,company:i||`Unknown Company`,link:a,description:s,applyUrl:o,source:`detail-page`,platform:`Hiring Cafe`,salary:l,location:u,workModel:d}]}extractCompanyName(e,t,n,r){let i=this.cleanStr(r?.jobData?.company_name||r?.jobData?.companyName||(typeof r?.jobData?.company==`object`?r?.jobData?.company?.name:r?.jobData?.company)||r?.jobData?.employer||r?.jobData?.org_name||r?.jobData?.organization);if(i&&!i.toLowerCase().includes(`hiring cafe`)){let e=this.cleanCompanyName(i);if(this.isValidCompanyName(e,t))return console.log(`[Hiring Cafe Extractor] ✅ Company found via React Fiber props:`,e),e}let a=(e instanceof Element?e:null)||document.querySelector(`[class*="border-black"], [class*="selected"], [class*="active"], article`);if(a){let e=this.extractFromReactFiber(a);if(e?.company&&!e.company.toLowerCase().includes(`hiring cafe`)){let n=this.cleanCompanyName(e.company);if(this.isValidCompanyName(n,t))return console.log(`[Hiring Cafe Extractor] ✅ Company found via container fiber:`,n),n}}let o=Array.from(e.querySelectorAll(`a[href*="/org/"], a[href*="hiringcafe.com/org/"]`));for(let e of o){let n=e.parentElement;if(n){let r=Array.from(n.querySelectorAll(`span, div, h2, h3, strong, b, p`)).filter(t=>t!==e&&!e.contains(t)&&t.children.length===0);for(let e of r){let n=this.cleanCompanyName(e.textContent);if(n&&this.isValidCompanyName(n,t))return console.log(`[Hiring Cafe Extractor] ✅ Company found via /org/ sibling element:`,n),n}let i=this.cleanCompanyName(n.textContent);if(i&&this.isValidCompanyName(i,t))return console.log(`[Hiring Cafe Extractor] ✅ Company found via /org/ parent container text:`,i),i}}let s=Array.from(e.querySelectorAll(`img[alt], img[title]`));for(let e of s){let n=e.getAttribute(`alt`)||e.getAttribute(`title`);if(n){let e=this.cleanCompanyName(n.replace(/\b(logo|icon|avatar|company logo)\b/gi,``));if(e&&this.isValidCompanyName(e,t))return console.log(`[Hiring Cafe Extractor] ✅ Company found via logo alt:`,e),e}}let c=e.querySelector(`h1, h2`);if(c&&c.parentElement){let e=Array.from(c.parentElement.querySelectorAll(`span, div, p, a, h3`)).filter(e=>e!==c&&!c.contains(e)&&e.children.length===0);for(let n of e){let e=this.cleanCompanyName(n.textContent);if(e&&this.isValidCompanyName(e,t))return console.log(`[Hiring Cafe Extractor] ✅ Company found via title subtitle/sibling:`,e),e}}let l=this.findCompanyName(e,t,n);if(l)return console.log(`[Hiring Cafe Extractor] ✅ Company found via BaseExtractor heuristics:`,l),l;let u=Array.from(e.querySelectorAll(`a[href*="/job/"]`));for(let e of u){let n=this.extractCompanyFromJobUrl(e.href,t);if(n)return console.log(`[Hiring Cafe Extractor] ✅ Company found via Job Posting slug:`,n),n}if(window.location.pathname.startsWith(`/job/`)){let e=this.extractCompanyFromJobUrl(window.location.href,t);if(e)return console.log(`[Hiring Cafe Extractor] ✅ Company found via pathname slug:`,e),e}return null}extractCompanyFromJobUrl(e,t){try{let n=new URL(e,window.location.href).pathname.split(`/`).filter(Boolean),r=n.indexOf(`job`);if(r===-1||!n[r+1])return null;let i=decodeURIComponent(n[r+1]).split(`-`);if(i.length<3)return null;/^[a-z0-9]{8,}$/i.test(i[i.length-1])&&i.pop();let a=i;if(t){let e=t.toLowerCase().replace(/[^a-z0-9]+/g,` `).split(/\s+/).filter(e=>e.length>1),n=0;for(let t=0;t<Math.min(e.length,a.length)&&(a[t].toLowerCase()===e[t].toLowerCase()||e.includes(a[t].toLowerCase()));t++)n++;n>0&&(a=a.slice(n))}let o=`united.states.remote.us.uk.canada.austin.texas.california.new.york.georgia.atlanta.chicago.illinois.seattle.washington.london.toronto.san.francisco.los.angeles.alabama.tennessee.madison.oak.ridge.houston`.split(`.`);for(;a.length>1&&o.includes(a[a.length-1].toLowerCase());)a.pop();if(a.length>0){let e=a.join(` `).trim().replace(/\b\w/g,e=>e.toUpperCase());if(this.isValidCompanyName(e,t))return e}}catch{}return null}findActiveJobContainer(){for(let e of[`[role="dialog"]`,`[aria-modal="true"]`,`div[class*="drawer" i]`,`div[class*="modal" i]`,`div[class*="sheet" i]`,`div[class*="job-detail" i]`,`div[class*="jobDetail" i]`,`div.fixed`,`article`]){let t=document.querySelector(e);if(t&&t.textContent&&t.textContent.trim().length>150){if(e===`article`){let e=t.closest(`[role="dialog"], [aria-modal="true"], div.fixed, div[class*="drawer" i], div[class*="modal" i]`);if(e)return e}return t}}return document}extractTitle(e){return this.getBySelectors([`h1`,`h2[class*="title" i]`,`h2[class*="job" i]`,`[class*="JobTitle" i]`,`[class*="jobTitle" i]`,`[class*="job-title" i]`,`h2`],e)}findJobPermalink(e,t,n){if(window.location.pathname.startsWith(`/job/`))return window.location.href;let r=Array.from(e.querySelectorAll(`a[href*="/job/"]`));if(r.length>0){for(let e of r)if(this.matchesSlug(e.href,t,n))return e.href;let e=r.find(e=>(e.textContent||``).toLowerCase().includes(`job posting`));return e?e.href:r[0].href}let i=Array.from(document.querySelectorAll(`a[href*="/job/"]`));if(i.length>0&&(t||n)){let e=(t||``).toLowerCase().replace(/[^a-z0-9]+/g,` `).split(/\s+/).filter(e=>e.length>2),r=(n||``).toLowerCase().replace(/[^a-z0-9]+/g,` `).split(/\s+/).filter(e=>e.length>2),a=[...e,...r],o=null;for(let e of i){let t=e.href.toLowerCase(),n=0;for(let e of a)t.includes(e)&&n++;n>0&&(!o||n>o.score)&&(o={href:e.href,score:n})}if(o&&o.score>=1)return o.href}let a=document.querySelector(`[class*="border-black"], [class*="selected"], [class*="active"]`);if(a){let e=a.querySelector(`a[href*="/job/"]`);if(e)return e.href}let o=i.find(e=>(e.textContent||``).toLowerCase().includes(`job posting`));return o?o.href:i.length===1?i[0].href:window.location.href}matchesSlug(e,t,n){if(!e)return!1;let r=e.toLowerCase(),i=[...(t||``).toLowerCase().split(/\s+/),...(n||``).toLowerCase().split(/\s+/)].filter(e=>e.length>2);return i.length!==0&&i.filter(e=>r.includes(e)).length>=Math.min(2,i.length)}extractDescriptionFromDOM(e){for(let t of[`[data-testid*='job-description' i]`,`[class*='job-description' i]`,`[class*='jobDescription' i]`,`[class*='descriptionText' i]`,`[class*='prose' i]`,`[class*='description' i]`,`[class*='job-details' i]`,`[class*='jobDetails' i]`,`#description`,`[itemprop='description']`,`article`]){let n=e.querySelector(t);if(n&&n.textContent&&n.textContent.trim().length>150&&!n.textContent.trim().toLowerCase().includes(`we couldn't load this job description`))return this.htmlToText(n.innerHTML)}let t=null;return e.querySelectorAll(`div, section, article`).forEach(e=>{let n=e.textContent?.trim()||``,r=n.length;r>300&&r<25e3&&!n.toLowerCase().includes(`we couldn't load this job description`)&&(!t||r>t.len)&&(t={el:e,len:r})}),t?this.htmlToText(t.el.innerHTML):null}async fetchFullJobPageData(e){if(!e||!e.includes(`/job/`))return null;try{console.log(`[Hiring Cafe Extractor] 🔄 Fetching dedicated job details page for full description:`,e);let t=new AbortController,n=setTimeout(()=>t.abort(),4e3),r=await fetch(e,{signal:t.signal,headers:{Accept:`text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8`}});if(clearTimeout(n),!r.ok)return console.warn(`[Hiring Cafe Extractor] Dedicated job page fetch returned status:`,r.status),null;let i=await r.text(),a=null,o=null,s=null;a=this.extractDescriptionFromNextData(i);try{let e=new DOMParser().parseFromString(i,`text/html`);if(!a){let t=this.extractDescriptionFromDOM(e);t&&t.length>150&&!t.toLowerCase().includes(`we couldn't load this job description`)&&(a=t)}o||=this.extractLocationFromDOM(e),s||=this.extractSalaryFromDOM(e)}catch(e){console.warn(`[Hiring Cafe Extractor] Error parsing DOM from fetched page:`,e)}if(a||o||s)return{description:a,location:o,salary:s,workModel:null}}catch(e){console.warn(`[Hiring Cafe Extractor] Failed to fetch full job page details:`,e)}return null}extractDescriptionFromNextData(e){try{let t=null;if(typeof e==`string`){let n=e.match(/<script\s+id="__NEXT_DATA__"\s+type="application\/json">([\s\S]*?)<\/script>/i);n&&n[1]&&(t=n[1])}else{let n=e.querySelector(`#__NEXT_DATA__`);n&&n.textContent&&(t=n.textContent)}if(!t)return null;let n=JSON.parse(t),r=(e,t=0)=>{if(!e||typeof e!=`object`||t>8)return null;for(let t of[`description`,`job_description`,`jobDescription`,`description_html`,`job_description_html`,`raw_description`,`full_description`,`details`])if(typeof e[t]==`string`&&e[t].trim().length>100){let n=e[t].trim();if(!n.toLowerCase().includes(`we couldn't load this job description`))return n}for(let n of Object.keys(e))if(!(n.startsWith(`_`)||n===`router`))try{let i=r(e[n],t+1);if(i)return i}catch{}return null},i=r(n?.props?.pageProps||n);if(i)return this.htmlToText(i)}catch{}return null}cleanDrawerDescription(e){if(!e)return null;let t=e;return t=t.replace(/^(?:Job Info|Company Info|Job Description)[\s\S]*?(?:Posted \d+[a-z]+ ago|\n\n)/i,``),t=t.replace(/@\s*[^\n]+?(?:View All Jobs|Website)[\s\S]*?(?:Remote|Full Time|Part Time|Contract|\n\n)/i,``),t=t.replace(/Signals\s*See how many viewed or applied/gi,``),t=t.replace(/(?:Apply now|Save|Mark Applied|Hide Job|Report & Hide)[\s\S]*?(?:Report & Hide|\n\n)/gi,``),t=t.replace(/\b(?:Apply now|Save|Mark Applied|Hide Job|Report & Hide)\b/gi,``),t=t.replace(/Job Description\s*Copy Job Description[\s\S]*$/gi,``),t=t.replace(/We couldn't load this job description\.?/gi,``),t=t.replace(/Copy Job Description/gi,``),t=t.replace(/\n{3,}/g,`

`).trim(),t.length>50?t:null}extractLocationFromSlug(e){try{let t=new URL(e,window.location.href).pathname.split(`/`).filter(Boolean),n=t.indexOf(`job`);if(n===-1||!t[n+1])return null;let r=decodeURIComponent(t[n+1]).split(`-`);if(r.length<3)return null;/^[a-z0-9]{8,}$/i.test(r[r.length-1])&&r.pop();let i=`united states.remote.us.uk.canada.texas.california.georgia.new york.florida.washington.illinois.massachusetts.virginia.north carolina.colorado.pennsylvania.ohio.michigan.arizona.austin.atlanta.chicago.seattle.san francisco.los angeles.dallas.boston.denver.houston.san diego.orlando`.split(`.`),a=r.join(` `).toLowerCase();for(let e of i)if(a.endsWith(e)||a.includes(` `+e+` `))return e.replace(/\b\w/g,e=>e.toUpperCase())}catch{}return null}},i=class extends e{match(e){return e.includes(`ziprecruiter.com`)}async extract(e){console.log(`[ZipRecruiter Extractor] 🚀 Extracting job details on:`,window.location.href);let t=e||await this.extractFromMainWorld(),n=this.findActiveDetailsPane(),r=t?.directLink||window.location.href,i=this.extractFromReactFiber(n instanceof Element?n:document.body)||this.extractFromReactFiber(document.querySelector(`[class*="jobDetails" i], [class*="job_details" i], article, section, [role="main"]`));if(i&&i.title&&(i.company||i.applyUrl||i.description)){let e=String(i.title).toLowerCase().trim();if(!document.title||document.title.toLowerCase().includes(e)||i.description&&i.description.toLowerCase().includes(e)){console.log(`[ZipRecruiter Extractor] ✅ Extracted job via React Fiber:`,i);let e=this.cleanStr(i.title),a=e;if(document.title){let t=document.title.match(/^(.*?)\s+(?:jobs?\s+in\b|at\s+ZipRecruiter\b|\|\s*Ziprecruiter\b)/i),n=t?t[1].trim():document.title.split(/[|·]/)[0].trim();n=n.replace(/\s+at\s+ZipRecruiter.*$/i,``).replace(/\s+-\s+ZipRecruiter.*$/i,``).replace(/\s*\|\s*ZipRecruiter.*$/i,``).trim(),n&&n.length>(e?.length||0)&&!/^ziprecruiter$/i.test(n)&&(a=n)}let o=this.cleanDirectUrl(t?.applyUrl||i.applyUrl||this.findDirectApplyUrl(n)||this.findDirectApplyUrl(document)),s=this.cleanStr(i.description)||this.extractDescriptionFromDOM(n)||this.extractDescriptionFromDOM(document),c=null,l=Array.from(document.querySelectorAll(`a[href*="/co/"]`));for(let e of l){let t=this.cleanCompanyName(e.textContent);if(t&&this.isValidCompanyName(t,a)){c=t;break}if(e.href){let t=this.extractFromCompanyHref(e.href,a);if(t&&this.isValidCompanyName(t,a)){c=t;break}}}c||=this.findCompanyName(n,a,s)||this.findCompanyName(document,a,s)||this.cleanStr(i.company)||(s?this.extractCompanyFromDescription(s):null);let u=(s?this.extractLocationFromText(s):null)||i.location||this.extractLocationFromDOM(n)||this.extractLocationFromDOM(document);return[{title:a,company:c,link:r,description:s,applyUrl:o||r,source:`detail-page`,platform:`ZipRecruiter`,salary:i.salary||this.extractSalaryFromDOM(n)||this.extractSalaryFromDOM(document),location:u,workModel:i.workModel||this.extractWorkModelFromText(s)||this.extractWorkModelFromText(u)}]}}let a=this.extractFromJSONLD(`ZipRecruiter`),o=await this.extractFromDOM(n,t);if(o){if(a.length>0){let e=a[0];return!e.company&&o.company&&(e.company=o.company),!e.applyUrl&&o.applyUrl&&(e.applyUrl=o.applyUrl),!e.title&&o.title&&(e.title=o.title),!e.location&&o.location&&(e.location=o.location),!e.salary&&o.salary&&(e.salary=o.salary),!e.workModel&&o.workModel&&(e.workModel=o.workModel),a}return[o]}return a}findActiveDetailsPane(){for(let e of[`[class*="job_details" i]`,`[class*="jobDetails" i]`,`[class*="details_pane" i]`,`[class*="detailsPane" i]`,`[data-testid*="job-details" i]`,`#job-details`,`.job-details`,`.details-panel`,`.job-details-panel`,`article`,`section`,`[role="main"]`]){let t=document.querySelectorAll(e);for(let e of Array.from(t))if(e.querySelector(`.jobdescription, .jobDescriptionText, .job_description, .job-description, .jobDescriptionSection, [class*="jobDescription" i]`))return e}return document}async extractFromDOM(e,t){let n=this.extractDescriptionFromDOM(e)||this.extractDescriptionFromDOM(document),r=t?.directLink||window.location.href,i=(t?.applyUrl?this.cleanDirectUrl(t.applyUrl):null)||this.findDirectApplyUrl(e)||this.findDirectApplyUrl(document);if(i&&=this.cleanDirectUrl(i),!i||i.includes(`ziprecruiter.com`)){let e=Array.from(document.querySelectorAll(`a[href*="job-redirect"]`));for(let t of e)if(t.href){let e=this.cleanDirectUrl(t.href);if(e&&!e.includes(`ziprecruiter.com`)&&!this.isRootHomepage(e)){i=e;break}}}if(!i||i.includes(`ziprecruiter.com`))try{let e=document.documentElement.innerHTML.match(/aHR0cHM6Ly9[A-Za-z0-9+/=%_-]+/g);if(e)for(let t of e)try{let e=decodeURIComponent(t);for(;e.length%4!=0;)e+=`=`;let n=atob(e);if(n.startsWith(`http://`)||n.startsWith(`https://`)){let e=this.cleanDirectUrl(n);if(e&&!e.includes(`ziprecruiter.com`)&&!this.isRootHomepage(e)){i=e;break}}}catch{}}catch{}i&&i.includes(`ziprecruiter.com`)&&!i.includes(`job-redirect`)&&(i=null);let a=null;if(document.title){let e=document.title.match(/^(.*?)\s+(?:jobs?\s+in\b|at\s+ZipRecruiter\b|\|\s*Ziprecruiter\b)/i),t=e?e[1].trim():document.title.split(/[|·]/)[0].trim();t=t.replace(/\s+at\s+ZipRecruiter.*$/i,``).replace(/\s+-\s+ZipRecruiter.*$/i,``).replace(/\s*\|\s*ZipRecruiter.*$/i,``).trim(),t&&t.length>2&&!/^ziprecruiter$/i.test(t)&&(a=t)}let o=[`[data-testid="job-title"]`,`[data-testid="job-details-title"]`,`[data-testid*="jobTitle" i]`,`.job_title`,`h1.job_title`,`[class*="jobTitle" i]`,`[class*="job-title" i]`,`[class*="job_title" i]`,`h1`,`h2`],s=e=>{let t=e.toLowerCase().trim();return!t||t===`ziprecruiter`||t===`job description`||t===`similar jobs`||t===`job details`||t===`about the company`||t.startsWith(`search `)||t.startsWith(`sign in`)||t.startsWith(`create alert`)},c=null;if(a){let e=Array.from(document.querySelectorAll(o.join(`,`)));for(let t of e){let e=this.cleanStr(t.textContent);if(e&&!s(e)&&(e.toLowerCase()===a.toLowerCase()||a.toLowerCase().includes(e.toLowerCase())||e.toLowerCase().includes(a.toLowerCase()))){c=e;break}}c||=a}if(c||(c=this.getBySelectors(o,e)||(e===document?null:this.getBySelectors(o,document)),c&&s(c)&&(c=null)),!c&&t?.jobData?.title){let e=String(t.jobData.title).trim();(document.title.toLowerCase().includes(e.toLowerCase())||n&&n.toLowerCase().includes(e.toLowerCase()))&&(c=e)}if(!c&&n){let e=n.match(/(?:seeking|looking for|hiring)\s+(?:a|an)?\s*([A-Z][A-Za-z0-9\s/&–-]{3,50}?(?:Engineer|Developer|Manager|Analyst|Lead|Director|Specialist|Architect|Consultant|Scientist|Associate|Designer|Coordinator|Officer|Executive|Technician))/i);e&&e[1]&&(c=e[1].trim())}if(!c&&i){let e=i.match(/\/job\/([A-Za-z0-9\-_]+)/i)||i.match(/\/jobs\/([A-Za-z0-9\-_]+)/i)||i.match(/\/posting\/([A-Za-z0-9\-_]+)/i);if(e){let t=e[1].replace(/_REQ.*$/i,``).replace(/_JR.*$/i,``).replace(/[-_]+/g,` `).trim();t&&t.length>2&&t.length<80&&(c=t.replace(/\b\w/g,e=>e.toUpperCase()))}}let l=null,u=Array.from(document.querySelectorAll(`a[href*="/co/"]`));for(let e of u){let t=this.cleanCompanyName(e.textContent);if(t&&this.isValidCompanyName(t,c)){l=t;break}if(e.href){let t=this.extractFromCompanyHref(e.href,c);if(t&&this.isValidCompanyName(t,c)){l=t;break}}}if(l||=this.findCompanyName(e,c,n),!l&&e!==document&&(l=this.findCompanyName(document,c,n)),!l&&n&&(l=this.extractCompanyFromDescription(n)),!l&&i)try{let e=new URL(i);if(e.hostname.includes(`myworkdayjobs.com`)||e.hostname.includes(`greenhouse.io`)||e.hostname.includes(`lever.co`)||e.hostname.includes(`ashbyhq.com`)){let t=e.hostname.split(`.`)[0];t&&t.length>2&&(l=t.replace(/[-_]+/g,` `).replace(/\b\w/g,e=>e.toUpperCase()).trim())}}catch{}if(!l&&t?.jobData?.company){let e=typeof t.jobData.company==`object`?t.jobData.company.name||t.jobData.company.canonicalDisplayName||``:String(t.jobData.company),r=this.cleanCompanyName(e);r&&this.isValidCompanyName(r,c)&&(document.title.toLowerCase().includes(r.toLowerCase())||n&&n.toLowerCase().includes(r.toLowerCase()))&&(l=r)}if(!c&&!l)return null;let d=this.extractSalaryFromDOM(e)||this.extractSalaryFromDOM(document),f=null;if(n&&(f=this.extractLocationFromText(n)),!f&&e!==document&&(f=this.extractLocationFromDOM(e)),!f&&document.title){let e=document.title.match(/\bjob\s+in,\s*([^|@]+?)(?:\s+at\s+|\s*\||$)/i);if(e&&e[1]){let t=e[1].trim();t&&t.length>2&&t.length<60&&(f=t)}}f||=this.extractLocationFromDOM(document);let p=this.extractWorkModelFromText(n)||this.extractWorkModelFromText(f)||this.extractWorkModelFromText(e.innerText||document.body.innerText);return{title:c,company:l||`Unknown Company`,link:r,description:n,applyUrl:i||r,source:`detail-page`,platform:`ZipRecruiter`,salary:d,location:f,workModel:p}}extractDescriptionFromDOM(e){let t=null;for(let n of[`[itemprop="description"]`,`.jobdescription`,`.jobDescriptionText`,`.job_description`,`.job-description`,`[class*="jobDescriptionText" i]`,`[class*="jobDescription" i]`,`.jobDescriptionSection`]){let r=e.querySelector(n);if(r&&r.textContent&&r.textContent.trim().length>150){t=this.htmlToText(r.innerHTML);break}}if(!t){let n=null,r=e.querySelectorAll(`article, section, [role='main']`);(r.length>0?r:e.querySelectorAll(`div`)).forEach(e=>{let t=e.textContent?.trim().length??0;t>300&&t<15e3&&(!n||t>n.len)&&(n={el:e,len:t})}),n&&(t=this.htmlToText(n.el.innerHTML))}if(t){let e=t.search(/(?:Job\s+description|Job\s+Description|Job\s+Summary|About\s+the\s+Role)\b\s*[\r\n]+/i);if(e>50){let n=t.match(/(?:Job\s+description|Job\s+Description|Job\s+Summary|About\s+the\s+Role)/i);if(n){let r=e+n[0].length;t=t.substring(r).trim()}}let n=t.search(/[\r\n]+\s*(?:Report|What\s+.*?\s+employees\s+say|Powered\s+by\s+real\s+frontline\s+workers|Share\s+this\s+job|Copy\s+job\s+link|Share\s+job\s+on\s+Facebook)\b/i);n!==-1&&(t=t.substring(0,n).trim())}return t}},a=class extends e{match(e){return!0}async extract(e){console.log(`[Generic Extractor] 🚀 Running generic extraction on:`,window.location.href);let t=e?.directLink||window.location.href,n=this.extractFromReactFiber(document.querySelector(`main, article, [role='main']`)||document.body);if(n&&n.title&&(n.company||n.applyUrl||n.description)){console.log(`[Generic Extractor] ✅ Extracted job via React Fiber:`,n);let r=this.cleanDirectUrl(e?.applyUrl||n.applyUrl||this.findDirectApplyUrl());return[{title:this.cleanStr(n.title),company:this.cleanStr(n.company)||this.findCompanyName(document,n.title),link:t,description:this.cleanStr(n.description)||this.findDescriptionFromDOM(),applyUrl:r||t,source:`detail-page`,platform:`Generic`,salary:n.salary||this.extractSalaryFromDOM(),location:n.location||this.extractLocationFromDOM(),workModel:n.workModel||this.extractWorkModelFromText(n.description)}]}let r=this.extractFromNextData(`Generic`);if(r.length>0)return console.log(`[Generic Extractor] ✅ Found job via Next.js state data:`,r),r;let i=this.extractFromJSONLD(`Generic`);if(i.length>0){console.log(`[Generic Extractor] Found ${i.length} job(s) via JSON-LD`);for(let e of i)e.company||=this.findCompanyName(document,e.title),(!e.applyUrl||e.applyUrl===window.location.href)&&(e.applyUrl=this.findDirectApplyUrl()||e.applyUrl),e.salary||=this.extractSalaryFromDOM(),e.location||=this.extractLocationFromDOM(),e.workModel||=this.extractWorkModelFromText(e.description)||this.extractWorkModelFromText(e.location)||this.extractWorkModelFromText(document.body.innerText);return i}console.log(`[Generic Extractor] 📌 JSON-LD failed, falling back to Meta tags & Heuristics`);let a=await this.extractFromDOM(e);return a?[a]:[]}async extractFromDOM(e){let t=null,n=document.querySelector(`meta[property="og:title"]`)||document.querySelector(`meta[name="twitter:title"]`);if(n&&(t=n.getAttribute(`content`)),!t){let e=Array.from(document.querySelectorAll(`h1`)).find(e=>e.textContent?.trim()&&e.textContent.trim().length>3&&e.getBoundingClientRect().height>0);e&&(t=e.textContent.trim())}!t&&document.title&&(t=document.title.split(/[|\-·]/)[0]?.trim()||document.title.trim());let r=this.findCompanyName(document,t);if(!t&&!r)return null;let i=this.findDescriptionFromDOM(),a=this.extractSalaryFromDOM(),o=this.extractLocationFromDOM(),s=this.extractWorkModelFromText(i)||this.extractWorkModelFromText(o)||this.extractWorkModelFromText(document.body.innerText),c=e?.directLink||window.location.href,l=(e?.applyUrl?this.cleanDirectUrl(e.applyUrl):null)||this.findDirectApplyUrl()||c;return{title:t||`Unknown Title`,company:r||`Unknown Company`,link:c,description:i||`No job description found.`,applyUrl:this.cleanDirectUrl(l),source:`detail-page`,platform:`Generic`,salary:a,location:o,workModel:s}}findDescriptionFromDOM(){let e=null,t=document.querySelector(`meta[property="og:description"]`)||document.querySelector(`meta[name="description"]`);t&&(e=t.getAttribute(`content`));for(let t of[`[itemprop='description']`,`#job-description`,`#jobDescription`,`.job-description`,`.jobDescription`,`#description`,`.description`,`#job-details`,`.job-details`,`.job-body`,`[class*='JobDescription']`,`[class*='jobDescription']`,`[class*='description']`]){let n=document.querySelector(t);if(n&&n.textContent&&n.textContent.trim().length>150){e=this.htmlToText(n.innerHTML);break}}if(!e||e.length<100){let t=null;document.querySelectorAll(`div, section, article`).forEach(e=>{let n=(e.textContent?.trim()||``).length;n>300&&n<25e3&&![`BODY`,`HTML`,`HEADER`,`FOOTER`,`NAV`].includes(e.tagName)&&(!t||n>t.len)&&(t={el:e,len:n})}),t&&(e=this.htmlToText(t.el.innerHTML))}return e}},o=[new t,new n,new r,new i],s=new a;function c(e){for(let t of o)if(t.match(e))return t;return s}console.log(`[Job Extractor] 🟢 Content script injected on:`,window.location.href);var l=!1,u=null;async function d(e){try{return await navigator.clipboard.writeText(e),!0}catch{try{let t=document.createElement(`textarea`);t.value=e,t.style.position=`fixed`,t.style.top=`0`,t.style.left=`0`,t.style.opacity=`0`,document.body.appendChild(t),t.focus(),t.select();let n=document.execCommand(`copy`);return document.body.removeChild(t),n}catch{return!1}}}async function f(){if(!l){l=!0,y(`extracting`);try{let e=c(window.location.href);console.log(`[Job Extractor Floating] Running extractor: ${e.constructor.name}`);let t=await e.extract();if(!t||t.length===0){b(`❌ No job detected`,`Make sure you are on a job details section.`,`error`),y(`idle`),l=!1;return}let n=t.map(e=>({"role name":e.title,company:e.company,"job url":e.applyUrl||e.link,platform:e.platform||`Generic`,salary:e.salary||null,location:e.location||null,workModel:e.workModel||null,description:e.description}));if(await d(n.length===1?JSON.stringify(n[0],null,2):JSON.stringify(n,null,2))){let e=t[0];b(`✅ Copied to clipboard!`,`${e.title||`Job`} • ${e.company||`Company`}`,`success`),y(`success`)}else b(`⚠️ Could not access clipboard`,`Check clipboard permissions in browser`,`warning`),y(`idle`)}catch(e){console.error(`[Job Extractor Floating] Extraction error:`,e),b(`❌ Extraction failed`,String(e instanceof Error?e.message:e),`error`),y(`idle`)}finally{setTimeout(()=>{y(`idle`),l=!1},1500)}}}var p=null;function m(){if(document.getElementById(`job-extractor-floating-host`))return;let e=document.createElement(`div`);e.id=`job-extractor-floating-host`;let t=e.attachShadow({mode:`open`});p=t,t.innerHTML=`
    <style>
      :host {
        all: initial;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      }
      .widget-wrap {
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 2147483647;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 10px;
        pointer-events: none;
      }
      .interactive {
        pointer-events: auto;
      }
      /* Main Action Button Pill */
      .action-pill {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        background: linear-gradient(135deg, #18181b 0%, #27272a 100%);
        color: #ffffff;
        border: 1px solid rgba(255, 255, 255, 0.18);
        border-radius: 9999px;
        padding: 8px 14px 8px 12px;
        box-shadow: 0 8px 24px -4px rgba(0, 0, 0, 0.5), 0 2px 8px -2px rgba(0, 0, 0, 0.3);
        cursor: pointer;
        user-select: none;
        transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      }
      .action-pill:hover {
        transform: translateY(-2px);
        background: linear-gradient(135deg, #27272a 0%, #3f3f46 100%);
        box-shadow: 0 12px 28px -4px rgba(0, 0, 0, 0.6), 0 4px 12px -2px rgba(0, 0, 0, 0.4);
        border-color: rgba(255, 255, 255, 0.3);
      }
      .action-pill:active {
        transform: translateY(0) scale(0.98);
      }
      .icon-bolt {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        border-radius: 50%;
        background: rgba(236, 72, 153, 0.2);
        color: #f472b6;
        font-size: 14px;
      }
      .label-text {
        font-size: 13px;
        font-weight: 600;
        letter-spacing: -0.01em;
      }
      .shortcut-chip {
        font-size: 10px;
        font-weight: 700;
        background: rgba(255, 255, 255, 0.12);
        color: #a1a1aa;
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 5px;
        padding: 2px 5px;
        letter-spacing: 0.02em;
      }
      .collapse-btn {
        background: transparent;
        border: none;
        color: #71717a;
        cursor: pointer;
        padding: 2px 4px;
        border-radius: 4px;
        font-size: 12px;
        line-height: 1;
        transition: color 0.15s;
        margin-left: 2px;
      }
      .collapse-btn:hover {
        color: #ffffff;
      }
      /* Minimized Circle Mode */
      .circle-btn {
        width: 44px;
        height: 44px;
        border-radius: 50%;
        background: linear-gradient(135deg, #18181b 0%, #27272a 100%);
        color: #f472b6;
        border: 1px solid rgba(255, 255, 255, 0.2);
        box-shadow: 0 8px 24px -4px rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 18px;
        cursor: pointer;
        transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      }
      .circle-btn:hover {
        transform: translateY(-2px) scale(1.05);
        border-color: rgba(244, 114, 182, 0.5);
        box-shadow: 0 10px 26px -4px rgba(236, 72, 153, 0.3);
      }
      /* Toast Banner */
      .toast {
        background: rgba(24, 24, 27, 0.95);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        color: #ffffff;
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 12px;
        padding: 10px 14px;
        max-width: 320px;
        box-shadow: 0 12px 30px -4px rgba(0, 0, 0, 0.6);
        opacity: 0;
        transform: translateY(10px) scale(0.95);
        transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      }
      .toast.show {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
      .toast-header {
        font-size: 13px;
        font-weight: 700;
        margin-bottom: 2px;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .toast-body {
        font-size: 11px;
        color: #a1a1aa;
        line-height: 1.4;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .toast.success .toast-header { color: #4ade80; }
      .toast.error .toast-header { color: #f87171; }
      .toast.warning .toast-header { color: #fbbf24; }

      /* Pulse animation when extracting */
      @keyframes spin-pulse {
        0% { transform: scale(1); opacity: 1; }
        50% { transform: scale(1.15); opacity: 0.7; }
        100% { transform: scale(1); opacity: 1; }
      }
      .extracting .icon-bolt {
        animation: spin-pulse 0.8s infinite ease-in-out;
      }
    </style>

    <div class="widget-wrap">
      <div id="toast" class="toast">
        <div id="toastHeader" class="toast-header"></div>
        <div id="toastBody" class="toast-body"></div>
      </div>

      <div id="widgetContainer" class="interactive">
        ${localStorage.getItem(`job_extractor_widget_collapsed`)===`true`?g():h()}
      </div>
    </div>
  `,_(),document.documentElement.appendChild(e)}function h(){return`
    <div id="extractBtn" class="action-pill" title="Click to Extract & Copy JSON (or press Alt+J)">
      <div class="icon-bolt">⚡</div>
      <span id="btnLabel" class="label-text">Extract Job</span>
      <span class="shortcut-chip">Alt+J</span>
      <button id="collapseBtn" class="collapse-btn" title="Minimize button">✕</button>
    </div>
  `}function g(){return`
    <div id="expandBtn" class="circle-btn" title="Job Extractor (Alt+J) - Click to open">
      ⚡
    </div>
  `}function _(){if(!p)return;let e=p.getElementById(`extractBtn`);e&&e.addEventListener(`click`,e=>{let t=e.target;if(t.id===`collapseBtn`||t.closest(`#collapseBtn`)){e.stopPropagation(),v(!0);return}f()});let t=p.getElementById(`expandBtn`);t&&t.addEventListener(`click`,()=>{v(!1)})}function v(e){if(!p)return;localStorage.setItem(`job_extractor_widget_collapsed`,e?`true`:`false`);let t=p.getElementById(`widgetContainer`);t&&(t.innerHTML=e?g():h(),_())}function y(e){if(!p)return;let t=p.getElementById(`extractBtn`),n=p.getElementById(`btnLabel`),r=p.querySelector(`.icon-bolt`);t&&n&&(e===`extracting`?(t.classList.add(`extracting`),n.textContent=`Extracting…`,r&&(r.textContent=`⏳`)):e===`success`?(t.classList.remove(`extracting`),n.textContent=`Copied!`,r&&(r.textContent=`✓`)):(t.classList.remove(`extracting`),n.textContent=`Extract Job`,r&&(r.textContent=`⚡`)))}function b(e,t,n){if(!p)return;let r=p.getElementById(`toast`),i=p.getElementById(`toastHeader`),a=p.getElementById(`toastBody`);r&&i&&a&&(i.textContent=e,a.textContent=t,r.className=`toast show ${n}`,u&&clearTimeout(u),u=setTimeout(()=>{r.className=`toast`},3e3))}window.addEventListener(`keydown`,e=>{e.altKey&&(e.key===`j`||e.key===`J`||e.code===`KeyJ`)&&(e.preventDefault(),console.log(`[Job Extractor] Hotkey Alt+J pressed!`),f())}),document.readyState===`loading`?document.addEventListener(`DOMContentLoaded`,()=>m()):m(),chrome.runtime.onMessage.addListener((e,t,n)=>{if(e.action===`quickExtractAndCopy`)return console.log(`[Job Extractor] 📩 Received quickExtractAndCopy command from background`),f(),n({status:`started`}),!0;if(e.action===`extractJobs`){console.log(`[Job Extractor] 📩 Received extractJobs message with mainWorldData:`,!!e.mainWorldData);let t=c(window.location.href);return console.log(`[Job Extractor] Matched extractor: ${t.constructor.name}`),t.extract(e.mainWorldData).then(e=>{console.log(`[Job Extractor] 📤 Sending ${e.length} job(s) to popup:`,e),n({jobs:e})}).catch(e=>{console.error(`[Job Extractor] ❌ Fatal error during extraction:`,e),n({jobs:[]})}),!0}if(e.action===`debugDOM`){try{let e=Array.from(document.querySelectorAll(`a, button, [role="button"]`)).filter(e=>/apply/i.test(e.textContent||``)||/apply/i.test(e.getAttribute(`aria-label`)||``)).map(e=>{let t={};for(let n=0;n<e.attributes.length;n++)t[e.attributes[n].name]=e.attributes[n].value;return{tag:e.tagName,text:e.textContent?.trim().replace(/\s+/g,` `),href:e instanceof HTMLAnchorElement?e.href:null,attrs:t,outerHTML:e.outerHTML.substring(0,300)}}),t=Array.from(document.querySelectorAll(`a[target="_blank"]`)).map(e=>({text:e.textContent?.trim().replace(/\s+/g,` `),href:e.href})).slice(0,20);n({url:window.location.href,title:document.title,applyEls:e,allTargetBlankLinks:t})}catch(e){n({error:String(e)})}return!0}return!1});})()

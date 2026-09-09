import{t as e}from"./mainWorldHelper-C5gwek9s.js";(function(){let e=document.createElement(`link`).relList;if(e&&e.supports&&e.supports(`modulepreload`))return;for(let e of document.querySelectorAll(`link[rel="modulepreload"]`))n(e);new MutationObserver(e=>{for(let t of e)if(t.type===`childList`)for(let e of t.addedNodes)e.tagName===`LINK`&&e.rel===`modulepreload`&&n(e)}).observe(document,{childList:!0,subtree:!0});function t(e){let t={};return e.integrity&&(t.integrity=e.integrity),e.referrerPolicy&&(t.referrerPolicy=e.referrerPolicy),t.credentials=e.crossOrigin===`use-credentials`?`include`:e.crossOrigin===`anonymous`?`omit`:`same-origin`,t}function n(e){if(e.ep)return;e.ep=!0;let n=t(e);fetch(e.href,n)}})();var t=[];async function n(){let[e]=await chrome.tabs.query({active:!0,currentWindow:!0});return e}function r(e){if(!e)return{name:`Unknown`,supported:!1,isJobPage:!1};let t=e.toLowerCase();return t.includes(`linkedin.com/jobs`)||t.includes(`linkedin.com/jobs/view`)||t.includes(`linkedin.com/jobs/search`)?{name:`LinkedIn`,supported:!0,isJobPage:!0}:t.includes(`jobright.ai`)?{name:`JobRight`,supported:!0,isJobPage:!0}:t.includes(`hiringcafe.com`)||t.includes(`hiring.cafe`)?{name:`Hiring Cafe`,supported:!0,isJobPage:!0}:t.includes(`ziprecruiter.com`)?{name:`ZipRecruiter`,supported:!0,isJobPage:!0}:{name:`Generic Site`,supported:!1,isJobPage:t.includes(`/jobs/`)||t.includes(`/job/`)||t.includes(`/careers/`)||t.includes(`/career/`)||t.includes(`greenhouse.io`)||t.includes(`lever.co`)||t.includes(`ashbyhq.com`)||t.includes(`myworkdayjobs.com`)||t.includes(`workday`)}}function i(e){return e?e.replace(/&/g,`&amp;`).replace(/</g,`&lt;`).replace(/>/g,`&gt;`).replace(/"/g,`&quot;`):``}function a(e,t=`info`){let n=document.getElementById(`status`);n&&(n.className=`status ${t}`,n.textContent=e)}function o(e){return document.getElementById(e)}function s(e){let t=document.getElementById(`platformHeaderBadge`),n=document.getElementById(`platformHeaderName`);t&&n&&(n.textContent=e.name,t.className=e.supported?`platform-chip supported`:`platform-chip`);let r=!e.supported&&!e.isJobPage?`<div class="warning-banner">⚠️ Generic page detected. Best results on LinkedIn, HiringCafe, ZipRecruiter, & JobRight.</div>`:``;o(`mainContent`).innerHTML=`
    ${r}
    <div class="controls">
      <button id="extractBtn">⚡ Extract Job</button>
      <button id="copyBtn">📋 Copy JSON</button>
      <button id="exportBtn">⬇ CSV</button>
      <button id="clearBtn" title="Clear details">✕</button>
      <button id="debugBtn" style="display:none;">🐛</button>
    </div>
    <div class="status info" id="status">Click Extract to capture job details.</div>
    <div id="results"></div>
  `,o(`extractBtn`).addEventListener(`click`,u),o(`copyBtn`).addEventListener(`click`,d),o(`exportBtn`).addEventListener(`click`,f),o(`clearBtn`).addEventListener(`click`,p);let i=document.getElementById(`debugBtn`);i&&i.addEventListener(`click`,l)}function c(e){let t=o(`results`);if(!e||e.length===0){t.innerHTML=`
      <div class="empty-state">
        <div class="empty-icon">⚡</div>
        <div class="empty-title">Ready to Capture</div>
        <div class="empty-subtitle">Navigate to any job listing and click <strong>Extract Job</strong> or press <strong>Alt+J</strong></div>
      </div>
    `;return}console.log(`[ApplyFlow Popup] Rendering jobs:`,e),t.innerHTML=e.map((e,t)=>`
    <div class="job-card">
      <div class="card-top">
        <div class="job-title">${i(e.title)||`<em>No title found</em>`}</div>
        <div class="job-number">#${t+1}</div>
      </div>
      <div class="job-company">${i(e.company)||`Unknown company`}</div>
      
      <div class="meta-chips">
        ${e.salary?`<span class="meta-chip chip-salary">💰 ${i(e.salary)}</span>`:``}
        ${e.location?`<span class="meta-chip chip-location">📍 ${i(e.location)}</span>`:``}
        ${e.workModel?`<span class="meta-chip chip-model">🏢 ${i(e.workModel)}</span>`:``}
      </div>

      <div class="link-row">
        <div class="link-item">
          <strong>Job URL:</strong>
          ${e.link?`<a href="${i(e.link)}" target="_blank" title="${i(e.link)}">${i(e.link)}</a>`:`<em>None</em>`}
        </div>
        ${e.applyUrl&&e.applyUrl!==e.link?`
          <div class="link-item apply-link">
            <strong>Apply URL:</strong>
            <a href="${i(e.applyUrl)}" target="_blank" title="${i(e.applyUrl)}">${i(e.applyUrl)}</a>
          </div>
        `:``}
      </div>

      ${e.description?`<span class="desc-toggle" data-idx="${t}">▶ View Description (${e.description.length.toLocaleString()} chars)</span>
           <div class="job-description" id="desc-${t}">${i(e.description)}</div>`:`<span class="desc-toggle no-desc">No description available</span>`}

      <div class="job-footer">
        <span>Platform: ${i(e.platform||`Generic`)}</span>
        <span>Source: ${i(e.source||`detail-page`)}</span>
      </div>
    </div>
  `).join(``),t.querySelectorAll(`.desc-toggle[data-idx]`).forEach(e=>{e.addEventListener(`click`,()=>{let t=e.getAttribute(`data-idx`),n=document.getElementById(`desc-${t}`);n&&(e.textContent=(n.classList.toggle(`open`)?`▼ Hide`:`▶ View`)+` Description`)})})}async function l(){let r=await n();try{let n=null;try{n=(await chrome.scripting.executeScript({target:{tabId:r.id},world:`MAIN`,func:e}))?.[0]?.result}catch(e){n={error:String(e)}}let i=await chrome.tabs.sendMessage(r.id,{action:`debugDOM`}),a=JSON.stringify({extractedJobs:t,mainWorldData:n,domInfo:i},null,2);await navigator.clipboard.writeText(a),alert(`ApplyFlow diagnostics copied to clipboard!`)}catch(e){alert(`Error gathering diagnostics: `+(e instanceof Error?e.message:String(e)))}}async function u(){let r=await n(),i=document.getElementById(`debugBtn`);a(`⏳ Capturing job details…`,`info`),o(`results`).innerHTML=``,i&&(i.style.display=`none`),o(`extractBtn`).disabled=!0;try{console.log(`[ApplyFlow Popup] 📤 Inspecting page world on tab:`,r.id);let n=null;try{n=(await chrome.scripting.executeScript({target:{tabId:r.id},world:`MAIN`,func:e}))?.[0]?.result,console.log(`[ApplyFlow Popup] Main world data:`,n)}catch(e){console.warn(`[ApplyFlow Popup] Main world execution skipped:`,e)}console.log(`[ApplyFlow Popup] 📤 Sending extractJobs to tab:`,r.id);let o=await chrome.tabs.sendMessage(r.id,{action:`extractJobs`,mainWorldData:n});if(console.log(`[ApplyFlow Popup] 📥 Response received:`,o),!o?.jobs?.length){a(`❌ No job details found. Open a job details page first.`,`error`);return}t=o.jobs.map(e=>{let t=e.link||r.url||`No URL found`,n=e.applyUrl||t;return{title:e.title||`Unknown Title`,company:e.company||`Unknown Company`,link:t,description:e.description||`No description found.`,applyUrl:n,source:e.source||`detail-page`,platform:e.platform||`Generic`,salary:e.salary||null,location:e.location||null,workModel:e.workModel||null}});try{await chrome.storage.local.set({savedJobs:t,savedUrl:r.url,savedTime:Date.now()})}catch(e){console.warn(`[ApplyFlow Popup] Could not persist to storage:`,e)}a(t.length===1?`✅ Captured: ${t[0].title||`Job`}`:`✅ Captured ${t.length} jobs`,`success`),c(t),i&&(i.style.display=`inline-block`)}catch(e){console.error(`[ApplyFlow Popup] ❌ Extraction error:`,e),a(`❌ Error: ${e instanceof Error?e.message:`Could not communicate with tab. Refresh page and try again.`}`,`error`)}finally{o(`extractBtn`).disabled=!1}}function d(){if(!t.length){a(`❌ Extract a job first!`,`error`);return}let e=t.map(e=>({"role name":e.title,company:e.company,"job url":e.link,"direct apply url":e.applyUrl||e.link,platform:e.platform||`Generic`,salary:e.salary||null,location:e.location||null,workModel:e.workModel||null,description:e.description})),n=e.length===1?JSON.stringify(e[0],null,2):JSON.stringify(e,null,2);navigator.clipboard.writeText(n).then(()=>a(`✅ Copied to clipboard!`,`success`)).catch(e=>{console.error(`[ApplyFlow Popup] ❌ Copy error:`,e),a(`❌ Failed to copy`,`error`)})}function f(){if(!t.length){a(`❌ Extract a job first!`,`error`);return}let e=[`Title`,`Company`,`Link`,`Apply URL`,`Platform`,`Salary`,`Location`,`Work Model`,`Description`,`Source`],n=t.map(e=>[`"${(e.title||``).replace(/"/g,`""`)}"`,`"${(e.company||``).replace(/"/g,`""`)}"`,`"${e.link.replace(/"/g,`""`)}"`,`"${(e.applyUrl||``).replace(/"/g,`""`)}"`,`"${e.platform||`Generic`}"`,`"${e.salary||``}"`,`"${e.location||``}"`,`"${e.workModel||``}"`,`"${(e.description||``).replace(/"/g,`""`).replace(/\n/g,` `)}"`,`"${e.source||``}"`]),r=[e.join(`,`),...n.map(e=>e.join(`,`))].join(`
`),i=new Blob([r],{type:`text/csv;charset=utf-8;`}),o=document.createElement(`a`);o.href=URL.createObjectURL(i),o.download=`applyflow_jobs_${new Date().toISOString().slice(0,10)}.csv`,document.body.appendChild(o),o.click(),document.body.removeChild(o),URL.revokeObjectURL(o.href),a(`✅ CSV downloaded!`,`success`)}function p(){t=[],c([]);let e=document.getElementById(`debugBtn`);e&&(e.style.display=`none`),chrome.storage.local.remove([`savedJobs`,`savedUrl`]),a(`Ready to capture job details.`,`info`)}async function m(){try{let e=await chrome.storage.local.get([`savedJobs`,`savedUrl`]);if(e.savedJobs&&Array.isArray(e.savedJobs)&&e.savedJobs.length>0){console.log(`[ApplyFlow Popup] 🔄 Restoring retained job details:`,e.savedJobs),t=e.savedJobs,c(t),a(`✅ Retained: ${t[0].title||`Job`} (${t[0].company||``})`,`success`);let n=document.getElementById(`debugBtn`);n&&(n.style.display=`inline-block`)}}catch(e){console.warn(`[ApplyFlow Popup] Could not restore saved details:`,e)}}(async()=>{console.log(`[ApplyFlow Popup] 🚀 Initialized`);let e=await n();console.log(`[ApplyFlow Popup] Current tab:`,e.url),s(r(e.url)),await m()})();
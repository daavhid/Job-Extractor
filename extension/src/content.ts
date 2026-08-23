import { getExtractorForUrl } from "./extractors";

console.log("[Job Extractor] 🟢 Content script injected on:", window.location.href);

interface ExtractResponse {
  jobs: any[];
}

chrome.runtime.onMessage.addListener(
  (
    request: { action: string },
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: ExtractResponse) => void
  ): boolean => {
    if (request.action === "extractJobs") {
      console.log("[Job Extractor] 📩 Received extractJobs message");

      const extractor = getExtractorForUrl(window.location.href);
      console.log(`[Job Extractor] Matched extractor: ${extractor.constructor.name}`);

      extractor.extract()
        .then((jobs) => {
          console.log(`[Job Extractor] 📤 Sending ${jobs.length} job(s) to popup:`, jobs);
          sendResponse({ jobs });
        })
        .catch((err) => {
          console.error("[Job Extractor] ❌ Fatal error during extraction:", err);
          sendResponse({ jobs: [] });
        });

      return true;
    }
    return false;
  }
);
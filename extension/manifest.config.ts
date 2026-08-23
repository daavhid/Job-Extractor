import { defineManifest } from "@crxjs/vite-plugin";

export default defineManifest({
  manifest_version: 3,

  name: "Job Analyzer",

  version: "1.0.0",

  permissions: [
    "activeTab",
    "storage",
    "tabs",
    "scripting",
  ],

  host_permissions: ["<all_urls>"],

  action: {
    default_popup: "index.html",
  },

  background: {
    service_worker: "src/background.ts",
    type: "module",
  },

  content_scripts: [
    {
      matches: ["<all_urls>"],  // scope to LinkedIn jobs only
      js: ["src/content.ts"],
      run_at: "document_idle",   // wait for full DOM before injecting
    },
  ],
});
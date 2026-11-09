import { defineManifest } from "@crxjs/vite-plugin";

export default defineManifest({
  manifest_version: 3,

  name: "ApplyFlow Job Extractor",
  description: "Instantly capture and structure job postings across LinkedIn, HiringCafe, ZipRecruiter, and JobRight for ApplyFlow.",

  version: "1.0.0",

  permissions: [
    "activeTab",
    "storage",
    "tabs",
    "scripting",
    "clipboardWrite",
  ],

  commands: {
    "extract-job": {
      suggested_key: {
        default: "Alt+J",
        mac: "Alt+J"
      },
      description: "Extract current job and copy to clipboard"
    }
  },

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
      matches: ["<all_urls>"],
      js: ["src/content.ts"],
      run_at: "document_idle",
    },
  ],
});
import { defineManifest } from "@crxjs/vite-plugin";
import pkg from "../package.json" with { type: "json" };

export default defineManifest({
  manifest_version: 3,
  name: "ClaudeThis",
  description: "Add custom features to any website by chatting with Claude.",
  version: pkg.version,
  action: {
    default_title: "ClaudeThis",
  },
  side_panel: {
    default_path: "src/sidepanel/index.html",
  },
  background: {
    service_worker: "src/background/index.ts",
    type: "module",
  },
  content_scripts: [
    {
      matches: ["<all_urls>"],
      js: ["src/content/bridge.ts"],
      run_at: "document_idle",
      all_frames: false,
    },
  ],
  permissions: [
    "storage",
    "scripting",
    "activeTab",
    "sidePanel",
    "offscreen",
    "tabs",
    "webNavigation",
  ],
  host_permissions: ["<all_urls>"],
  web_accessible_resources: [
    {
      resources: ["src/offscreen/offscreen.html"],
      matches: ["<all_urls>"],
    },
  ],
  content_security_policy: {
    extension_pages: "script-src 'self'; connect-src https://api.anthropic.com;",
  },
  minimum_chrome_version: "116",
});

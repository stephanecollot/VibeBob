import { defineManifest } from "@crxjs/vite-plugin";
import pkg from "../package.json" with { type: "json" };

export default defineManifest({
  manifest_version: 3,
  name: "VibeBob",
  description: "Add custom features to any website by chatting with AI.",
  version: pkg.version,
  icons: {
    "16": "src/assets/icon16.png",
    "48": "src/assets/icon48.png",
    "128": "src/assets/icon128.png",
  },
  action: {
    default_title: "VibeBob",
    default_icon: {
      "16": "src/assets/icon16.png",
      "48": "src/assets/icon48.png",
      "128": "src/assets/icon128.png",
    },
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
    extension_pages:
      "script-src 'self'; connect-src https://api.anthropic.com https://api.github.com https://raw.githubusercontent.com;",
  },
  homepage_url: "https://github.com/stephanecollot/VibeBob",
  minimum_chrome_version: "116",
});

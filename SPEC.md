# Vibe — Design & Requirements Spec

> **Working name: Vibe.** A Chrome extension that lets users add small custom features to any website by chatting with an AI agent. Hand this document to Claude Code to bootstrap the project.

Name: VibeBob

---

## 1. Vision

People routinely use web apps (Linear, Gmail, GitHub, Notion, internal tools, brokerage platforms) where they want minor UX improvements the product itself doesn't offer: an extra button, a reordered column, a custom text format, a keyboard shortcut. Today, this requires writing a userscript or browser extension by hand.

Vibe lets the user describe the change in natural language. An in-extension Claude agent inspects the live page, writes a small JS+CSS mod scoped to that site, applies it instantly, and persists it as a versioned, toggleable, shareable feature.

---

## 2. Core concepts

| Term | Definition |
|---|---|
| **Feature** | One user-visible capability on a site (e.g. "Export Linear table to CSV"). Has a name, regex URL match, and code (`apply()` / `cleanup()`). |
| **Chat** | The conversation that produced and continues to evolve a feature. One feature = one chat = one git repo. |
| **Toggle** | Enable/disable a feature on its matching sites without deleting it. |
| **Revert** | Move a feature back to a previous chat turn (and its corresponding commit). |
| **Marketplace** | GitHub repos containing a feature's source code *and* its chat history. Anyone can install, fork, or update. |

---

## 3. Architecture decision

We considered two paths:

1. **Native daemon + real Claude Code CLI**, talking to the extension over Native Messaging.
2. **Extension-only**, with a Claude-Code-like agent loop reimplemented in JavaScript, calling the Anthropic API directly.

**We chose option 2.** Chrome's security model forbids extensions from shipping or auto-installing native binaries; option 1 would mean the user installs Node, Claude Code, and a native host before getting started. Option 2 gives us zero-install: install extension, paste Anthropic API key (BYOK), ship features.

We sacrifice some Claude Code features (subagents, `/commands`, hooks, plan mode, skills). For the bounded task of writing small website mods, a focused agent loop with purpose-built tools is sufficient. A native-daemon path can be added later as an opt-in for power users.

---

## 4. User flows

### 4.1 First-time setup
1. Install extension from Chrome Web Store.
2. Open side panel, prompted to paste Anthropic API key.
3. Key stored in `chrome.storage.local` (BYOK; no backend).
4. Done.

### 4.2 Creating a feature
1. User on `linear.app/team/xyz` opens side panel, clicks **New feature**.
2. Types: *"Add a CSV export button to this table view."*
3. Agent inspects the page (DOM, screenshot, computed styles), proposes `apply()` + `cleanup()` + CSS, writes the files. Auto-commit.
4. Agent calls `apply_mod` → button appears live.
5. User refines: *"Make it green and put it next to the Filter button."* Agent edits, hot-reloads. Auto-commit.

### 4.3 Reverting
- Each chat turn corresponds to a commit.
- User clicks **revert here** on any prior message → repo resets to that commit; later messages move to a `wip/` branch (recoverable from a menu); mod hot-reloads to the reverted version.

### 4.4 Enabling / disabling
- Per-feature toggle in the side panel feature list.
- Disabled = `cleanup()` runs, files stay, no injection.

### 4.5 Breakage detection
- Errors thrown inside `apply()`, event handlers, or any code from the mod are caught by an error monitor scoped to that mod's bundle.
- On error: feature flagged broken in the UI; the next chat turn auto-receives the error stack as context.
- v1 fix path: user just continues the chat ("it's broken, please fix").

### 4.6 Publishing (v1.5)
- Click **Publish to marketplace** → GitHub OAuth → push the feature directory (including `session.jsonl`) as a public repo on the user's account. Tagged with `vibe-mod` topic.

### 4.7 Installing from marketplace (v1.5)
1. Browse marketplace UI (curated index + paste-a-GitHub-URL).
2. Click install → clone repo into local VFS as a new feature.
3. **Strategy C** for cross-user portability: extension first tries the prebuilt artifact. If errors fire in the first 10s of `apply()`, prompt: *"This mod isn't working on your version of the site. Re-vibe it?"* → fresh chat thread seeded with the original `session.jsonl` + the current DOM + the error.

---

## 5. Component architecture

```
Chrome Extension (MV3)
├── Background service worker
│   ├── Native messaging surface (placeholder, not used in v1)
│   ├── Tab event router (URL changes → matcher → injector)
│   └── Anthropic API gateway (streaming proxy, retries)
├── Side panel UI (React + Tailwind)
│   ├── Feature list (toggles, status, broken-flags)
│   ├── Per-feature chat view (markdown, tool calls, revert)
│   └── Settings (API key, key usage stats)
├── Content scripts
│   ├── Bridge (RPC with side panel & background)
│   ├── Injector (loads enabled features, runs apply/cleanup)
│   ├── Error monitor (per-feature try/catch, error reporting)
│   └── DOM inspector (handles tool calls from the agent)
├── Agent module
│   ├── Conversation loop
│   ├── Tool registry & dispatch
│   └── Session persistence (writes session.jsonl to VFS)
├── Virtual filesystem (IndexedDB via idb / Dexie)
│   └── Per-feature folders: mod.js, mod.css, manifest.json, session.jsonl, README.md
├── Git layer (isomorphic-git on the VFS)
│   └── One repo per feature; auto-commits per agent edit
├── Runtime
│   ├── Compiler (concat + wrap features for injection)
│   ├── Matcher (regex match + SPA route listener)
│   └── Hot-reload manager
└── Marketplace module (v1.5)
    └── GitHub OAuth, publish, install, fork, update via GitHub REST
```

---

## 6. Data model

### 6.1 Feature directory layout (in VFS)
```
mods/<feature-id>/
  manifest.json
  mod.js          # exports apply, cleanup, matches
  mod.css         # optional
  session.jsonl   # full agent conversation history
  README.md       # human-readable summary, screenshots optional
```

### 6.2 `manifest.json` schema
```json
{
  "id": "uuid-v4",
  "name": "Export Linear table to CSV",
  "description": "Adds a CSV export button on Linear team table views.",
  "matches": ["^https://linear\\.app/.*"],
  "entry": "mod.js",
  "styles": "mod.css",
  "version": "0.1.0",
  "author": "stephane",
  "createdAt": "2026-05-07T...",
  "updatedAt": "2026-05-07T...",
  "capabilities": ["dom-read", "dom-write"],
  "source": {
    "github": "user/repo",
    "commit": "abc123"
  }
}
```

### 6.3 Capability tags
Declared in v1 (no enforcement). Enforced in v2 once marketplace trust matters.

| Tag | Meaning |
|---|---|
| `dom-read` | Reads DOM contents |
| `dom-write` | Modifies DOM |
| `network` | Makes outbound HTTP calls |
| `storage` | Reads/writes `chrome.storage` or `localStorage` |
| `inputs` | Reads values of form fields |

### 6.4 No dependencies between features in v1
Each feature is self-contained. Marketplace authors who need shared utilities should inline them. Revisit in v2.

---

## 7. Mod lifecycle contract

Every `mod.js` exports:

```js
export const matches = /pattern/;     // or a function (url) => boolean

export function apply(ctx) {
  // mutate DOM, attach listeners, etc.
  // use ctx.onCleanup() to register undo logic
}

export function cleanup() {
  // undo everything apply() did, restoring original state
}
```

`ctx` provides:
- `ctx.onCleanup(fn)` — register a cleanup callback (preferred over manual cleanup logic).
- `ctx.log(msg)` — diagnostic logging visible in the chat panel.
- `ctx.error(err)` — report a non-fatal error.
- `ctx.scope` — a unique element class prefix the mod should use, to avoid collisions.

**The agent's system prompt mandates that every DOM mutation has a paired cleanup.** This is what makes hot-reload, toggling, and SPA route changes feel clean.

---

## 8. Hot-reload model

When the agent edits a file:
1. Runtime calls `cleanup()` on the previous version.
2. New module loads.
3. `apply(ctx)` runs.
4. If `apply()` throws, restore previous version, report error in chat.

No page reload required. If the agent declares `requiresReload: true` in the manifest (rare), fall back to a soft reload of the content script. Full page reload is the last resort and offered as a banner action.

---

## 9. URL matching

- `matches` field in the manifest is an array of regexes evaluated against `window.location.href`.
- Re-evaluated on:
  - Initial page load (`document_start`).
  - SPA navigation: monkey-patch `history.pushState`/`replaceState` and listen for `popstate`.
- On match: `apply()`. On unmatch: `cleanup()`.
- `matches` may be a function for advanced cases (in v1.5, accepts a URL and returns boolean).

---

## 10. Composition model

- Multiple enabled features matching the current URL apply in **deterministic order: by feature `createdAt` timestamp**.
- No conflict detection in v1.
- No inter-feature dependencies in v1.
- Each feature has its own `ctx` and its own scope class prefix to minimize collisions.

---

## 11. The agent

### 11.1 Loop
Standard Anthropic tool-use loop with streaming:
1. Send user message + full conversation history.
2. Receive assistant response (possibly with `tool_use` blocks).
3. Execute each tool call locally.
4. Send `tool_result` blocks back; repeat until no more tool calls.

### 11.2 Tools

**Browser tools** (RPC via content script into active tab):
- `inspect_dom(selector?, depth?)` → DOM JSON tree (filtered, size-capped)
- `get_html(selector?)` → outer HTML string
- `screenshot(selector?)` → base64 PNG
- `get_computed_style(selector)` → object of computed properties
- `evaluate_js(expr)` → result (read-only by convention; system prompt enforces)
- `get_network_log()` → array of recent requests visible to the page
- `get_console_log()` → array of recent log/error/warn entries
- `click(selector)` / `type(selector, text)` — for the agent to test the mod

**Filesystem tools** (scoped to current feature's VFS folder):
- `read_file(path)` → string
- `write_file(path, contents)` → void *(auto-commits)*
- `list_files()` → string[]
- `delete_file(path)` → void *(auto-commits)*

**Mod runtime tools**:
- `apply_mod()` → compile and inject the current feature
- `unapply_mod()` → call `cleanup()` and remove
- `get_mod_errors()` → recent errors caught by the error monitor

**Session tools** (mostly auto, but exposed):
- `commit(message)` — explicit logical checkpoint; otherwise commits are automatic per file write.

### 11.3 Session persistence
- Every assistant turn (including all tool calls and results) is appended to `session.jsonl`.
- Reopening the chat replays the file to reconstruct UI state.
- Reverting in-chat truncates the visible history; the truncated tail is saved to a `wip/` branch on the git side.

### 11.4 System prompt requirements
The agent's system prompt should:
- Establish the lifecycle contract (always pair mutations with cleanup).
- Constrain `evaluate_js` to read-only inspection.
- Encourage minimal-DOM-impact patterns (use a unique class prefix from `ctx.scope`).
- Prefer CSS for styling changes, JS only when necessary.
- Always test the mod by calling `apply_mod` and inspecting the result before declaring done.

---

## 12. Marketplace (v1.5 — not blocking v1)

### 12.1 Storage
- Each published mod = a public GitHub repo containing the feature directory verbatim (source + chat history).
- Tagged with `vibe-mod` topic for discoverability.
- Optionally indexed by a small central registry (a JSON file on a static host) for in-extension browsing.

### 12.2 Publish flow
- GitHub OAuth from the extension.
- Push the mod's directory (with `session.jsonl`) as a new public repo, or update an existing one.
- The author's `manifest.json` `source` field is updated with the repo URL and commit hash.

### 12.3 Install flow
- User browses marketplace UI or pastes a GitHub URL.
- Extension clones the repo into VFS as a new feature.
- Tries to apply prebuilt artifact (Strategy C).

### 12.4 Update flow
- For installed mods with a `source.github` field, periodically check for updates.
- On update: surface a diff to the user before applying (per the security model — don't silently mutate code that runs on authenticated pages).

### 12.5 Cross-user portability — Strategy C
- **Try the artifact first.** Most cosmetic mods will just work.
- **On error within first 10s**, mark broken and prompt to "Re-vibe."
- **Re-vibe** = spawn a fresh chat seeded with: original `session.jsonl` + a system note explaining the mod is being adapted + current DOM and the error stack. Agent rewrites against the user's actual page.

---

## 13. v1 scope

**In:**
- Chrome MV3 extension with side panel UI.
- BYOK Anthropic API key.
- Feature creation, editing, reverting, toggling, deleting.
- Auto-commit per agent edit; revert via chat message with `wip/` branch preservation.
- Hot-reload with `apply` / `cleanup` lifecycle contract.
- Regex URL matching with SPA route handling.
- Error monitoring per feature.
- Full agent tool set (browser tools, FS tools, runtime tools).
- Session persistence (`session.jsonl`) and resumption.

**Out (deferred to v1.5+):**
- Marketplace publish/install/update.
- Cross-user re-vibe (Strategy C).
- Capability enforcement (declared but not enforced in v1).
- Cross-device sync.
- Visual diff viewer between commits.
- Native daemon escape hatch.
- Inter-feature dependencies / shared utilities.
- Conflict detection between features.

---

## 14. Tech stack

- **Manifest V3 Chrome extension**, TypeScript.
- **React + Tailwind** for the side panel UI.
- **Vite** + `@crxjs/vite-plugin` (or equivalent) for the extension build.
- **IndexedDB** via `idb` or **Dexie** for the virtual filesystem.
- **isomorphic-git** for git operations on the VFS.
- **Anthropic SDK** (or direct `fetch` to `api.anthropic.com`) with streaming SSE for the agent.
- **chrome.scripting** + content scripts for tab RPC.
- **chrome.sidePanel** API for the chat panel.

---

## 15. Open questions for the build agent to resolve

These don't block starting; flag them when relevant during implementation:

1. **API key encryption.** `chrome.storage.local` is per-extension but not encrypted at rest. Acceptable for v1, or use Web Crypto with a passphrase?
2. **Token-usage display.** Users pay per-token under BYOK. Show running cost per chat? Per session?
3. **Side panel persistence.** Side panel UI state should persist across tab navigations (Chrome's side panel API allows this).
4. **MV3 service worker termination.** Long-running agent loops conflict with MV3's worker lifecycle. Use offscreen documents for sustained work.
5. **CSP failures.** Some sites' CSP blocks injected inline scripts. Handle via content script in isolated world by default; document MAIN-world injection patterns for cases that need page context.
6. **Project name.** "Vibe" is a placeholder. Trademark search before launch.
7. **Telemetry.** Opt-in error reporting helps marketplace authors fix breakage at scale, but adds a privacy surface. Decide before v1.5.

---

## 16. Suggested first commit / scaffolding

Recommended order of build:

1. Extension scaffold (MV3, React, Vite, side panel, TypeScript).
2. VFS module on IndexedDB with feature CRUD.
3. Git layer (isomorphic-git on VFS), per-feature repo init, auto-commit on writes.
4. Anthropic agent loop with streaming, tool dispatch, session persistence.
5. Browser-tool RPC layer (content script ↔ side panel).
6. Mod runtime: lifecycle contract, compiler, injector, hot-reload, error monitor.
7. URL matcher + SPA route listener.
8. Side panel UI: feature list, chat view, toggle/revert.
9. Settings UI: API key, basic usage stats.
10. End-to-end test: build the "Linear CSV export" feature on a real page.

Defer marketplace work entirely until step 10 passes on three different sites.
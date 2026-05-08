# Initial implementation — bugs and dead ends

A field log of what broke during the initial v0.1.0 build of ClaudeThis, what we
tried, and what worked. Roughly chronological, grouped by phase.

## Tooling

### pnpm 11 blocking esbuild's postinstall

`pnpm install` succeeded but every subsequent `pnpm <script>` failed with
`ERR_PNPM_IGNORED_BUILDS: Ignored build scripts: esbuild@0.21.5`. pnpm 11 added a
`verify-deps-before-run` check that re-runs install before scripts, and the
re-install treated the ignored build as a fatal error.

Tried (none worked): `verify-deps-before-run=false` and `strict-dep-builds=false`
in `.npmrc`, the env var `PNPM_VERIFY_DEPS_BEFORE_RUN=false`, and
`pnpm.onlyBuiltDependencies: ["esbuild"]` inside `package.json`. pnpm seemed to
ignore all of them — `pnpm config get verify-deps-before-run` returned
`undefined` even after writing the value.

What worked: pnpm 11 had silently auto-created a `pnpm-workspace.yaml` template
with an `allowBuilds:` schema. Setting `allowBuilds: { esbuild: true }` there
unblocked the build. The schema isn't documented in the same place as the older
`onlyBuiltDependencies` field, which is why the obvious config attempts failed.

### `tsc -b` emitting `.js` next to sources

Before the first commit, `git status` showed a parallel `.js` file for every
`.ts` file in `src/`. `tsc -b` defaults to writing emit alongside source unless
told otherwise; the `build` script ran `tsc -b && vite build` and Vite's actual
output goes to `dist/`, so the tsc emit was just noise.

Tried: nothing initially — the issue only surfaced at commit time. The fix was
adding `"noEmit": true` to `tsconfig.app.json`. Vite handles the real build via
its own transform pipeline, so tsc only needs to typecheck.

## isomorphic-git in the browser

### Vite externalizing Node's `crypto`

First build emitted a warning: `Module "crypto" has been externalized for
browser compatibility, imported by "isomorphic-git/index.cjs"`. The package's
`exports` map points `.` to the CJS build, which has `var crypto = require('crypto')`
at the top. Vite externalized it to a stub that throws on access — meaning the
first `git.commit` would fail at runtime.

Tried: `resolve.alias: { "isomorphic-git": "isomorphic-git/index.js" }`. Vite
rejected this with `Missing "./index.js" specifier in "isomorphic-git" package`
because the package's `exports` map doesn't expose internal paths.

What worked: alias to an absolute filesystem path via
`fileURLToPath(new URL("./node_modules/isomorphic-git/index.js", import.meta.url))`.
This bypasses the exports check and gives Vite the ESM build directly. The ESM
build uses `globalThis.crypto` instead of Node's `crypto`.

### `Buffer is not defined` at runtime

Build was clean but `apply_mod`'s first commit threw `Buffer is not defined`.
The ESM build of isomorphic-git still uses `Buffer.from(...)`, `Buffer.alloc(...)`,
and `Buffer.concat(...)` unguardedly in its tree/index serialization paths. These
work in Node but not in browsers.

What worked: add the `buffer` npm package and a single `polyfills.ts` that does
`globalThis.Buffer = Buffer`. Imported as the first line of every entry point
(`sidepanel/main.tsx`, `offscreen/index.ts`) so it executes before any
isomorphic-git module.

## MV3 / extension platform

### Offscreen document never bundled

After Phase 2 the agent loop should have run inside a `chrome.offscreen` document.
Sending `agent.startTurn` did nothing. Inspecting the build output revealed why:
`dist/src/offscreen/offscreen.html` still referenced `<script src="./index.ts">`
— the raw TypeScript path. The 0.78 KB JS file in `dist/assets/` was actually
the *background* bundle (also called `index.ts`).

`@crxjs/vite-plugin` auto-detects entries declared in the manifest, but offscreen
documents are created at runtime via `chrome.offscreen.createDocument` and so
have no manifest entry. crxjs left the HTML untouched.

What worked: add `rollupOptions.input.offscreen` explicitly to `vite.config.ts`,
pointing at the offscreen HTML. Vite then transforms the HTML and bundles
`index.ts` like any other entry.

### `chrome.storage` undefined in offscreen documents

After the offscreen bundle started loading, the agent loop threw
`Cannot read properties of undefined (reading 'local')` whenever it tried
`chrome.storage.local.get("apiKey")`. Despite declaring the `storage` permission
in the manifest, offscreen documents only get a restricted subset of extension
APIs — `chrome.storage` is not exposed to them.

Tried: defensive checks (`if (!chrome?.storage?.local)`) which clarified the
error but didn't fix it. There's no flag or permission that adds storage to
offscreen.

What worked: read `apiKey` and `model` in the side panel (which has full
extension API access) and pass them in the `agent.startTurn` message payload.
Offscreen now uses what's passed in and never touches `chrome.storage` directly.

This issue resurfaced in Phase 5: `syncFeatureFromVfs` called from
`writeFileAndCommit` in offscreen also tried to read/write `chrome.storage`.
Same fix pattern — added a `feature.sync` message that offscreen sends to
background, and background does the storage write on its behalf.

### Content script missing on existing tabs

After reload the agent's `inspect_dom` failed with
`Could not establish connection. Receiving end does not exist`. Content scripts
are only injected into *new* page loads — tabs that were already open at install
time don't have them.

What worked: in the background's tab-RPC helper, catch the
"Receiving end does not exist" error and fall back to
`chrome.scripting.executeScript({target, files})` to inject the content script
on demand, then retry the message. The content script path has to be read from
`chrome.runtime.getManifest().content_scripts[0].js` because crxjs renames it
to a hashed asset (`assets/bridge.ts-XXXXXX.js`).

### Site access permission not auto-granted

For unpacked extensions with `host_permissions: ["<all_urls>"]`, Chrome still
defaults to "On click" site access. Without flipping it to "On all sites" in
`chrome://extensions → Details`, content-script injection silently no-ops on
arbitrary pages. This is not a bug in the extension — it's a Chrome default —
but it bit testing and is worth flagging in any onboarding doc.

## Mod injection and CSP

This was the longest dead-end chain in the build. The product needs to evaluate
agent-generated JavaScript in the page's context, and MV3 + page CSPs make that
hard.

### `new Function(...)` blocked by extension CSP

The first injector compiled the mod via `new Function(modJs)()` in the content
script (isolated world). Extension content scripts run under the *extension's*
CSP, which in MV3 hard-forbids `'unsafe-eval'` — there is no manifest setting
that allows it. Result:
`Evaluating a string as JavaScript violates the following Content Security
Policy directive 'script-src 'self' 'wasm-unsafe-eval' ...'`.

What worked here only partially: build the wrapper code as a string and inject
as a `<script>` element with `textContent`, appended to `document.head`. The
script element runs in the page's MAIN world, so the *page's* CSP applies, not
the extension's.

### Inline `<script>` blocked by page `script-src 'self'`

The next site we tested (sequense.ai) had `script-src 'self' 'wasm-unsafe-eval'
'inline-speculation-rules' http://localhost:* http://127.0.0.1:* chrome-extension://...`
— no `'unsafe-inline'`. Inline scripts blocked. Same error class, different
source CSP.

Tried: `chrome.userScripts.execute(...)` — relaxed CSP, runs in `USER_SCRIPT`
world. This method doesn't exist. The userScripts API has `register`, `update`,
`unregister`, `getScripts`, `configureWorld`, `getWorldConfigurations`,
`resetWorldConfiguration` — but no on-demand `execute`. Registered scripts only
fire on subsequent page loads, which is the wrong UX for "apply this change to
the current page now."

Also tried thinking through: chrome.scripting.executeScript with `world: "MAIN"`
and a function that calls `new Function(modCode)` internally — the privileged
injection bypasses CSP for the injection itself, but `new Function` *inside*
the injected function is still subject to the page's `unsafe-eval`, which
sequense.ai forbids. Same dead end.

What worked: the user suggested using a Blob URL. `<script src="blob:...">`
loads as an *external* script, not inline, and Chrome treats blob URLs as
matching `'self'` in script-src for same-origin. So:

1. Background calls `chrome.scripting.executeScript({world: "MAIN", func: applyBootstrap, args: [...]})`.
2. `applyBootstrap` runs in MAIN world (no extension CSP).
3. It builds the wrapper string, creates a `Blob` and `URL.createObjectURL`.
4. Appends `<script src="blob:...">` — page CSP applies, blob URL matches `'self'`.

This works on permissive sites *and* most strict-CSP sites that allow `'self'`
in `script-src`. For pages that explicitly forbid both inline and blob, the
script's `onerror` fires and the agent gets a clear error. That's a hard MV3
limit; the production-grade fix (`chrome.userScripts.register` with page reload
after install) is deferred.

### Apply state across worlds

Because the mod runs in MAIN world (page context) but error-tracking lives in
the content script (isolated world), they communicate via `window.postMessage`.
Both worlds share the same `window` and the message-event listener fires in
both. The mod's `ctx.error(err)` posts a `{__claudethis: "mod-error", ...}`
message, the isolated-world listener filters by tag and stores in a per-feature
errors map. `get_mod_errors` reads the map.

## Smaller bugs worth noting

### `agent.loadSession` warmup with a fake feature ID

`App.tsx` sent `agent.loadSession` with `featureId: "__warmup__"` on mount to
wake the offscreen document. `vfs.listFiles("__warmup__")` threw ENOENT because
the directory doesn't exist, spamming the console. Removed the warmup — the
existing `sendToOffscreen` helper already ensures the doc on its first real
call. Also: made `loadJsonl` swallow ENOENT for genuinely fresh features (when
opening a chat before the first file write).

### Anthropic SDK `Usage` type vs. our `TokenUsage`

The SDK declares `cache_creation_input_tokens: number | null`; our local
`TokenUsage` had `number | undefined`. Trivial fix: align the local type to
allow `null`.

### TypeScript union narrowing on tool-use blocks

`Chat.tsx` cast assistant content to a union ending in
`{ type: string; [k: string]: unknown }`. That fallback variant was too
permissive — TypeScript couldn't narrow to the `text` or `tool_use` branches
because the open object signature matched everything. Fixed by casting to
`Array<Record<string, unknown>>` and checking properties with `typeof` guards.

### "Errors" pasted from the Sources tab

A few times the user reported a CSP issue by pasting tens of kilobytes of
minified bundle code. That content came from devtools' Sources tab (the source
of the asset Chrome served), not the Console tab. Real errors are red lines in
Console with a stack trace under them. Worth documenting for triage:

- **Sources tab** = the file content the browser is running.
- **Console tab** = error messages and stack traces.

Future versions could surface offscreen / content-script errors in the side
panel UI to avoid the round-trip through devtools.

## Architecture decisions made under pressure

A couple of design calls came out of these dead ends rather than being planned:

- **VFS consolidated on `lightning-fs` only.** Originally the spec listed
  Dexie *and* isomorphic-git as separate dependencies. Running both would have
  meant either two IndexedDB stores (Dexie's and lightning-fs's) or a custom
  git-fs adapter on top of Dexie. lightning-fs already persists to IndexedDB
  and is the canonical FS for isomorphic-git, so we dropped Dexie.

- **Background is the single owner of `chrome.storage` writes.** Because
  offscreen has no access, side panel can write but doesn't always know what's
  current, and `chrome.storage.onChanged` is a clean signal for the router and
  side panel to refresh, all writes funnel through a `feature.sync` message
  handled in background. Side panel reads chrome.storage directly (it's local
  and fast) but doesn't write feature data.

- **Apply/unapply moved from content script to background.** Phase 4 originally
  put the injector in the content script. Phase 4.5 moved it into background
  so we could call `chrome.scripting.executeScript({world: "MAIN", func})` —
  which content scripts can't do. Background owns the bootstrap functions in
  `src/background/bootstraps.ts`; content script keeps only the error listener
  and `get_mod_errors` query.

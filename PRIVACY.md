# Privacy Policy

**VibeBob** — Last updated: September 2, 2026

## What VibeBob does

VibeBob is a Chrome extension that lets you add custom features to any website by chatting with an AI agent. It runs entirely in your browser — there is no VibeBob backend or server.

## Data we collect

### Anthropic API key

You provide your own Anthropic API key to use the extension. The key is stored locally in your browser using `chrome.storage.local` and is only sent to `api.anthropic.com` to authenticate requests. It is never sent anywhere else.

### Website content

When you ask the AI agent to build a feature, it inspects elements of the current page (DOM structure, text, computed styles) and may take screenshots. This content is sent to the Anthropic API (`api.anthropic.com`) so the agent can understand the page and generate code. This only happens when you actively send a message in the chat.

### Current tab URL

The extension reads your current tab URL to determine which user-created features should be applied. URLs are matched locally against feature patterns and are not stored or transmitted for this purpose. URLs may be included in the context sent to the Anthropic API during an active chat session.

### Chat messages

Your conversations with the AI agent are stored locally in your browser's IndexedDB. Chat history is sent to the Anthropic API during active sessions to maintain conversation context. Messages are never sent to any other service.

### Marketplace

Browsing the marketplace downloads a catalog file and mod source from
`raw.githubusercontent.com`. These are plain file downloads that carry no
identifier of you or your browsing — GitHub sees them the same way it sees anyone
fetching a public file, and VibeBob sends nothing about you along with them. The
extension also rechecks the catalog when you open VibeBob and when Chrome starts,
so mods removed for being unsafe can be switched off on your machine. It does not
run a background timer.

Mods you install from the marketplace are code written by other people. They run
with the same access to the pages they match as the sites themselves, including
anything you are signed into. The install screen shows which sites a mod will run
on and links to its source before anything is installed. VibeBob does not review
mods before they are listed.

Publishing a mod opens a GitHub issue in a new tab, containing that mod's code and
description, published publicly under your GitHub username. Your chat history is
never included. Nothing is sent until you submit the issue yourself, and VibeBob
never asks for or stores a GitHub token — from there, GitHub's own privacy policy
applies.

## Data we do NOT collect

- No personal information (name, email, address, age)
- No browsing history or activity tracking
- No analytics or telemetry
- No cookies or cross-site tracking
- No financial, health, or location data

## Third parties

**Anthropic** (`api.anthropic.com`) processes your chat messages and page content to generate responses. This occurs under your own API key and is subject to [Anthropic's privacy policy](https://www.anthropic.com/privacy) and usage policies.

**GitHub** (`raw.githubusercontent.com`) hosts the marketplace catalog and mod files. VibeBob downloads public files from it; it sends no information about you or your browsing. If you choose to publish a mod, that happens on `github.com` under your own GitHub account, subject to [GitHub's privacy statement](https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement).

No data is sold, transferred, or shared with any other third party.

## Data storage

All data is stored locally in your browser:

- **API key**: `chrome.storage.local` (per-extension, not synced)
- **Features and chat history**: IndexedDB (per-extension, not synced)
- **Feature toggle states**: `chrome.storage.local`

Uninstalling the extension removes all stored data.

## Your control

- You can view and delete any feature and its chat history from within the extension
- You can remove your API key at any time from Settings
- Uninstalling the extension deletes all data

## Changes

If this policy changes, the updated version will be posted at this URL. Material changes will be noted in the extension's release notes.

## Contact

For questions about this privacy policy, open an issue at [github.com/stephanecollot/VibeBob/issues](https://github.com/stephanecollot/VibeBob/issues).

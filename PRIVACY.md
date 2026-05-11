# Privacy Policy

**VibeBob** — Last updated: May 11, 2026

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

## Data we do NOT collect

- No personal information (name, email, address, age)
- No browsing history or activity tracking
- No analytics or telemetry
- No cookies or cross-site tracking
- No financial, health, or location data

## Third parties

The only third party that receives any data is **Anthropic** (`api.anthropic.com`), which processes your chat messages and page content to generate responses. This occurs under your own API key and is subject to [Anthropic's privacy policy](https://www.anthropic.com/privacy) and usage policies.

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

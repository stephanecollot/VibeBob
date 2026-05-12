# VibeBob Marketplace

Community-contributed mods that anyone can install with one click from the VibeBob extension.

## Structure

```
marketplace/
  <namespace>/
    <mod-name>/
      manifest.json
      mod.js
      mod.css          (optional)
      README.md
```

**Namespaces** are free-form organizational prefixes. Use whatever makes sense:

- A target site: `amazon/`, `github/`, `linear/`
- A trust tier: `official/`, `community/`
- Your username: `stephane/`, `johndoe/`

## Contributing a mod

1. Fork this repo
2. Create a folder: `marketplace/<namespace>/<your-mod-name>/`
3. Add the required files (see below)
4. Open a PR

Or use the **Publish** button inside VibeBob — it does steps 1-4 automatically.

## Required files

### `manifest.json`

```json
{
  "name": "Human-readable mod name",
  "description": "What this mod does, in one sentence.",
  "matches": ["^https://example\\.com/.*"],
  "entry": "mod.js",
  "version": "0.1.0",
  "author": "your-github-username"
}
```

Fields:

| Field         | Required | Description                                    |
| ------------- | -------- | ---------------------------------------------- |
| `name`        | yes      | Display name                                   |
| `description` | yes      | One-line summary                               |
| `matches`     | yes      | Array of JS regexes matched against the URL    |
| `entry`       | yes      | Always `"mod.js"`                              |
| `version`     | yes      | Semver string                                  |
| `author`      | no       | Your name or GitHub handle                     |
| `styles`      | no       | Set to `"mod.css"` if you include a CSS file   |

### `mod.js`

Must export `apply` and `cleanup`:

```js
export function apply(ctx) {
  // Add your DOM mutations, event listeners, etc.
  // Use ctx.onCleanup() to register undo logic.
  // Use ctx.scope as a class prefix to avoid collisions.
}

export function cleanup() {
  // Undo everything apply() did.
}
```

### `README.md`

A short description of what the mod does, with a screenshot if possible.

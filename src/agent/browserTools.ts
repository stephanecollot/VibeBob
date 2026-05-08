import type Anthropic from "@anthropic-ai/sdk";
import { registerTool } from "./tools";
import type { AppMessage } from "../types/messages";

async function callBrowser(tool: string, input: unknown): Promise<unknown> {
  const reply = await chrome.runtime.sendMessage({
    target: "background",
    type: "browser.tool",
    tool,
    input,
  } satisfies AppMessage);
  if (!reply || reply.ok !== true) {
    throw new Error(reply?.error ?? `browser tool ${tool} failed`);
  }
  return reply.result;
}

const definitions: Anthropic.Tool[] = [
  {
    name: "inspect_dom",
    description:
      "Return a bounded JSON tree of the active page's DOM. Use to understand structure before writing a mod. Pass a CSS selector to focus on a sub-tree.",
    input_schema: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description: "Optional CSS selector. Defaults to document.body.",
        },
        depth: {
          type: "number",
          description: "Max tree depth (default 4).",
        },
      },
    },
  },
  {
    name: "get_html",
    description:
      "Return the outerHTML of an element (or document.body). Use sparingly — prefer inspect_dom. Truncated to 50KB.",
    input_schema: {
      type: "object",
      properties: {
        selector: { type: "string" },
      },
    },
  },
  {
    name: "get_computed_style",
    description:
      "Return key computed CSS properties for the first element matching the selector.",
    input_schema: {
      type: "object",
      properties: {
        selector: { type: "string" },
      },
      required: ["selector"],
    },
  },
  {
    name: "evaluate_js",
    description:
      "Evaluate a JavaScript expression in the content script context (read-only DOM access). Use for inspection only — never mutate. Returns the serialized result.",
    input_schema: {
      type: "object",
      properties: {
        expr: { type: "string", description: "A JavaScript expression." },
      },
      required: ["expr"],
    },
  },
  {
    name: "screenshot",
    description:
      "Capture a PNG screenshot of the visible portion of the active tab. Returns { dataUrl } (base64 data URL).",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "click",
    description:
      "Click the first element matching the CSS selector. Use sparingly — only to test mod behavior, not as primary mod logic.",
    input_schema: {
      type: "object",
      properties: {
        selector: { type: "string" },
      },
      required: ["selector"],
    },
  },
  {
    name: "type",
    description:
      "Type text into the first input or textarea matching the selector. Triggers input/change events.",
    input_schema: {
      type: "object",
      properties: {
        selector: { type: "string" },
        text: { type: "string" },
      },
      required: ["selector", "text"],
    },
  },
];

export function registerBrowserTools(): void {
  for (const def of definitions) {
    registerTool({
      definition: def,
      handler: (input) => callBrowser(def.name, input),
    });
  }
}

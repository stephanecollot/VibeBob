import type Anthropic from "@anthropic-ai/sdk";
import { registerTool, requireCurrentFeature } from "./tools";
import * as vfs from "../vfs";
import type { AppMessage } from "../types/messages";

async function callContent(tool: string, input: unknown): Promise<unknown> {
  const reply = await chrome.runtime.sendMessage({
    target: "background",
    type: "browser.tool",
    tool,
    input,
  } satisfies AppMessage);
  if (!reply || reply.ok !== true) {
    throw new Error(reply?.error ?? `${tool} failed`);
  }
  return reply.result;
}

async function readMaybe(featureId: string, path: string): Promise<string | undefined> {
  const files = await vfs.listFiles(featureId);
  if (!files.includes(path)) return undefined;
  return vfs.readFile(featureId, path);
}

const definitions: Array<{
  def: Anthropic.Tool;
  handler: (input: any) => Promise<unknown>;
}> = [
  {
    def: {
      name: "apply_mod",
      description:
        "Compile mod.js (+ mod.css if present) and inject into the active tab. Calls cleanup() of any prior version first. Throws if apply() fails. Always call after writing mod files.",
      input_schema: { type: "object", properties: {} },
    },
    handler: async () => {
      const id = requireCurrentFeature();
      const modJs = await readMaybe(id, "mod.js");
      if (!modJs) throw new Error("mod.js not found — write it first");
      const modCss = await readMaybe(id, "mod.css");
      return callContent("apply_mod", { featureId: id, modJs, modCss });
    },
  },
  {
    def: {
      name: "unapply_mod",
      description: "Run cleanup() of the current feature's mod and remove its style block.",
      input_schema: { type: "object", properties: {} },
    },
    handler: async () => {
      const id = requireCurrentFeature();
      return callContent("unapply_mod", { featureId: id });
    },
  },
  {
    def: {
      name: "get_mod_errors",
      description:
        "Return errors caught during apply() / cleanup() / event handlers for the current feature's mod (most recent 20).",
      input_schema: { type: "object", properties: {} },
    },
    handler: async () => {
      const id = requireCurrentFeature();
      return callContent("get_mod_errors", { featureId: id });
    },
  },
];

export function registerRuntimeTools(): void {
  for (const { def, handler } of definitions) {
    registerTool({ definition: def, handler });
  }
}

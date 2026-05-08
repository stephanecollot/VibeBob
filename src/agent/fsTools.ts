import type Anthropic from "@anthropic-ai/sdk";
import { registerTool, requireCurrentFeature } from "./tools";
import * as vfs from "../vfs";
import { writeFileAndCommit, deleteFileAndCommit } from "../vfs/feature";

const MOD_FILES = new Set(["mod.js", "mod.css", "manifest.json", "README.md"]);

function checkPath(path: string): void {
  if (typeof path !== "string" || path.length === 0) {
    throw new Error("path is required");
  }
  if (path.includes("..") || path.startsWith("/")) {
    throw new Error("path must be relative and may not contain '..'");
  }
  if (path === "session.jsonl") {
    throw new Error("session.jsonl is managed by the agent runtime — do not write directly");
  }
}

const definitions: Array<{
  def: Anthropic.Tool;
  handler: (input: any) => Promise<unknown>;
}> = [
  {
    def: {
      name: "list_files",
      description: "List files in the current feature's directory.",
      input_schema: { type: "object", properties: {} },
    },
    handler: async () => {
      const id = requireCurrentFeature();
      return vfs.listFiles(id);
    },
  },
  {
    def: {
      name: "read_file",
      description: "Read a file from the current feature's directory.",
      input_schema: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
      },
    },
    handler: async (input: { path: string }) => {
      checkPath(input.path);
      const id = requireCurrentFeature();
      return vfs.readFile(id, input.path);
    },
  },
  {
    def: {
      name: "write_file",
      description:
        "Write a file in the current feature's directory and auto-commit. Use for mod.js, mod.css, manifest.json, README.md. Does not auto-apply the mod — call apply_mod after.",
      input_schema: {
        type: "object",
        properties: {
          path: { type: "string" },
          contents: { type: "string" },
        },
        required: ["path", "contents"],
      },
    },
    handler: async (input: { path: string; contents: string }) => {
      checkPath(input.path);
      if (!MOD_FILES.has(input.path) && !input.path.endsWith(".md")) {
        throw new Error(
          `path must be one of ${[...MOD_FILES].join(", ")} or end in .md (got ${input.path})`,
        );
      }
      const id = requireCurrentFeature();
      const oid = await writeFileAndCommit(id, input.path, input.contents);
      return { ok: true, commit: oid };
    },
  },
  {
    def: {
      name: "delete_file",
      description: "Delete a file from the current feature's directory and auto-commit.",
      input_schema: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
      },
    },
    handler: async (input: { path: string }) => {
      checkPath(input.path);
      const id = requireCurrentFeature();
      const oid = await deleteFileAndCommit(id, input.path);
      return { ok: true, commit: oid };
    },
  },
];

export function registerFsTools(): void {
  for (const { def, handler } of definitions) {
    registerTool({ definition: def, handler });
  }
}

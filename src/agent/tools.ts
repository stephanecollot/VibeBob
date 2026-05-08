import type Anthropic from "@anthropic-ai/sdk";
import type { FeatureId } from "../types";

export type ToolHandler = (input: unknown) => Promise<unknown>;

export interface ToolEntry {
  definition: Anthropic.Tool;
  handler: ToolHandler;
}

const registry = new Map<string, ToolEntry>();

export function registerTool(entry: ToolEntry): void {
  registry.set(entry.definition.name, entry);
}

export function getToolDefinitions(): Anthropic.Tool[] {
  return [...registry.values()].map((e) => e.definition);
}

export async function dispatchTool(name: string, input: unknown): Promise<unknown> {
  const entry = registry.get(name);
  if (!entry) throw new Error(`unknown tool: ${name}`);
  return entry.handler(input);
}

export function clearTools(): void {
  registry.clear();
}

let currentFeatureId: FeatureId | null = null;

export function setCurrentFeature(id: FeatureId | null): void {
  currentFeatureId = id;
}

export function requireCurrentFeature(): FeatureId {
  if (!currentFeatureId) throw new Error("no current feature in agent context");
  return currentFeatureId;
}

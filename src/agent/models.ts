import Anthropic from "@anthropic-ai/sdk";
import type { ModelInfo } from "@anthropic-ai/sdk/resources/models.js";

export interface ModelOption {
  id: string;
  displayName: string;
}

export interface ModelCatalog {
  models: ModelOption[];
  fetchedAt: number;
}

export interface ModelCatalogResult {
  models: ModelOption[];
  /** Where the list came from: the Models API, the cached copy, or the built-in list. */
  source: "api" | "cache" | "fallback";
  fetchedAt?: number;
  /** Set when a refresh was attempted and failed — the models above are then stale. */
  error?: string;
}

/** Used until the API list arrives: no key saved yet, offline, or the request failed. */
export const FALLBACK_MODELS: ModelOption[] = [
  { id: "claude-opus-5", displayName: "Claude Opus 5" },
  { id: "claude-sonnet-5", displayName: "Claude Sonnet 5" },
  { id: "claude-haiku-4-5", displayName: "Claude Haiku 4.5" },
];

export const DEFAULT_MODEL = "claude-opus-5";

const CACHE_KEY = "model_catalog";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * The agent loop always sends `context_management` compaction, so a model without
 * it would 400 on the first turn. Missing capability data means "can't tell" — keep
 * the model rather than hide it.
 */
function usableByAgent(model: ModelInfo): boolean {
  const compaction = model.capabilities?.context_management;
  if (!compaction) return true;
  return compaction.compact_20260112?.supported === true;
}

function describeError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return "API key rejected";
  if (err instanceof Anthropic.RateLimitError) return "rate limited";
  if (err instanceof Anthropic.APIConnectionError) return "could not reach api.anthropic.com";
  if (err instanceof Anthropic.APIError) return `API error ${err.status ?? "unknown"}`;
  return err instanceof Error ? err.message : String(err);
}

async function getCachedCatalog(): Promise<ModelCatalog | null> {
  const data = await chrome.storage.local.get(CACHE_KEY);
  const catalog = data[CACHE_KEY] as ModelCatalog | undefined;
  if (!catalog || !Array.isArray(catalog.models) || catalog.models.length === 0) return null;
  return catalog;
}

/** Models API list, newest first, narrowed to what this extension can actually run. */
async function fetchModels(apiKey: string): Promise<ModelOption[]> {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const all: ModelOption[] = [];
  const usable: ModelOption[] = [];

  for await (const model of client.models.list({ limit: 100 })) {
    const option: ModelOption = { id: model.id, displayName: model.display_name || model.id };
    all.push(option);
    if (usableByAgent(model)) usable.push(option);
  }

  return usable.length > 0 ? usable : all;
}

/**
 * Available models, refreshed from the Anthropic Models API at most once a day.
 * Never throws — falls back to the cached list, then to {@link FALLBACK_MODELS}.
 */
export async function loadModels(
  apiKey: string,
  { force = false }: { force?: boolean } = {},
): Promise<ModelCatalogResult> {
  const cached = await getCachedCatalog();
  const fresh = cached != null && Date.now() - cached.fetchedAt < CACHE_TTL_MS;
  if (cached && !force && fresh) {
    return { models: cached.models, source: "cache", fetchedAt: cached.fetchedAt };
  }
  if (!apiKey) {
    return cached
      ? { models: cached.models, source: "cache", fetchedAt: cached.fetchedAt }
      : { models: FALLBACK_MODELS, source: "fallback" };
  }

  try {
    const models = await fetchModels(apiKey);
    if (models.length === 0) throw new Error("no models returned");
    const catalog: ModelCatalog = { models, fetchedAt: Date.now() };
    await chrome.storage.local.set({ [CACHE_KEY]: catalog });
    return { models, source: "api", fetchedAt: catalog.fetchedAt };
  } catch (err) {
    const error = describeError(err);
    return cached
      ? { models: cached.models, source: "cache", fetchedAt: cached.fetchedAt, error }
      : { models: FALLBACK_MODELS, source: "fallback", error };
  }
}

/** Keeps a saved model selectable even when the API no longer lists it. */
export function withSelected(models: ModelOption[], selected: string): ModelOption[] {
  if (!selected || models.some((m) => m.id === selected)) return models;
  return [...models, { id: selected, displayName: selected }];
}

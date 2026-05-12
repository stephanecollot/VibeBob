export type FeatureId = string;

export interface MarketplaceSource {
  github: string;
  path: string;
}

export interface Manifest {
  id: FeatureId;
  name: string;
  description: string;
  matches: string[];
  entry: string;
  styles?: string;
  version: string;
  author?: string;
  createdAt: string;
  updatedAt: string;
  capabilities?: string[];
  source?: MarketplaceSource;
}

export interface Feature {
  manifest: Manifest;
  enabled: boolean;
  broken?: boolean;
}

export interface MarketplaceMod {
  namespace: string;
  slug: string;
  manifest: {
    name: string;
    description: string;
    matches: string[];
    entry: string;
    styles?: string;
    version: string;
    author?: string;
  };
}

export interface MarketplaceCatalog {
  mods: MarketplaceMod[];
  fetchedAt: number;
}

export type Role = "user" | "assistant";

export interface ChatTurn {
  role: Role;
  content: unknown;
  ts: string;
  commit?: string;
}

export interface ApplyError {
  featureId: FeatureId;
  message: string;
  stack?: string;
  ts: string;
}

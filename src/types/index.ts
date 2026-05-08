export type FeatureId = string;

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
  source?: { github?: string; commit?: string };
}

export interface Feature {
  manifest: Manifest;
  enabled: boolean;
  broken?: boolean;
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

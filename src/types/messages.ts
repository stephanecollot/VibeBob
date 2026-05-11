import type { FeatureId, ChatTurn } from "./index";

export type AgentEvent =
  | { kind: "turn-start" }
  | { kind: "text-delta"; text: string }
  | { kind: "text-block-end" }
  | { kind: "tool-call"; id: string; name: string; input: unknown }
  | { kind: "tool-result"; id: string; output: unknown; isError?: boolean }
  | { kind: "turn-done"; usage?: TokenUsage; assistantCommit?: string }
  | { kind: "max-steps"; steps: number }
  | { kind: "error"; message: string };

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

export type AppMessage =
  | {
      type: "agent.startTurn";
      target: "offscreen";
      featureId: FeatureId;
      userMessage: string;
      apiKey: string;
      model?: string;
      screenshotEnabled?: boolean;
    }
  | {
      type: "agent.continueTurn";
      target: "offscreen";
      featureId: FeatureId;
      apiKey: string;
      model?: string;
      screenshotEnabled?: boolean;
    }
  | { type: "agent.cancelTurn"; target: "offscreen"; featureId: FeatureId }
  | { type: "agent.loadSession"; target: "offscreen"; featureId: FeatureId }
  | { type: "agent.revert"; target: "offscreen"; featureId: FeatureId; oid: string }
  | {
      type: "agent.event";
      target: "sidepanel";
      featureId: FeatureId;
      event: AgentEvent;
    }
  | {
      type: "agent.session";
      target: "sidepanel";
      featureId: FeatureId;
      turns: ChatTurn[];
    }
  | {
      type: "browser.tool";
      target: "background";
      tool: string;
      input: unknown;
    }
  | {
      type: "content.tool";
      target: "content";
      tool: string;
      input: unknown;
    }
  | {
      type: "feature.sync";
      target: "background";
      featureId: FeatureId;
      exists: boolean;
      manifestJson?: string;
      modJs?: string;
      modCss?: string;
    };

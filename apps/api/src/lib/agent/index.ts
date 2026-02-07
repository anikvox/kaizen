/**
 * Shared agent utilities for agentic AI features.
 * Used by both focus agent and chat agent.
 */

export { createAgentProvider, getAgentModelId, type AgentProvider } from "./provider.js";
export { getTelemetrySettings as getAgentTelemetrySettings } from "../llm/telemetry.js";

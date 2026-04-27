import type { Agent } from "./agent.js";
import type { Issue } from "./issue.js";

export interface CockpitIssue extends Issue {
  currentOwner: string | null;
  sourceSystem: string | null;
  sourceRef: string | null;
  payload: Record<string, unknown> | null;
}

export interface CockpitMetric {
  key: string;
  label: string;
  value: number;
  trendPlaceholder: string;
}

export interface CockpitAgentOverview {
  id: string | null;
  name: string;
  role: string;
  activeIssues: number;
  blockedIssues: number;
  idleIssues: number;
  awaitingReview: number;
  lastActivityAt: Date | string | null;
}

export interface CockpitEventRow {
  id: string;
  createdAt: Date | string;
  eventType: string;
  issueId: string | null;
  sourceSystem: string | null;
  payloadSummary: string;
  payload: Record<string, unknown> | null;
}

export interface CockpitRoutingDecisionRow {
  id: string;
  createdAt: Date | string;
  eventType: string | null;
  action: string | null;
  targetAgent: string | null;
  reason: string | null;
  issueId: string | null;
  fields: Record<string, unknown>;
}

export interface CockpitIssueDetail {
  issue: CockpitIssue;
  events: CockpitEventRow[];
  routingDecisions: CockpitRoutingDecisionRow[];
}

export interface CockpitSummary {
  companyId: string;
  metrics: CockpitMetric[];
}

export interface CockpitAgentsResponse {
  agents: CockpitAgentOverview[];
}

export interface CockpitIssuesResponse {
  issues: CockpitIssue[];
}

export interface CockpitEventsResponse {
  events: CockpitEventRow[];
}

export interface CockpitRoutingDecisionsResponse {
  routingDecisions: CockpitRoutingDecisionRow[];
}

export interface CockpitBootstrapResponse {
  summary: CockpitSummary;
  issues: CockpitIssue[];
  agents: CockpitAgentOverview[];
  events: CockpitEventRow[];
  routingDecisions: CockpitRoutingDecisionRow[];
  rawAgents: Agent[];
}

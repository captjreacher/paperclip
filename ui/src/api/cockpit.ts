import type {
  CockpitAgentsResponse,
  CockpitBootstrapResponse,
  CockpitEventsResponse,
  CockpitIssueDetail,
  CockpitIssuesResponse,
  CockpitRoutingDecisionsResponse,
  CockpitSummary,
} from "@paperclipai/shared";
import { api } from "./client";

export interface MgrnzAdapterStatus {
  configured: boolean;
  degraded: boolean;
  message: string | null;
}

export interface MgrnzCanonicalEventRow {
  event_id: string;
  created_at: string;
  event_type: string;
  canonical_event_type: string;
  event_taxonomy_version: string | null;
  entity_type: string;
  entity_id: string | null;
  entity_ref: string | null;
  status: string | null;
  source_system: string | null;
  correlation_id: string | null;
  risk_category: string | null;
  risk_assertions: string[];
  risk_version: string | null;
  route_key: string | null;
  target_layer: string | null;
  target_action: string | null;
  target_owner: string | null;
  priority: number | null;
  route_enabled: boolean | null;
}

export interface MgrnzPendingRouteRow {
  event_id: string;
  event_created_at: string;
  event_type: string;
  canonical_event_type: string;
  entity_type: string;
  entity_id: string | null;
  entity_ref: string | null;
  status: string | null;
  source_system: string | null;
  correlation_id: string | null;
  risk_category: string | null;
  risk_assertions: string[];
  route_id: string;
  route_key: string;
  target_layer: string;
  target_action: string;
  target_owner: string | null;
  priority: number;
  notes: string | null;
}

export interface MgrnzRouteExecutionRow {
  id: string;
  event_id: string;
  route_id: string;
  execution_status: string;
  result_event_id: string | null;
  result_payload: Record<string, unknown>;
  error_text: string | null;
  attempts: number;
  locked_at: string | null;
  executed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MgrnzEventsResponse {
  status: MgrnzAdapterStatus;
  events: MgrnzCanonicalEventRow[];
}

export interface MgrnzPendingRoutesResponse {
  status: MgrnzAdapterStatus;
  pendingRoutes: MgrnzPendingRouteRow[];
}

export interface MgrnzRouteExecutionsResponse {
  status: MgrnzAdapterStatus;
  routeExecutions: MgrnzRouteExecutionRow[];
}

function qs(filters?: Record<string, string | number | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters ?? {})) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

export const cockpitApi = {
  bootstrap: (companyId: string) => api.get<CockpitBootstrapResponse>(`/companies/${companyId}/cockpit`),
  summary: (companyId: string) => api.get<CockpitSummary>(`/companies/${companyId}/cockpit/summary`),
  issues: (companyId: string) => api.get<CockpitIssuesResponse>(`/companies/${companyId}/cockpit/issues`),
  issueDetail: (companyId: string, issueId: string) =>
    api.get<CockpitIssueDetail>(`/companies/${companyId}/cockpit/issues/${encodeURIComponent(issueId)}`),
  issueEvents: (companyId: string, issueId: string) =>
    api.get<CockpitEventsResponse>(`/companies/${companyId}/cockpit/issues/${encodeURIComponent(issueId)}/events`),
  issueRouting: (companyId: string, issueId: string) =>
    api.get<CockpitRoutingDecisionsResponse>(`/companies/${companyId}/cockpit/issues/${encodeURIComponent(issueId)}/routing`),
  issueAction: (companyId: string, issueId: string, action: string, payload?: Record<string, unknown>) =>
    api.post<void>(`/companies/${companyId}/cockpit/issues/${encodeURIComponent(issueId)}/actions`, { action, payload }),
  events: (companyId: string, filters?: { eventType?: string; issueId?: string; sourceSystem?: string; from?: string; to?: string; limit?: number }) =>
    api.get<CockpitEventsResponse>(`/companies/${companyId}/cockpit/events${qs(filters)}`),
  routingDecisions: (companyId: string, filters?: { issueId?: string; limit?: number }) =>
    api.get<CockpitRoutingDecisionsResponse>(`/companies/${companyId}/cockpit/routing-decisions${qs(filters)}`),
  agents: (companyId: string) => api.get<CockpitAgentsResponse>(`/companies/${companyId}/cockpit/agents`),
  mgrnzEvents: (companyId: string, filters?: { limit?: number }) =>
    api.get<MgrnzEventsResponse>(`/companies/${companyId}/cockpit/mgrnz-events${qs(filters)}`),
  pendingRoutes: (companyId: string, filters?: { limit?: number }) =>
    api.get<MgrnzPendingRoutesResponse>(`/companies/${companyId}/cockpit/pending-routes${qs(filters)}`),
  routeExecutions: (companyId: string, filters?: { limit?: number }) =>
    api.get<MgrnzRouteExecutionsResponse>(`/companies/${companyId}/cockpit/route-executions${qs(filters)}`),
};

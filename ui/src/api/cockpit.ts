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
};

import type {
  MgrnzAdapterStatus,
  MgrnzPendingRouteRow,
} from "./mgrnzEventAdapter.js";
import { listMgrnzPendingRoutes } from "./mgrnzEventAdapter.js";

export interface MgrnzDryRunIssuePlan {
  event_id: string;
  route_id: string;
  route_key: string;
  canonical_event_type: string;
  target_layer: string;
  target_action: string;
  target_owner: string | null;
  risk_category: string | null;
  risk_assertions: string[];
  title: string;
  description: string;
  payload: Record<string, unknown>;
}

export interface MgrnzDryRunSkippedRoute {
  event_id: string;
  route_id: string;
  route_key: string;
  canonical_event_type: string;
  reason: string;
}

export interface MgrnzDryRunExecutorResult {
  status: MgrnzAdapterStatus;
  dryRun: true;
  processed: number;
  wouldCreateIssues: MgrnzDryRunIssuePlan[];
  skipped: MgrnzDryRunSkippedRoute[];
  failed: MgrnzDryRunSkippedRoute[];
}

const SUPPORTED_ROUTE_TARGET = {
  target_layer: "paperclip",
  target_action: "create issue",
};

function safeLimit(limit: unknown) {
  const n = Number(limit ?? 10);
  if (!Number.isFinite(n)) return 10;
  return Math.min(Math.max(Math.floor(n), 1), 25);
}

function isSupportedPaperclipIssueRoute(route: MgrnzPendingRouteRow) {
  return (
    route.target_layer === SUPPORTED_ROUTE_TARGET.target_layer &&
    route.target_action === SUPPORTED_ROUTE_TARGET.target_action
  );
}

function issuePlanForRoute(route: MgrnzPendingRouteRow): MgrnzDryRunIssuePlan {
  const title = `[MGRNZ] ${route.canonical_event_type}: ${route.target_action}`;
  const description = [
    `Route: ${route.route_key}`,
    `Risk: ${route.risk_category ?? "unknown"} ${(route.risk_assertions ?? []).join(", ")}`.trim(),
    route.notes ? `Notes: ${route.notes}` : null,
  ].filter(Boolean).join("\n");

  return {
    event_id: route.event_id,
    route_id: route.route_id,
    route_key: route.route_key,
    canonical_event_type: route.canonical_event_type,
    target_layer: route.target_layer,
    target_action: route.target_action,
    target_owner: route.target_owner,
    risk_category: route.risk_category,
    risk_assertions: route.risk_assertions ?? [],
    title,
    description,
    payload: {
      mgrnz_event_id: route.event_id,
      mgrnz_route_id: route.route_id,
      mgrnz_route_key: route.route_key,
      canonical_event_type: route.canonical_event_type,
      risk_category: route.risk_category,
      risk_assertions: route.risk_assertions ?? [],
      target_owner: route.target_owner,
      source_system: route.source_system,
      correlation_id: route.correlation_id,
      entity_type: route.entity_type,
      entity_id: route.entity_id,
      entity_ref: route.entity_ref,
    },
  };
}

export async function dryRunMgrnzPendingRoutes(input?: { limit?: unknown }): Promise<MgrnzDryRunExecutorResult> {
  const limit = safeLimit(input?.limit);
  const pending = await listMgrnzPendingRoutes(limit);
  const wouldCreateIssues: MgrnzDryRunIssuePlan[] = [];
  const skipped: MgrnzDryRunSkippedRoute[] = [];
  const failed: MgrnzDryRunSkippedRoute[] = [];

  if (pending.status.degraded) {
    return {
      status: pending.status,
      dryRun: true,
      processed: 0,
      wouldCreateIssues,
      skipped,
      failed,
    };
  }

  for (const route of pending.pendingRoutes) {
    try {
      if (!isSupportedPaperclipIssueRoute(route)) {
        skipped.push({
          event_id: route.event_id,
          route_id: route.route_id,
          route_key: route.route_key,
          canonical_event_type: route.canonical_event_type,
          reason: `Unsupported route target: ${route.target_layer}/${route.target_action}`,
        });
        continue;
      }

      wouldCreateIssues.push(issuePlanForRoute(route));
    } catch (err) {
      failed.push({
        event_id: route.event_id,
        route_id: route.route_id,
        route_key: route.route_key,
        canonical_event_type: route.canonical_event_type,
        reason: err instanceof Error ? err.message : "Unknown dry-run planning error",
      });
    }
  }

  return {
    status: pending.status,
    dryRun: true,
    processed: pending.pendingRoutes.length,
    wouldCreateIssues,
    skipped,
    failed,
  };
}

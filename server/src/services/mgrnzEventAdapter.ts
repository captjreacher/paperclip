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

type SupabaseListResponse<T> = {
  data?: T[];
  error?: { message?: string } | null;
}

const missingStatus: MgrnzAdapterStatus = {
  configured: false,
  degraded: true,
  message: "MGRNZ Supabase adapter not configured. Set MGRNZ_SUPABASE_URL and MGRNZ_SUPABASE_SERVICE_ROLE_KEY.",
};

function config() {
  const url = process.env.MGRNZ_SUPABASE_URL;
  const key = process.env.MGRNZ_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/$/, ""), key };
}

function okStatus(): MgrnzAdapterStatus {
  return { configured: true, degraded: false, message: null };
}

function errorStatus(message: string): MgrnzAdapterStatus {
  return { configured: true, degraded: true, message };
}

async function readRows<T>(tableOrView: string, query = "select=*&limit=100"): Promise<{ status: MgrnzAdapterStatus; rows: T[] }> {
  const cfg = config();
  if (!cfg) return { status: missingStatus, rows: [] };

  const response = await fetch(`${cfg.url}/rest/v1/${tableOrView}?${query}`, {
    headers: {
      apikey: cfg.key,
      Authorization: `Bearer ${cfg.key}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    return { status: errorStatus(`MGRNZ Supabase read failed: ${response.status} ${body}`), rows: [] };
  }

  const payload = await response.json() as SupabaseListResponse<T> | T[];
  const rows = Array.isArray(payload) ? payload : payload.data ?? [];
  return { status: okStatus(), rows };
}

export async function listMgrnzCanonicalEvents(limit = 100): Promise<MgrnzEventsResponse> {
  const safeLimit = Math.min(Math.max(Number(limit || 100), 1), 300);
  const query = `select=*&order=created_at.desc&limit=${safeLimit}`;
  const { status, rows } = await readRows<MgrnzCanonicalEventRow>("event_routing_view", query);
  return { status, events: rows };
}

export async function listMgrnzPendingRoutes(limit = 100): Promise<MgrnzPendingRoutesResponse> {
  const safeLimit = Math.min(Math.max(Number(limit || 100), 1), 300);
  const query = `select=*&order=priority.asc,event_created_at.asc&limit=${safeLimit}`;
  const { status, rows } = await readRows<MgrnzPendingRouteRow>("pending_event_routes", query);
  return { status, pendingRoutes: rows };
}

export async function listMgrnzRouteExecutions(limit = 100): Promise<MgrnzRouteExecutionsResponse> {
  const safeLimit = Math.min(Math.max(Number(limit || 100), 1), 300);
  const query = `select=*&order=created_at.desc&limit=${safeLimit}`;
  const { status, rows } = await readRows<MgrnzRouteExecutionRow>("event_route_executions", query);
  return { status, routeExecutions: rows };
}

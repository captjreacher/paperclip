export type EventStatus = "new" | "queued" | "processing" | "done" | "failed";

export interface CockpitEventInput {
  event_type: string;
  source_system: string;
  entity_type: string;
  entity_id?: string;
  entity_ref?: string;
  status: EventStatus;
  payload: Record<string, unknown>;
  correlation_id?: string;
}

export interface EventRow extends CockpitEventInput {
  id: string;
  created_at: string;
}

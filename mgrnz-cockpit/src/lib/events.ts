import { supabase } from "./supabase";
import type { CockpitEventInput, EventRow } from "../types/events";

export async function createEvent(input: CockpitEventInput): Promise<EventRow> {
  const { data, error } = await supabase.from("events").insert(input).select("*").single();
  if (error) throw error;
  return data as EventRow;
}

export async function listEvents(limit = 25): Promise<EventRow[]> {
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("source_system", import.meta.env.VITE_COCKPIT_SOURCE_SYSTEM ?? "mgrnz-cockpit")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as EventRow[];
}

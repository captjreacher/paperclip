import { FormEvent, useEffect, useMemo, useState } from "react";
import { createEvent, listEvents } from "./lib/events";
import type { EventRow } from "./types/events";
import "./styles.css";

export default function App() {
  const [title, setTitle] = useState("");
  const [audience, setAudience] = useState("");
  const [channel, setChannel] = useState("");
  const [objective, setObjective] = useState("");
  const [notes, setNotes] = useState("");
  const [requestedBy, setRequestedBy] = useState("");
  const [events, setEvents] = useState<EventRow[]>([]);
  const [status, setStatus] = useState<string>("ready");

  async function refreshEvents() {
    const rows = await listEvents();
    setEvents(rows);
  }

  useEffect(() => {
    void refreshEvents().catch((error) => setStatus(`feed error: ${String(error)}`));
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setStatus("sending content.brief.created event...");
    await createEvent({
      event_type: "content.brief.created",
      source_system: import.meta.env.VITE_COCKPIT_SOURCE_SYSTEM ?? "mgrnz-cockpit",
      entity_type: "content_brief",
      status: "new",
      payload: { title, audience, channel, objective, notes, requested_by: requestedBy }
    });
    setTitle("");
    setAudience("");
    setChannel("");
    setObjective("");
    setNotes("");
    setStatus("event written");
    await refreshEvents();
  }

  const latestBriefEvents = useMemo(() => events.filter((e) => e.event_type === "content.brief.created"), [events]);

  return (
    <main className="layout">
      <header>
        <h1>MGRNZ Cockpit</h1>
        <p>Independent command surface. Writes events directly to Supabase public.events.</p>
      </header>
      <section className="panel">
        <h2>Quick Actions</h2>
        <p>Status: {status}</p>
        <form onSubmit={onSubmit} className="form">
          <input required placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <input required placeholder="Audience" value={audience} onChange={(e) => setAudience(e.target.value)} />
          <input required placeholder="Channel" value={channel} onChange={(e) => setChannel(e.target.value)} />
          <input required placeholder="Objective" value={objective} onChange={(e) => setObjective(e.target.value)} />
          <textarea placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <input required placeholder="Requested by (email)" value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} />
          <button type="submit">Create Content Brief</button>
        </form>
      </section>

      <section className="panel">
        <h2>Activity Feed</h2>
        <button onClick={() => void refreshEvents()}>Refresh</button>
        <ul>
          {events.map((row) => (
            <li key={row.id}>
              <strong>{row.event_type}</strong> · {row.status} · {new Date(row.created_at).toLocaleString()}
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h2>Escalation Inbox (placeholder)</h2>
        <p>{latestBriefEvents.length} content briefs created.</p>
      </section>
    </main>
  );
}

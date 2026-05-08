import { useState, useEffect, useCallback } from "react";
import type { ReactNode } from "react";
import {
  X,
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  Copy,
  ExternalLink,
  AlertTriangle,
  Clock3,
  FileText,
  Tag,
  User,
  Building2,
} from "lucide-react";
import type {
  CockpitIssue,
  CockpitIssueDetail,
  CockpitEventRow,
  CockpitRoutingDecisionRow,
} from "@paperclipai/shared";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

function dateLabel(value: string | Date | null | undefined) {
  if (!value) return "No activity";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function statusTone(status: string) {
  if (["blocked", "cancelled"].includes(status)) return "border-red-500/30 bg-red-500/10 text-red-300";
  if (["in_progress", "Drafting"].includes(status)) return "border-sky-500/30 bg-sky-500/10 text-sky-300";
  if (["in_review", "QA Review", "Needs Review", "Review", "boss_review"].includes(status)) return "border-amber-500/30 bg-amber-500/10 text-amber-300";
  if (["done", "closed", "Published", "Approved", "Converted to Work"].includes(status)) return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  return "border-border bg-muted/50 text-muted-foreground";
}

function priorityTone(priority: string) {
  if (priority === "critical") return "border-red-500/40 bg-red-500/15 text-red-200";
  if (priority === "high") return "border-orange-500/40 bg-orange-500/15 text-orange-200";
  if (priority === "low") return "border-muted bg-muted/40 text-muted-foreground";
  return "border-blue-500/30 bg-blue-500/10 text-blue-200";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

type TabId = "overview" | "edit" | "activity" | "routing" | "payload";

const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "edit", label: "Edit" },
  { id: "activity", label: "Activity" },
  { id: "routing", label: "Routing" },
  { id: "payload", label: "Payload" },
];

const READ_ONLY_ACTIONS = [
  { label: "Queue update request", action: "cockpit.todo.update_issue" },
  { label: "Queue owner change", action: "cockpit.todo.assign_owner_request" },
  { label: "Queue blocked note", action: "cockpit.todo.mark_blocked" },
  { label: "Queue QA review", action: "cockpit.todo.send_to_qa" },
  { label: "Queue close candidate review", action: "cockpit.todo.mark_close_candidate" },
] as const;

interface CockpitIssueModalProps {
  issue: CockpitIssue;
  detail: CockpitIssueDetail | undefined;
  isLoading: boolean;
  isError: boolean;
  errorMessage: string | null;
  allIssues: CockpitIssue[];
  onClose: () => void;
  onNavigate: (issue: CockpitIssue) => void;
  onRetry: () => void;
  onAction: (action: string, label: string) => void;
  actionPending: boolean;
}

export function CockpitIssueModal({
  issue,
  detail,
  isLoading,
  isError,
  errorMessage,
  allIssues,
  onClose,
  onNavigate,
  onRetry,
  onAction,
  actionPending,
}: CockpitIssueModalProps) {
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [editForm, setEditForm] = useState({
    title: issue.title,
    description: issue.description || "",
    status: String(issue.status),
    priority: issue.priority,
    currentOwner: issue.currentOwner ?? "",
    comment: "",
  });

  const currentIndex = allIssues.findIndex((i) => i.id === issue.id);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  useEffect(() => {
    setEditForm({
      title: issue.title,
      description: issue.description || "",
      status: String(issue.status),
      priority: issue.priority,
      currentOwner: issue.currentOwner ?? "",
      comment: "",
    });
  }, [issue]);

  const navigatePrev = useCallback(() => {
    if (currentIndex > 0) {
      onNavigate(allIssues[currentIndex - 1]);
    }
  }, [currentIndex, allIssues, onNavigate]);

  const navigateNext = useCallback(() => {
    if (currentIndex < allIssues.length - 1) {
      onNavigate(allIssues[currentIndex + 1]);
    }
  }, [currentIndex, allIssues, onNavigate]);

  const resolvedIssue = detail?.issue ?? issue;
  const relatedEvents = detail?.events ?? [];
  const relatedRouting = detail?.routingDecisions ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 pt-4 pb-8" onClick={onClose}>
      <div
        className="relative w-[90vw] max-w-5xl rounded-2xl border border-border bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border p-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Cockpit Issue</p>
              <Badge variant="outline" className={statusTone(String(resolvedIssue.status))}>{String(resolvedIssue.status)}</Badge>
              <Badge variant="outline" className={priorityTone(resolvedIssue.priority)}>{resolvedIssue.priority}</Badge>
            </div>
            <h2 className="mt-1 text-xl font-semibold tracking-tight">{resolvedIssue.title}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              {resolvedIssue.issueNumber ? <span className="flex items-center gap-1"><Tag className="h-3 w-3" /> #{resolvedIssue.issueNumber}</span> : null}
              {resolvedIssue.sourceRef ? <span className="flex items-center gap-1"><FileText className="h-3 w-3" /> {resolvedIssue.sourceRef}</span> : null}
              <span className="flex items-center gap-1"><User className="h-3 w-3" /> {resolvedIssue.currentOwner ?? "Unassigned"}</span>
              <span className="flex items-center gap-1"><Building2 className="h-3 w-3" /> {resolvedIssue.sourceSystem ?? "unknown"}</span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon-sm" onClick={navigatePrev} disabled={currentIndex <= 0} title="Previous issue">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs text-muted-foreground min-w-[60px] text-center">
              {currentIndex + 1} / {allIssues.length}
            </span>
            <Button variant="ghost" size="icon-sm" onClick={navigateNext} disabled={currentIndex >= allIssues.length - 1} title="Next issue">
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={onClose} title="Close (Esc)">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="border-b border-border">
          <div className="flex gap-0 px-5">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "border-b-2 px-4 py-2.5 text-xs font-medium transition-colors",
                  activeTab === tab.id
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-5">
          {activeTab === "overview" && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold">Description</h3>
                <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{resolvedIssue.description || "No description provided."}</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  ["Title", resolvedIssue.title],
                  ["Status", String(resolvedIssue.status)],
                  ["Priority", resolvedIssue.priority],
                  ["Current Owner", resolvedIssue.currentOwner ?? "Unassigned"],
                  ["Source System", resolvedIssue.sourceSystem ?? "unknown"],
                  ["Source Ref", resolvedIssue.sourceRef ?? "-"],
                  ["Issue Number", resolvedIssue.issueNumber ?? "-"],
                  ["Created", dateLabel(resolvedIssue.createdAt)],
                  ["Updated", dateLabel(resolvedIssue.updatedAt)],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-border bg-card p-3">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
                    <p className="mt-1 text-sm font-medium">{String(value)}</p>
                  </div>
                ))}
              </div>
              {isLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-44" />
                  <Skeleton className="h-4 w-full" />
                </div>
              ) : null}
              {isError && errorMessage ? (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-100">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    <span>{errorMessage}</span>
                  </div>
                  <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>Retry</Button>
                </div>
              ) : null}
            </div>
          )}

          {activeTab === "edit" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">
                Edit actions are queued as TODO events. No direct database mutation occurs.
              </div>
              <div className="grid gap-3">
                <div>
                  <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Title</label>
                  <input
                    type="text"
                    value={editForm.title}
                    onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Description</label>
                  <textarea
                    value={editForm.description}
                    onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                    rows={4}
                    className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Status</label>
                    <select
                      value={editForm.status}
                      onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="backlog">Backlog</option>
                      <option value="todo">To Do</option>
                      <option value="in_progress">In Progress</option>
                      <option value="in_review">In Review</option>
                      <option value="blocked">Blocked</option>
                      <option value="idle">Idle</option>
                      <option value="done">Done</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Priority</label>
                    <select
                      value={editForm.priority}
                      onChange={(e) => setEditForm({ ...editForm, priority: e.target.value as "low" | "medium" | "high" | "critical" })}
                      className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="critical">Critical</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Current Owner</label>
                  <input
                    type="text"
                    value={editForm.currentOwner}
                    onChange={(e) => setEditForm({ ...editForm, currentOwner: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Add Comment / Reason</label>
                  <textarea
                    value={editForm.comment}
                    onChange={(e) => setEditForm({ ...editForm, comment: e.target.value })}
                    placeholder="Optional reason for change..."
                    rows={2}
                    className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-2 pt-3 border-t border-border">
                {READ_ONLY_ACTIONS.map((action) => (
                  <Button
                    key={action.action}
                    variant="outline"
                    size="sm"
                    disabled={actionPending}
                    onClick={() => onAction(action.action, action.label)}
                  >
                    {action.label}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {activeTab === "activity" && (
            <EventList events={relatedEvents} isLoading={isLoading && !detail} />
          )}

          {activeTab === "routing" && (
            <RoutingList rows={relatedRouting} isLoading={isLoading && !detail} />
          )}

          {activeTab === "payload" && (
            <PayloadViewer issue={resolvedIssue} />
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border px-5 py-3">
          <span className="text-xs text-muted-foreground">Cockpit v1 · Read-only · Actions queued as TODO events</span>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <ExternalLink className="h-3.5 w-3.5 mr-1" />
            Open native issue
          </Button>
        </div>
      </div>
    </div>
  );
}

function EventList({ events, isLoading }: { events: CockpitEventRow[]; isLoading: boolean }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-3/4" />
      </div>
    );
  }

  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground py-4">No related events for this issue.</p>;
  }

  return (
    <div className="space-y-2">
      {events.map((event) => (
        <div key={event.id} className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <Badge variant="outline" className={statusTone(event.eventType)}>{event.eventType}</Badge>
              <span className="ml-2 text-xs text-muted-foreground">{dateLabel(event.createdAt)}</span>
            </div>
            <Button variant="ghost" size="xs" onClick={() => setExpanded(expanded === event.id ? null : event.id)}>
              <ChevronDown className="h-3 w-3" />
              Raw
            </Button>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{event.payloadSummary}</p>
          {expanded === event.id ? (
            <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-muted/50 p-3 text-[11px]">{JSON.stringify(event.payload, null, 2)}</pre>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function RoutingList({ rows, isLoading }: { rows: CockpitRoutingDecisionRow[]; isLoading: boolean }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground py-4">No routing decisions for this issue.</p>;
  }

  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row.id} className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{row.action ?? "-"}</Badge>
              <span className="text-xs text-muted-foreground">Target: {row.targetAgent ?? "-"}</span>
              <span className="text-xs text-muted-foreground">{dateLabel(row.createdAt)}</span>
            </div>
            <Button variant="ghost" size="xs" onClick={() => setExpanded(expanded === row.id ? null : row.id)}>
              <ChevronDown className="h-3 w-3" />
              Raw
            </Button>
          </div>
          {row.reason ? <p className="mt-1 text-xs text-muted-foreground">Reason: {row.reason}</p> : null}
          {expanded === row.id ? (
            <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-muted/50 p-3 text-[11px]">{JSON.stringify(row.fields, null, 2)}</pre>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function PayloadViewer({ issue }: { issue: CockpitIssue }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(issue.payload ?? {}, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Issue Payload</h3>
        <Button variant="outline" size="xs" onClick={handleCopy}>
          <Copy className="h-3 w-3 mr-1" />
          {copied ? "Copied!" : "Copy JSON"}
        </Button>
      </div>
      <pre className="max-h-96 overflow-auto rounded-xl border border-border bg-muted/30 p-4 text-[11px]">
        {JSON.stringify(issue.payload ?? {}, null, 2)}
      </pre>
      <h3 className="text-sm font-semibold mt-4">Full Issue JSON</h3>
      <pre className="max-h-96 overflow-auto rounded-xl border border-border bg-muted/30 p-4 text-[11px]">
        {JSON.stringify(issue, null, 2)}
      </pre>
    </div>
  );
}

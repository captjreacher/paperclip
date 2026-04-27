import { useMemo, useState } from "react";
import type { ComponentType, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Clock3,
  FileText,
  Gauge,
  GitBranch,
  MessageSquarePlus,
  RadioTower,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import type {
  CockpitAgentOverview,
  CockpitEventRow,
  CockpitIssue,
  CockpitRoutingDecisionRow,
} from "@paperclipai/shared";
import { Button } from "@/components/ui/button";
import { useCompany } from "@/context/CompanyContext";
import { useDialog } from "@/context/DialogContext";
import { useToastActions } from "@/context/ToastContext";
import { cockpitApi } from "@/api/cockpit";
import { queryKeys } from "@/lib/queryKeys";
import { cn } from "@/lib/utils";

type DraftState = "Drafting" | "Needs Review" | "Needs Design" | "Ready to Publish" | "Published" | "Needs Repurpose";
type BriefState = "Intake" | "Analysis" | "Draft Brief" | "Review" | "Approved" | "Converted to Work";

interface DraftCardData {
  id: string;
  title: string;
  owner: string;
  status: DraftState;
  contentType: string;
  lastUpdated: string;
  source: string;
}

interface BriefCardData {
  id: string;
  title: string;
  owner: string;
  status: BriefState;
  lastUpdated: string;
  source: string;
}

const DRAFT_STATES: DraftState[] = ["Drafting", "Needs Review", "Needs Design", "Ready to Publish", "Published", "Needs Repurpose"];
const BRIEF_STATES: BriefState[] = ["Intake", "Analysis", "Draft Brief", "Review", "Approved", "Converted to Work"];
const BOARD_COLUMNS = [
  "New",
  "Routed",
  "In Progress",
  "Blocked",
  "Idle",
  "QA Review",
  "Boss Review",
  "Done",
  "Close Candidate",
  "Closed",
] as const;

const MOCK_DRAFTS: DraftCardData[] = [
  { id: "draft-1", title: "Founder Letter: Weekly Autonomy Report", owner: "Writer", status: "Drafting", contentType: "Newsletter", lastUpdated: "2026-04-27T09:30:00Z", source: "CEO brief" },
  { id: "draft-2", title: "Customer Story: Support Bot Recovery", owner: "Editor", status: "Needs Review", contentType: "Case study", lastUpdated: "2026-04-26T18:20:00Z", source: "Support package" },
  { id: "draft-3", title: "Launch Visuals for Adapter Plugins", owner: "Designer", status: "Needs Design", contentType: "Social carousel", lastUpdated: "2026-04-25T16:05:00Z", source: "Marketing brief" },
  { id: "draft-4", title: "Ops Playbook Repurpose Clips", owner: "Editor", status: "Needs Repurpose", contentType: "Short video", lastUpdated: "2026-04-24T14:10:00Z", source: "Published doc" },
];

const MOCK_BRIEFS: BriefCardData[] = [
  { id: "brief-1", title: "Reduce idle issue time by 30%", owner: "Business Analyst", status: "Analysis", lastUpdated: "2026-04-27T10:00:00Z", source: "Ops review" },
  { id: "brief-2", title: "Support escalation triage flow", owner: "Service Desk", status: "Draft Brief", lastUpdated: "2026-04-26T17:00:00Z", source: "Customer support" },
  { id: "brief-3", title: "Content QA automation", owner: "Editor", status: "Review", lastUpdated: "2026-04-25T12:40:00Z", source: "Content pipeline" },
];

function dateLabel(value: string | Date | null | undefined) {
  if (!value) return "No activity";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function ageLabel(value: string | Date | null | undefined) {
  if (!value) return "unknown age";
  const diff = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(diff)) return "unknown age";
  const minutes = Math.max(1, Math.floor(diff / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function payloadExists(issue: CockpitIssue) {
  return Boolean(issue.payload && Object.values(issue.payload).some((value) => value !== null && value !== undefined));
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

function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium", className)}>{children}</span>;
}

function boardColumnForIssue(issue: CockpitIssue) {
  const status = String(issue.status);
  const updatedAt = new Date(issue.updatedAt).getTime();
  const idle = ["backlog", "todo"].includes(status) && updatedAt < Date.now() - 3 * 24 * 60 * 60 * 1000;
  const executionState = issue.executionState && typeof issue.executionState === "object" ? issue.executionState as unknown as Record<string, unknown> : null;
  if (["closed", "cancelled"].includes(status)) return "Closed";
  if (status === "done" && updatedAt < Date.now() - 7 * 24 * 60 * 60 * 1000) return "Close Candidate";
  if (status === "done") return "Done";
  if (executionState?.currentStageType === "boss_review" || status === "boss_review") return "Boss Review";
  if (status === "in_review" || status === "qa_review") return "QA Review";
  if (status === "blocked") return "Blocked";
  if (idle || status === "idle") return "Idle";
  if (status === "in_progress") return "In Progress";
  if (status === "todo" || (status === "backlog" && issue.currentOwner)) return "Routed";
  return "New";
}

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-muted/20 p-6 text-center">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{body}</p>
    </div>
  );
}

function MetricCards({ metrics, draftCount, contentReviewCount }: { metrics: { key: string; label: string; value: number; trendPlaceholder: string }[]; draftCount: number; contentReviewCount: number }) {
  const adjusted = metrics.map((metric) => {
    if (metric.key === "drafts") return { ...metric, value: draftCount };
    if (metric.key === "content_review") return { ...metric, value: contentReviewCount };
    return metric;
  });
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {adjusted.map((metric) => (
        <div key={metric.key} className="rounded-2xl border border-border bg-card/80 p-4 shadow-sm backdrop-blur">
          <div className="flex items-start justify-between gap-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{metric.label}</p>
            <Sparkles className="h-4 w-4 text-primary/70" />
          </div>
          <div className="mt-3 text-3xl font-semibold tracking-tight">{metric.value}</div>
          <p className="mt-2 text-xs text-muted-foreground">{metric.trendPlaceholder}</p>
        </div>
      ))}
    </div>
  );
}

function AgentFlow({ agents, onFilter }: { agents: CockpitAgentOverview[]; onFilter: (owner: string) => void }) {
  return (
    <section id="agent-flow" className="space-y-3">
      <SectionTitle icon={Bot} title="Agent Flow Overview" subtitle="Workload, blocked lanes, stale ownership, and review load by operator role." />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {agents.map((agent) => (
          <div key={`${agent.id ?? agent.name}`} className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold">{agent.name}</h3>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{agent.role}</p>
              </div>
              <Button variant="outline" size="xs" onClick={() => onFilter(agent.name)}>Filter</Button>
            </div>
            <div className="mt-4 grid grid-cols-4 gap-2 text-center text-xs">
              <MiniStat label="Active" value={agent.activeIssues} />
              <MiniStat label="Blocked" value={agent.blockedIssues} tone="text-red-300" />
              <MiniStat label="Idle" value={agent.idleIssues} tone="text-amber-300" />
              <MiniStat label="Review" value={agent.awaitingReview} tone="text-sky-300" />
            </div>
            <p className="mt-4 text-xs text-muted-foreground">Last activity: {dateLabel(agent.lastActivityAt)}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function MiniStat({ label, value, tone = "text-foreground" }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-2">
      <div className={cn("text-lg font-semibold", tone)}>{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}

function SectionTitle({ icon: Icon, title, subtitle }: { icon: ComponentType<{ className?: string }>; title: string; subtitle: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="rounded-xl border border-border bg-card p-2"><Icon className="h-4 w-4 text-primary" /></div>
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );
}

function IssueCard({ issue, onOpen }: { issue: CockpitIssue; onOpen: (issue: CockpitIssue) => void }) {
  return (
    <button type="button" onClick={() => onOpen(issue)} className="w-full rounded-xl border border-border bg-background/70 p-3 text-left transition hover:border-primary/50 hover:bg-accent/30">
      <div className="flex items-start justify-between gap-2">
        <h4 className="line-clamp-2 text-sm font-medium leading-snug">{issue.title}</h4>
        {payloadExists(issue) && <span title="Payload available" className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-primary" />}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Badge className={priorityTone(issue.priority)}>{issue.priority}</Badge>
        <Badge className={statusTone(issue.status)}>{issue.status}</Badge>
      </div>
      <div className="mt-3 grid gap-1 text-xs text-muted-foreground">
        <span>Owner: {issue.currentOwner ?? "Unassigned"}</span>
        <span>Source: {issue.sourceSystem ?? "unknown"}</span>
        <span>Updated {ageLabel(issue.updatedAt)}</span>
      </div>
    </button>
  );
}

function IssueFlowBoard({ issues, ownerFilter, onOpen }: { issues: CockpitIssue[]; ownerFilter: string | null; onOpen: (issue: CockpitIssue) => void }) {
  const filtered = ownerFilter ? issues.filter((issue) => (issue.currentOwner ?? "").toLowerCase().includes(ownerFilter.toLowerCase())) : issues;
  return (
    <section id="issue-board" className="space-y-3">
      <SectionTitle icon={GitBranch} title="Issue Flow Board" subtitle={ownerFilter ? `Filtered by ${ownerFilter}` : "Kanban view of operational flow and intervention queues."} />
      <div className="grid gap-3 overflow-x-auto pb-2 xl:grid-cols-5 2xl:grid-cols-10">
        {BOARD_COLUMNS.map((column) => {
          const columnIssues = filtered.filter((issue) => boardColumnForIssue(issue) === column);
          return (
            <div key={column} className="min-w-64 rounded-2xl border border-border bg-card/70 p-3">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold">{column}</h3>
                <Badge className="border-border bg-muted/40 text-muted-foreground">{columnIssues.length}</Badge>
              </div>
              <div className="space-y-2">
                {columnIssues.length > 0 ? columnIssues.map((issue) => <IssueCard key={issue.id} issue={issue} onOpen={onOpen} />) : <p className="rounded-xl border border-dashed border-border p-3 text-xs text-muted-foreground">No issues</p>}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function PipelineSection<T extends { id: string; title: string; owner: string; status: string; lastUpdated: string; source: string }>(props: {
  id: string;
  title: string;
  subtitle: string;
  icon: ComponentType<{ className?: string }>;
  states: string[];
  items: T[];
  renderMeta: (item: T) => string;
}) {
  return (
    <section id={props.id} className="space-y-3">
      <SectionTitle icon={props.icon} title={props.title} subtitle={props.subtitle} />
      <div className="grid gap-3 lg:grid-cols-3 2xl:grid-cols-6">
        {props.states.map((state) => {
          const stateItems = props.items.filter((item) => item.status === state);
          return (
            <div key={state} className="rounded-2xl border border-border bg-card/70 p-3">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold">{state}</h3>
                <Badge className={statusTone(state)}>{stateItems.length}</Badge>
              </div>
              <div className="space-y-2">
                {stateItems.map((item) => (
                  <div key={item.id} className="rounded-xl border border-border bg-background/70 p-3">
                    <p className="text-sm font-medium leading-snug">{item.title}</p>
                    <p className="mt-2 text-xs text-muted-foreground">{props.renderMeta(item)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Source: {item.source}</p>
                  </div>
                ))}
                {stateItems.length === 0 && <p className="rounded-xl border border-dashed border-border p-3 text-xs text-muted-foreground">No items</p>}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function EventStream({ events }: { events: CockpitEventRow[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filters, setFilters] = useState<Record<string, string>>({ eventType: "", issueId: "", sourceSystem: "", from: "", to: "" });
  const filtered = events.filter((event) => {
    if (filters.eventType && !event.eventType.toLowerCase().includes(filters.eventType.toLowerCase())) return false;
    if (filters.issueId && !(event.issueId ?? "").toLowerCase().includes(filters.issueId.toLowerCase())) return false;
    if (filters.sourceSystem && !(event.sourceSystem ?? "").toLowerCase().includes(filters.sourceSystem.toLowerCase())) return false;
    if (filters.from && new Date(event.createdAt).getTime() < new Date(filters.from).getTime()) return false;
    if (filters.to && new Date(event.createdAt).getTime() > new Date(filters.to).getTime()) return false;
    return true;
  });
  return (
    <section id="event-log" className="space-y-3">
      <SectionTitle icon={RadioTower} title="Event Stream" subtitle="Audit-friendly event stream normalized from activity and heartbeat events." />
      <FilterBar filters={filters} setFilters={setFilters} />
      <LogTable emptyTitle="No events" emptyBody="Events will appear here as agents and board operators act." rows={filtered} expanded={expanded} setExpanded={setExpanded} />
    </section>
  );
}

function FilterBar({ filters, setFilters }: { filters: Record<string, string>; setFilters: (filters: Record<string, string>) => void }) {
  return (
    <div className="grid gap-2 rounded-2xl border border-border bg-card p-3 md:grid-cols-5">
      {Object.keys(filters).map((key) => (
        <input key={key} value={filters[key]} onChange={(event) => setFilters({ ...filters, [key]: event.target.value })} placeholder={key} type={key === "from" || key === "to" ? "date" : "text"} className="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-ring" />
      ))}
    </div>
  );
}

function LogTable({ rows, expanded, setExpanded, emptyTitle, emptyBody }: { rows: CockpitEventRow[]; expanded: string | null; setExpanded: (id: string | null) => void; emptyTitle: string; emptyBody: string }) {
  if (rows.length === 0) return <EmptyState title={emptyTitle} body={emptyBody} />;
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr><th className="px-3 py-2">created_at</th><th className="px-3 py-2">event_type</th><th className="px-3 py-2">issue_id</th><th className="px-3 py-2">source_system</th><th className="px-3 py-2">payload summary</th><th className="px-3 py-2">raw</th></tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-border/60 align-top last:border-0">
                <td className="px-3 py-2 text-xs text-muted-foreground">{dateLabel(row.createdAt)}</td>
                <td className="px-3 py-2"><Badge className={statusTone(row.eventType)}>{row.eventType}</Badge></td>
                <td className="px-3 py-2 font-mono text-xs">{row.issueId ?? "-"}</td>
                <td className="px-3 py-2 text-xs">{row.sourceSystem ?? "-"}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{row.payloadSummary}{expanded === row.id && <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-muted/50 p-3 text-[11px] text-foreground">{JSON.stringify(row.payload, null, 2)}</pre>}</td>
                <td className="px-3 py-2"><Button variant="ghost" size="xs" onClick={() => setExpanded(expanded === row.id ? null : row.id)}><ChevronDown className="h-3 w-3" />Raw</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RoutingLog({ rows }: { rows: CockpitRoutingDecisionRow[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  if (rows.length === 0) {
    return (
      <section id="routing-log" className="space-y-3">
        <SectionTitle icon={ShieldCheck} title="Routing Decisions Log" subtitle="Governance decisions and review outcomes." />
        <EmptyState title="No routing decisions" body="Issue execution decisions will appear here once review gates produce decisions." />
      </section>
    );
  }
  return (
    <section id="routing-log" className="space-y-3">
      <SectionTitle icon={ShieldCheck} title="Routing Decisions Log" subtitle="Governance decisions and review outcomes." />
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr><th className="px-3 py-2">created_at</th><th className="px-3 py-2">event_type</th><th className="px-3 py-2">action</th><th className="px-3 py-2">target_agent</th><th className="px-3 py-2">reason</th><th className="px-3 py-2">issue_id</th><th className="px-3 py-2">fields</th></tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-border/60 align-top last:border-0">
                  <td className="px-3 py-2 text-xs text-muted-foreground">{dateLabel(row.createdAt)}</td>
                  <td className="px-3 py-2 text-xs">{row.eventType ?? "-"}</td>
                  <td className="px-3 py-2"><Badge className={statusTone(row.action ?? "")}>{row.action ?? "-"}</Badge></td>
                  <td className="px-3 py-2 font-mono text-xs">{row.targetAgent ?? "-"}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{row.reason ?? "-"}{expanded === row.id && <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-muted/50 p-3 text-[11px] text-foreground">{JSON.stringify(row.fields, null, 2)}</pre>}</td>
                  <td className="px-3 py-2 font-mono text-xs">{row.issueId ?? "-"}</td>
                  <td className="px-3 py-2"><Button variant="ghost" size="xs" onClick={() => setExpanded(expanded === row.id ? null : row.id)}>Raw</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function IssueDrawer({ issue, events, routing, onClose, onAction }: { issue: CockpitIssue | null; events: CockpitEventRow[]; routing: CockpitRoutingDecisionRow[]; onClose: () => void; onAction: (action: string) => void }) {
  if (!issue) return null;
  const actions = ["Assign Owner", "Mark Blocked", "Mark Unblocked", "Send to QA", "Send to Boss Review", "Mark Close Candidate", "Close Issue", "Add Comment"];
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/45" onClick={onClose}>
      <aside className="h-full w-full max-w-3xl overflow-auto border-l border-border bg-background p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-xs uppercase tracking-wide text-muted-foreground">Issue detail</p><h2 className="mt-1 text-2xl font-semibold tracking-tight">{issue.title}</h2></div>
          <Button variant="ghost" size="icon-sm" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{issue.description || "No description provided."}</p>
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          {["status", "currentOwner", "priority", "sourceSystem", "sourceRef", "createdAt", "updatedAt"].map((key) => (
            <div key={key} className="rounded-xl border border-border bg-card p-3"><p className="text-[11px] uppercase tracking-wide text-muted-foreground">{key}</p><p className="mt-1 text-sm font-medium">{key.endsWith("At") ? dateLabel(issue[key as keyof CockpitIssue] as string) : String(issue[key as keyof CockpitIssue] ?? "-")}</p></div>
          ))}
        </div>
        <div className="mt-5 flex flex-wrap gap-2">{actions.map((action) => <Button key={action} variant={action === "Close Issue" ? "destructive" : "outline"} size="sm" onClick={() => onAction(action)}>{action}</Button>)}</div>
        <DrawerBlock title="Payload JSON"><pre>{JSON.stringify(issue.payload ?? {}, null, 2)}</pre></DrawerBlock>
        <DrawerBlock title="Related Events"><LogTable rows={events} expanded={null} setExpanded={() => undefined} emptyTitle="No related events" emptyBody="No event rows are currently linked to this issue." /></DrawerBlock>
        <DrawerBlock title="Related Routing Decisions"><RoutingLog rows={routing} /></DrawerBlock>
      </aside>
    </div>
  );
}

function DrawerBlock({ title, children }: { title: string; children: ReactNode }) {
  return <div className="mt-6 space-y-2"><h3 className="font-semibold">{title}</h3><div className="overflow-auto rounded-2xl border border-border bg-card p-3 text-xs">{children}</div></div>;
}

export function Cockpit() {
  const { selectedCompanyId } = useCompany();
  const { openNewIssue } = useDialog();
  const { pushToast } = useToastActions();
  const [ownerFilter, setOwnerFilter] = useState<string | null>(null);
  const [selectedIssue, setSelectedIssue] = useState<CockpitIssue | null>(null);
  const query = useQuery({
    queryKey: selectedCompanyId ? queryKeys.cockpit(selectedCompanyId) : ["cockpit", "none"],
    queryFn: () => cockpitApi.bootstrap(selectedCompanyId!),
    enabled: Boolean(selectedCompanyId),
  });
  const detailQuery = useQuery({
    queryKey: selectedCompanyId && selectedIssue ? ["cockpit", selectedCompanyId, "issue", selectedIssue.id] : ["cockpit", "issue", "none"],
    queryFn: () => cockpitApi.issueDetail(selectedCompanyId!, selectedIssue!.id),
    enabled: Boolean(selectedCompanyId && selectedIssue),
  });

  const data = query.data;
  const draftsInProgress = MOCK_DRAFTS.filter((draft) => draft.status === "Drafting").length;
  const contentPendingReview = MOCK_DRAFTS.filter((draft) => draft.status === "Needs Review").length;
  const selectedEvents = detailQuery.data?.events ?? [];
  const selectedRouting = detailQuery.data?.routingDecisions ?? [];
  const issueCount = data?.issues.length ?? 0;

  const quickActions = useMemo(() => [
    { label: "New Issue", onClick: () => openNewIssue() },
    { label: "New Brief", onClick: () => pushToast({ title: "Brief creation is stubbed", body: "TODO: wire New Brief to a briefs backend endpoint.", tone: "info" }) },
    { label: "New Draft", onClick: () => pushToast({ title: "Draft creation is stubbed", body: "TODO: wire New Draft to a drafts/content backend endpoint.", tone: "info" }) },
    { label: "Review Blocked", onClick: () => scrollToSection("issue-board") },
    { label: "Review Idle", onClick: () => scrollToSection("issue-board") },
    { label: "Review QA Queue", onClick: () => scrollToSection("issue-board") },
    { label: "Review Close Candidates", onClick: () => scrollToSection("issue-board") },
    { label: "Open Event Log", onClick: () => scrollToSection("event-log") },
    { label: "Open Routing Log", onClick: () => scrollToSection("routing-log") },
  ], [openNewIssue, pushToast]);

  if (!selectedCompanyId) return <EmptyState title="No company selected" body="Select a company to open the cockpit." />;
  if (query.isLoading) return <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">Loading cockpit...</div>;
  if (query.error || !data) return <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-sm text-red-200">Failed to load cockpit.</div>;

  function stubAction(action: string) {
    if (action === "Close Issue" && !window.confirm("Close issue action is currently stubbed. Continue to emit a toast only?")) return;
    pushToast({ title: `${action} queued as cockpit stub`, body: "TODO: emit a governed action/event once mutation endpoints exist.", tone: action === "Close Issue" ? "warn" : "info" });
  }

  return (
    <div className="space-y-8 pb-10">
      <div className="relative overflow-hidden rounded-3xl border border-border bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.22),transparent_32%),linear-gradient(135deg,rgba(15,23,42,0.92),rgba(2,6,23,0.78))] p-5 text-white shadow-xl dark:from-slate-950 md:p-6">
        <div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div><Badge className="border-white/20 bg-white/10 text-white">Paperclip Cockpit v1</Badge><h1 className="mt-4 text-3xl font-semibold tracking-tight md:text-4xl">Mission Control</h1><p className="mt-2 max-w-3xl text-sm text-white/70">Operational control plane for agent workflows, issue flow, briefs, drafts, customer activity, routing audit, and intervention queues.</p></div>
          <div className="grid grid-cols-3 gap-2 rounded-2xl border border-white/15 bg-white/10 p-3 text-center backdrop-blur"><MiniStat label="Issues" value={issueCount} /><MiniStat label="Events" value={data.events.length} /><MiniStat label="Routes" value={data.routingDecisions.length} /></div>
        </div>
      </div>

      <section className="space-y-3">
        <SectionTitle icon={Gauge} title="Mission Control Dashboard" subtitle="Executive overview first, with fast intervention buttons." />
        <MetricCards metrics={data.summary.metrics} draftCount={draftsInProgress} contentReviewCount={contentPendingReview} />
        <div className="flex flex-wrap gap-2 rounded-2xl border border-border bg-card p-3">{quickActions.map((action) => <Button key={action.label} variant="outline" size="sm" onClick={action.onClick}>{action.label}<ArrowRight className="h-3 w-3" /></Button>)}</div>
      </section>

      <AgentFlow agents={data.agents} onFilter={setOwnerFilter} />
      {ownerFilter && <Button variant="ghost" size="sm" onClick={() => setOwnerFilter(null)}>Clear owner filter: {ownerFilter}</Button>}
      <IssueFlowBoard issues={data.issues} ownerFilter={ownerFilter} onOpen={setSelectedIssue} />

      <section className="grid gap-6 2xl:grid-cols-2">
        <PipelineSection id="drafts" title="Drafts Section" subtitle="Adapter-ready mock content work. TODO: bind to drafts/content tables." icon={FileText} states={DRAFT_STATES} items={MOCK_DRAFTS} renderMeta={(draft) => `${draft.owner} | ${draft.contentType} | ${ageLabel(draft.lastUpdated)}`} />
        <PipelineSection id="briefs" title="Briefs Pipeline" subtitle="Adapter-ready mock brief flow. TODO: bind to briefs API." icon={ClipboardList} states={BRIEF_STATES} items={MOCK_BRIEFS} renderMeta={(brief) => `${brief.owner} | ${ageLabel(brief.lastUpdated)}`} />
      </section>

      <div className="flex flex-wrap gap-2 rounded-2xl border border-border bg-card p-3">
        <Button variant="outline" size="sm" onClick={() => pushToast({ title: "New Brief stub", body: "TODO: create brief endpoint and dialog.", tone: "info" })}><MessageSquarePlus className="h-4 w-4" />New Brief</Button>
        <Button variant="outline" size="sm" onClick={() => scrollToSection("briefs")}><Clock3 className="h-4 w-4" />Review Briefs</Button>
        <Button variant="outline" size="sm" onClick={() => pushToast({ title: "Convert Brief to Issue stub", body: "TODO: wire brief conversion to issue creation.", tone: "info" })}><CheckCircle2 className="h-4 w-4" />Convert Brief to Issue</Button>
      </div>

      <EventStream events={data.events} />
      <RoutingLog rows={data.routingDecisions} />

      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
        <div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 h-4 w-4" /><p>Mutation buttons are visible stubs by design. They show toasts and include TODOs until governed backend action/event endpoints exist.</p></div>
      </div>

      <IssueDrawer issue={selectedIssue} events={selectedEvents} routing={selectedRouting} onClose={() => setSelectedIssue(null)} onAction={stubAction} />
    </div>
  );
}

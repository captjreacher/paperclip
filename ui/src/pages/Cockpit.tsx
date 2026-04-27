import { useState, useMemo, useCallback } from "react";
import type { ComponentType, ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Clock3,
  FileText,
  FilterX,
  Gauge,
  GitBranch,
  MessageSquarePlus,
  RadioTower,
  RefreshCcw,
  Search,
  ShieldCheck,
  Sparkles,
  ToggleLeft,
  ToggleRight,
  X,
} from "lucide-react";
import type {
  CockpitAgentOverview,
  CockpitEventRow,
  CockpitIssue,
  CockpitIssueDetail,
  CockpitRoutingDecisionRow,
} from "@paperclipai/shared";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCompany } from "@/context/CompanyContext";
import { useToastActions } from "@/context/ToastContext";
import { cockpitApi } from "@/api/cockpit";
import { queryKeys } from "@/lib/queryKeys";
import { cn } from "@/lib/utils";
import { CockpitIssueModal } from "@/components/CockpitIssueModal";

type DraftState = "Drafting" | "Needs Review" | "Needs Design" | "Ready to Publish" | "Published" | "Needs Repurpose";
type BriefState = "Intake" | "Analysis" | "Draft Brief" | "Review" | "Approved" | "Converted to Work";
type IssueBoardFilterKey = "open" | "blocked" | "idle" | "qa" | "boss" | "close_candidates" | "recently_closed";

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

interface IssueBoardFilters {
  queue: IssueBoardFilterKey | null;
  owner: string | null;
  status: string | null;
}

interface AgentFilters {
  search: string;
  liveOnly: boolean;
  hasIssuesOnly: boolean;
  blockedOnly: boolean;
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
const OPEN_ISSUE_STATUSES = new Set(["backlog", "todo", "in_progress", "in_review", "blocked", "idle", "routed", "qa_review", "boss_review"]);
const MOCK_METRIC_KEYS = new Set(["drafts", "content_review"]);
const READ_ONLY_ACTIONS = [
  { label: "Queue owner request", action: "cockpit.todo.assign_owner_request" },
  { label: "Queue blocked note", action: "cockpit.todo.mark_blocked" },
  { label: "Queue unblock note", action: "cockpit.todo.mark_unblocked" },
  { label: "Queue QA request", action: "cockpit.todo.send_to_qa" },
  { label: "Queue boss review request", action: "cockpit.todo.send_to_boss_review" },
  { label: "Queue close-candidate review", action: "cockpit.todo.mark_close_candidate" },
  { label: "Queue close request", action: "cockpit.todo.close_issue" },
  { label: "Queue comment request", action: "cockpit.todo.add_comment" },
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

function describeError(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return "Unknown API error";
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

function normalizeOwner(value: string | null | undefined) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function isIdleIssue(issue: CockpitIssue) {
  const updatedAt = new Date(issue.updatedAt).getTime();
  return String(issue.status) === "idle" || ((issue.status === "backlog" || issue.status === "todo") && updatedAt < Date.now() - 3 * 24 * 60 * 60 * 1000);
}

function isQaIssue(issue: CockpitIssue) {
  return issue.status === "in_review" || String(issue.status) === "qa_review";
}

function isBossReviewIssue(issue: CockpitIssue) {
  const executionState = asRecord(issue.executionState);
  return String(issue.status) === "boss_review" || executionState?.currentStageType === "boss_review";
}

function isCloseCandidateIssue(issue: CockpitIssue) {
  return issue.status === "done" && new Date(issue.updatedAt).getTime() < Date.now() - 7 * 24 * 60 * 60 * 1000;
}

function isRecentlyClosedIssue(issue: CockpitIssue) {
  return ["done", "closed", "cancelled"].includes(String(issue.status)) && new Date(issue.updatedAt).getTime() >= Date.now() - 7 * 24 * 60 * 60 * 1000;
}

const ISSUE_FILTER_CONFIG: Record<IssueBoardFilterKey, { label: string; description: string; matches: (issue: CockpitIssue) => boolean }> = {
  open: {
    label: "Open issues",
    description: "All active non-terminal work across the board.",
    matches: (issue) => OPEN_ISSUE_STATUSES.has(String(issue.status)),
  },
  blocked: {
    label: "Blocked",
    description: "Issues waiting on an unblock or escalation.",
    matches: (issue) => String(issue.status) === "blocked",
  },
  idle: {
    label: "Idle",
    description: "Issues that are stale or explicitly marked idle.",
    matches: isIdleIssue,
  },
  qa: {
    label: "Awaiting QA",
    description: "Issues waiting on QA or review confirmation.",
    matches: isQaIssue,
  },
  boss: {
    label: "Awaiting boss review",
    description: "Issues currently paused in boss review.",
    matches: isBossReviewIssue,
  },
  close_candidates: {
    label: "Auto-close candidates",
    description: "Done issues old enough to review for auto-close.",
    matches: isCloseCandidateIssue,
  },
  recently_closed: {
    label: "Recently closed",
    description: "Recently completed or closed work.",
    matches: isRecentlyClosedIssue,
  },
};

function isIssueBoardFilterKey(value: string): value is IssueBoardFilterKey {
  return value in ISSUE_FILTER_CONFIG;
}

function focusSection(id: string) {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLElement)) return;
  element.scrollIntoView({ behavior: "smooth", block: "start" });
  window.setTimeout(() => {
    element.focus({ preventScroll: true });
  }, 250);
}

function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium", className)}>{children}</span>;
}

function SourceBadge({ label, tone = "live" }: { label: string; tone?: "live" | "mock" | "placeholder" | "muted" }) {
  const tones: Record<NonNullable<typeof tone>, string> = {
    live: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
    mock: "border-amber-500/30 bg-amber-500/10 text-amber-200",
    placeholder: "border-violet-500/30 bg-violet-500/10 text-violet-200",
    muted: "border-border bg-muted/40 text-muted-foreground",
  };

  return <Badge className={tones[tone]}>{label}</Badge>;
}

function boardColumnForIssue(issue: CockpitIssue) {
  const status = String(issue.status);
  const updatedAt = new Date(issue.updatedAt).getTime();
  const executionState = asRecord(issue.executionState);
  if (["closed", "cancelled"].includes(status)) return "Closed";
  if (status === "done" && updatedAt < Date.now() - 7 * 24 * 60 * 60 * 1000) return "Close Candidate";
  if (status === "done") return "Done";
  if (executionState?.currentStageType === "boss_review" || status === "boss_review") return "Boss Review";
  if (status === "in_review" || status === "qa_review") return "QA Review";
  if (status === "blocked") return "Blocked";
  if (isIdleIssue(issue)) return "Idle";
  if (status === "in_progress") return "In Progress";
  if (status === "todo" || (status === "backlog" && issue.currentOwner)) return "Routed";
  return "New";
}

function getFilteredIssues(issues: CockpitIssue[], filters: IssueBoardFilters) {
  return issues.filter((issue) => {
    if (filters.queue && !ISSUE_FILTER_CONFIG[filters.queue].matches(issue)) return false;
    if (filters.owner && normalizeOwner(issue.currentOwner) !== normalizeOwner(filters.owner)) return false;
    if (filters.status && String(issue.status) !== filters.status) return false;
    return true;
  });
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-muted/20 p-6 text-center">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{body}</p>
    </div>
  );
}

function ErrorPanel({ title, body, onRetry }: { title: string; body: string; onRetry?: () => void }) {
  return (
    <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-5 text-sm text-red-100">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-300" />
        <div className="space-y-3">
          <div>
            <p className="font-medium text-red-50">{title}</p>
            <p className="mt-1 text-xs text-red-200/90">{body}</p>
          </div>
          {onRetry ? (
            <Button variant="outline" size="sm" className="border-red-400/30 bg-red-950/20 text-red-50 hover:bg-red-900/30" onClick={onRetry}>
              <RefreshCcw className="h-3.5 w-3.5" />
              Retry
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function MetricCards({
  metrics,
  draftCount,
  contentReviewCount,
  activeFilter,
  onMetricSelect,
}: {
  metrics: { key: string; label: string; value: number; trendPlaceholder: string }[];
  draftCount: number;
  contentReviewCount: number;
  activeFilter: IssueBoardFilterKey | null;
  onMetricSelect: (filterKey: IssueBoardFilterKey) => void;
}) {
  const adjusted = metrics.map((metric) => {
    if (metric.key === "drafts") return { ...metric, value: draftCount };
    if (metric.key === "content_review") return { ...metric, value: contentReviewCount };
    return metric;
  });

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {adjusted.map((metric) => {
        const metricFilterKey: IssueBoardFilterKey | null = isIssueBoardFilterKey(metric.key) ? metric.key : null;
        const isClickable = metricFilterKey !== null;
        const isActive = metricFilterKey !== null && activeFilter === metricFilterKey;
        const isMockMetric = MOCK_METRIC_KEYS.has(metric.key);

        if (metricFilterKey) {
          return (
            <button
              key={metric.key}
              type="button"
              aria-pressed={isActive}
              onClick={() => onMetricSelect(metricFilterKey)}
              className={cn(
                "rounded-2xl border bg-card/80 p-4 text-left shadow-sm backdrop-blur transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                isActive
                  ? "border-primary bg-primary/10 shadow-primary/10"
                  : "border-border hover:border-primary/40 hover:bg-accent/30",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{metric.label}</p>
                <Sparkles className={cn("h-4 w-4", isActive ? "text-primary" : "text-primary/70")} />
              </div>
              <div className="mt-3 text-3xl font-semibold tracking-tight">{metric.value}</div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <p className="text-xs text-muted-foreground">{metric.trendPlaceholder}</p>
                <span className={cn("text-[11px] font-medium", isActive ? "text-primary" : "text-muted-foreground")}>
                  {isActive ? "Issue board filter active" : "Click to filter issue board"}
                </span>
              </div>
            </button>
          );
        }

        return (
          <div key={metric.key} className="rounded-2xl border border-border bg-card/80 p-4 shadow-sm backdrop-blur">
            <div className="flex items-start justify-between gap-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{metric.label}</p>
              <Sparkles className="h-4 w-4 text-primary/70" />
            </div>
            <div className="mt-3 text-3xl font-semibold tracking-tight">{metric.value}</div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <p className="text-xs text-muted-foreground">{metric.trendPlaceholder}</p>
              {isMockMetric ? <SourceBadge label="Mock / adapter pending" tone="mock" /> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AgentControls({
  filters,
  setFilters,
  agentCount,
  liveCount,
  placeholderCount,
}: {
  filters: AgentFilters;
  setFilters: (filters: AgentFilters) => void;
  agentCount: number;
  liveCount: number;
  placeholderCount: number;
}) {
  const hasActive = filters.search || filters.liveOnly || filters.hasIssuesOnly || filters.blockedOnly;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-3">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={filters.search}
          onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          placeholder="Search agents..."
          className="h-8 rounded-lg border border-input bg-background pl-7 pr-3 text-xs outline-none focus:border-ring"
        />
      </div>
      <Button
        variant={filters.liveOnly ? "default" : "outline"}
        size="xs"
        onClick={() => setFilters({ ...filters, liveOnly: !filters.liveOnly })}
      >
        {filters.liveOnly ? <ToggleRight className="h-3.5 w-3.5" /> : <ToggleLeft className="h-3.5 w-3.5" />}
        Live only
      </Button>
      <Button
        variant={filters.hasIssuesOnly ? "default" : "outline"}
        size="xs"
        onClick={() => setFilters({ ...filters, hasIssuesOnly: !filters.hasIssuesOnly })}
      >
        {filters.hasIssuesOnly ? <ToggleRight className="h-3.5 w-3.5" /> : <ToggleLeft className="h-3.5 w-3.5" />}
        Has issues
      </Button>
      <Button
        variant={filters.blockedOnly ? "default" : "outline"}
        size="xs"
        onClick={() => setFilters({ ...filters, blockedOnly: !filters.blockedOnly })}
      >
        {filters.blockedOnly ? <ToggleRight className="h-3.5 w-3.5" /> : <ToggleLeft className="h-3.5 w-3.5" />}
        Blocked
      </Button>
      {hasActive ? (
        <Button variant="ghost" size="xs" onClick={() => setFilters({ search: "", liveOnly: false, hasIssuesOnly: false, blockedOnly: false })}>
          <FilterX className="h-3.5 w-3.5" />
          Clear
        </Button>
      ) : null}
      <div className="ml-auto flex gap-1.5">
        <SourceBadge label={`${liveCount} live`} tone="live" />
        {placeholderCount > 0 ? <SourceBadge label={`${placeholderCount} placeholder`} tone="placeholder" /> : null}
      </div>
    </div>
  );
}

function SimpleAgentCard({
  agent,
  isSelected,
  onClick,
  onFilterByStatus,
}: {
  agent: CockpitAgentOverview;
  isSelected: boolean;
  onClick: () => void;
  onFilterByStatus: (status: string, count: number) => void;
}) {
  const isPlaceholder = !agent.id;
  const statusLabel = isPlaceholder ? "Placeholder" : "Live";
  const statusTone = isPlaceholder ? "placeholder" : "live";

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full rounded-xl border bg-card p-3 text-left transition hover:border-primary/40 hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
        isSelected ? "border-primary bg-primary/10 ring-2 ring-primary/30" : "border-border",
        isPlaceholder && "border-dashed border-violet-500/30 bg-violet-500/5",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-semibold truncate">{agent.name}</span>
            <Badge className={statusTone === "live" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : "border-violet-500/30 bg-violet-500/10 text-violet-200"}>
              {statusLabel}
            </Badge>
          </div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{agent.role}</p>
        </div>
        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground mt-0.5" />
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Badge className="border-blue-500/30 bg-blue-500/10 text-blue-200 text-[10px]">
          Active: {agent.activeIssues}
        </Badge>
        {agent.blockedIssues > 0 ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onFilterByStatus("blocked", agent.blockedIssues); }}
            className="rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-200 hover:bg-red-500/20"
          >
            Blocked: {agent.blockedIssues}
          </button>
        ) : null}
        {agent.awaitingReview > 0 ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onFilterByStatus("in_review", agent.awaitingReview); }}
            className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[10px] font-medium text-sky-200 hover:bg-sky-500/20"
          >
            Review: {agent.awaitingReview}
          </button>
        ) : null}
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground">Last: {dateLabel(agent.lastActivityAt)}</p>
    </button>
  );
}

function AgentFlow({
  agents,
  agentFilters,
  setAgentFilters,
  selectedOwner,
  onFilter,
  onFilterByStatus,
}: {
  agents: CockpitAgentOverview[];
  agentFilters: AgentFilters;
  setAgentFilters: (filters: AgentFilters) => void;
  selectedOwner: string | null;
  onFilter: (owner: string) => void;
  onFilterByStatus: (status: string, count: number) => void;
}) {
  const liveAgents = agents.filter((agent) => agent.id);
  const placeholderLanes = agents.length - liveAgents.length;

  const filtered = agents.filter((agent) => {
    if (agentFilters.liveOnly && !agent.id) return false;
    if (agentFilters.hasIssuesOnly && agent.activeIssues + agent.blockedIssues + agent.awaitingReview === 0) return false;
    if (agentFilters.blockedOnly && agent.blockedIssues === 0) return false;
    if (agentFilters.search && !agent.name.toLowerCase().includes(agentFilters.search.toLowerCase()) && !agent.role.toLowerCase().includes(agentFilters.search.toLowerCase())) return false;
    return true;
  });

  return (
    <section id="agent-flow" className="space-y-3">
      <SectionTitle icon={Bot} title="Agent Flow Overview" subtitle="Compact agent tiles. Click to filter issues by owner." />
      <AgentControls
        filters={agentFilters}
        setFilters={setAgentFilters}
        agentCount={agents.length}
        liveCount={liveAgents.length}
        placeholderCount={placeholderLanes}
      />
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {filtered.map((agent) => (
          <SimpleAgentCard
            key={`${agent.id ?? agent.name}`}
            agent={agent}
            isSelected={normalizeOwner(selectedOwner) === normalizeOwner(agent.name)}
            onClick={() => onFilter(agent.name)}
            onFilterByStatus={onFilterByStatus}
          />
        ))}
      </div>
      {filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">No agents match the current filters.</p>
      ) : null}
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

function IssueCard({ issue, onClick }: { issue: CockpitIssue; onClick: (issue: CockpitIssue) => void }) {
  return (
    <button
      type="button"
      onClick={() => onClick(issue)}
      className="w-full rounded-xl border border-border bg-background/70 p-3 text-left transition hover:border-primary/50 hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
      aria-label={`Open issue ${issue.title}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="line-clamp-2 text-sm font-medium leading-snug">{issue.title}</h4>
          {issue.identifier ? <p className="mt-1 font-mono text-[11px] text-muted-foreground">{issue.identifier}</p> : null}
        </div>
        {payloadExists(issue) ? <span title="Payload available" className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-primary" /> : null}
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        <Badge className={priorityTone(issue.priority)}>{issue.priority}</Badge>
        <Badge className={statusTone(String(issue.status))}>{String(issue.status)}</Badge>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
        <span>{issue.currentOwner ?? "Unassigned"}</span>
        <span>{dateLabel(issue.updatedAt)}</span>
      </div>
    </button>
  );
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <button
      type="button"
      onClick={onRemove}
      className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary transition hover:bg-primary/15"
    >
      {label}
      <X className="h-3 w-3" />
    </button>
  );
}

function IssueFlowBoard({
  issues,
  filters,
  onCardClick,
  onClearFilters,
  onRemoveQueueFilter,
  onRemoveOwnerFilter,
  onRemoveStatusFilter,
}: {
  issues: CockpitIssue[];
  filters: IssueBoardFilters;
  onCardClick: (issue: CockpitIssue) => void;
  onClearFilters: () => void;
  onRemoveQueueFilter: () => void;
  onRemoveOwnerFilter: () => void;
  onRemoveStatusFilter: () => void;
}) {
  const filtered = getFilteredIssues(issues, filters);
  const hasFilters = Boolean(filters.queue || filters.owner || filters.status);
  const subtitleBits = [
    filters.queue ? ISSUE_FILTER_CONFIG[filters.queue].label : null,
    filters.owner ? `Owner: ${filters.owner}` : null,
    filters.status ? `Status: ${filters.status}` : null,
  ].filter(Boolean);

  return (
    <section id="issue-board" tabIndex={-1} className="space-y-3 focus:outline-none">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <SectionTitle
          icon={GitBranch}
          title="Issue Flow Board"
          subtitle={subtitleBits.length > 0 ? `Filtered to ${subtitleBits.join(" · ")}` : "Kanban view of operational flow and intervention queues."}
        />
        <Badge className="border-border bg-muted/40 text-muted-foreground">
          Showing {filtered.length} of {issues.length}
        </Badge>
      </div>
      {hasFilters ? (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-3">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Active filters</span>
          {filters.queue ? <FilterChip label={ISSUE_FILTER_CONFIG[filters.queue].label} onRemove={onRemoveQueueFilter} /> : null}
          {filters.owner ? <FilterChip label={`Owner: ${filters.owner}`} onRemove={onRemoveOwnerFilter} /> : null}
          {filters.status ? <FilterChip label={`Status: ${filters.status}`} onRemove={onRemoveStatusFilter} /> : null}
          <Button variant="ghost" size="sm" onClick={onClearFilters}>
            Clear filters
          </Button>
        </div>
      ) : null}
      {issues.length === 0 ? (
        <EmptyState title="No issues loaded" body="This company does not have any cockpit-visible issues yet." />
      ) : filtered.length === 0 ? (
        <EmptyState title="No issues match the active filters" body="Try clearing one or more filters to inspect the full board again." />
      ) : (
        <div className="grid gap-3 overflow-x-auto pb-2 xl:grid-cols-5 2xl:grid-cols-10">
          {BOARD_COLUMNS.map((column) => {
            const columnIssues = filtered.filter((issue) => boardColumnForIssue(issue) === column);
            return (
              <div key={column} className="min-w-64 rounded-2xl border border-border bg-card/70 p-3">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">{column}</h3>
                  <Badge className="border-border bg-muted/40 text-muted-foreground">{columnIssues.length}</Badge>
                </div>
                <div className="space-y-2">
                  {columnIssues.length > 0 ? (
                    columnIssues.map((issue) => <IssueCard key={issue.id} issue={issue} onClick={onCardClick} />)
                  ) : (
                    <p className="rounded-xl border border-dashed border-border p-3 text-xs text-muted-foreground">No issues in this lane</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <SectionTitle icon={props.icon} title={props.title} subtitle={props.subtitle} />
        <SourceBadge label="Mock / adapter pending" tone="mock" />
      </div>
      <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-100/90">
        These cards use isolated mock data until the adapter-backed drafts and briefs endpoints land.
      </div>
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
                {stateItems.length === 0 ? <p className="rounded-xl border border-dashed border-border p-3 text-xs text-muted-foreground">No items</p> : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function EventStream({ events }: { events: CockpitEventRow[] }) {
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
    <section id="event-log" tabIndex={-1} className="space-y-3 focus:outline-none">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <SectionTitle icon={RadioTower} title="Event Stream" subtitle="Audit-friendly event stream normalized from activity and heartbeat events." />
        <SourceBadge label="Live backend data" tone="live" />
      </div>
      <FilterBar filters={filters} setFilters={setFilters} />
      <EventTable emptyTitle="No events" emptyBody="Events will appear here as agents and board operators act." rows={filtered} />
    </section>
  );
}

function FilterBar({ filters, setFilters }: { filters: Record<string, string>; setFilters: (filters: Record<string, string>) => void }) {
  const hasFilters = Object.values(filters).some(Boolean);

  return (
    <div className="grid gap-2 rounded-2xl border border-border bg-card p-3 md:grid-cols-[repeat(5,minmax(0,1fr))_auto]">
      {Object.keys(filters).map((key) => (
        <input
          key={key}
          value={filters[key]}
          onChange={(event) => setFilters({ ...filters, [key]: event.target.value })}
          placeholder={key}
          type={key === "from" || key === "to" ? "date" : "text"}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-ring"
        />
      ))}
      <Button variant="ghost" size="sm" disabled={!hasFilters} onClick={() => setFilters({ eventType: "", issueId: "", sourceSystem: "", from: "", to: "" })}>
        Clear
      </Button>
    </div>
  );
}

function EventTable({ rows, emptyTitle, emptyBody }: { rows: CockpitEventRow[]; emptyTitle: string; emptyBody: string }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (rows.length === 0) return <EmptyState title={emptyTitle} body={emptyBody} />;

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2">created_at</th>
              <th className="px-3 py-2">event_type</th>
              <th className="px-3 py-2">issue_id</th>
              <th className="px-3 py-2">source_system</th>
              <th className="px-3 py-2">payload summary</th>
              <th className="px-3 py-2">raw</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-border/60 align-top last:border-0">
                <td className="px-3 py-2 text-xs text-muted-foreground">{dateLabel(row.createdAt)}</td>
                <td className="px-3 py-2"><Badge className={statusTone(row.eventType)}>{row.eventType}</Badge></td>
                <td className="px-3 py-2 font-mono text-xs">{row.issueId ?? "-"}</td>
                <td className="px-3 py-2 text-xs">{row.sourceSystem ?? "-"}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {row.payloadSummary}
                  {expanded === row.id ? <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-muted/50 p-3 text-[11px] text-foreground">{JSON.stringify(row.payload, null, 2)}</pre> : null}
                </td>
                <td className="px-3 py-2">
                  <Button variant="ghost" size="xs" onClick={() => setExpanded(expanded === row.id ? null : row.id)}>
                    <ChevronDown className="h-3 w-3" />
                    Raw
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RoutingLog({ rows }: { rows: CockpitRoutingDecisionRow[] }) {
  return (
    <section id="routing-log" tabIndex={-1} className="space-y-3 focus:outline-none">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <SectionTitle icon={ShieldCheck} title="Routing Decisions Log" subtitle="Governance decisions and review outcomes." />
        <SourceBadge label="Live backend data" tone="live" />
      </div>
      <RoutingTable rows={rows} emptyTitle="No routing decisions" emptyBody="Issue execution decisions will appear here once review gates produce decisions." />
    </section>
  );
}

function RoutingTable({ rows, emptyTitle, emptyBody }: { rows: CockpitRoutingDecisionRow[]; emptyTitle: string; emptyBody: string }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (rows.length === 0) return <EmptyState title={emptyTitle} body={emptyBody} />;

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2">created_at</th>
              <th className="px-3 py-2">event_type</th>
              <th className="px-3 py-2">action</th>
              <th className="px-3 py-2">target_agent</th>
              <th className="px-3 py-2">reason</th>
              <th className="px-3 py-2">issue_id</th>
              <th className="px-3 py-2">fields</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-border/60 align-top last:border-0">
                <td className="px-3 py-2 text-xs text-muted-foreground">{dateLabel(row.createdAt)}</td>
                <td className="px-3 py-2 text-xs">{row.eventType ?? "-"}</td>
                <td className="px-3 py-2"><Badge className={statusTone(row.action ?? "")}>{row.action ?? "-"}</Badge></td>
                <td className="px-3 py-2 font-mono text-xs">{row.targetAgent ?? "-"}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {row.reason ?? "-"}
                  {expanded === row.id ? <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-muted/50 p-3 text-[11px] text-foreground">{JSON.stringify(row.fields, null, 2)}</pre> : null}
                </td>
                <td className="px-3 py-2 font-mono text-xs">{row.issueId ?? "-"}</td>
                <td className="px-3 py-2">
                  <Button variant="ghost" size="xs" onClick={() => setExpanded(expanded === row.id ? null : row.id)}>
                    Raw
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// IssueDrawer, IssueDetailFields, and DrawerBlock removed - replaced by CockpitIssueModal

function CockpitLoadingSkeleton() {
  return (
    <div className="space-y-8 pb-10">
      <div className="rounded-3xl border border-border bg-card p-6">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="mt-4 h-10 w-72" />
        <Skeleton className="mt-3 h-4 w-full max-w-3xl" />
        <div className="mt-5 grid grid-cols-3 gap-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      </div>

      <section className="space-y-3">
        <Skeleton className="h-7 w-72" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 10 }).map((_, index) => <Skeleton key={index} className="h-32 w-full rounded-2xl" />)}
        </div>
        <Skeleton className="h-14 w-full rounded-2xl" />
      </section>

      <section className="space-y-3">
        <Skeleton className="h-7 w-60" />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-40 w-full rounded-2xl" />)}
        </div>
      </section>

      <section className="space-y-3">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-14 w-full rounded-2xl" />
        <div className="grid gap-3 xl:grid-cols-5 2xl:grid-cols-10">
          {Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-80 w-full rounded-2xl" />)}
        </div>
      </section>

      <section className="space-y-3">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </section>

      <section className="space-y-3">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </section>
    </div>
  );
}

export function Cockpit() {
  const { selectedCompanyId } = useCompany();
  const { pushToast } = useToastActions();
  const queryClient = useQueryClient();
  const [issueFilters, setIssueFilters] = useState<IssueBoardFilters>({ queue: null, owner: null, status: null });
  const [agentFilters, setAgentFilters] = useState<AgentFilters>({ search: "", liveOnly: false, hasIssuesOnly: false, blockedOnly: false });
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

  const actionMutation = useMutation({
    mutationFn: ({ issueId, action, label }: { issueId: string; action: string; label: string }) =>
      cockpitApi.issueAction(selectedCompanyId!, issueId, action).then(() => ({ action, label })),
    onSuccess: ({ action, label }) => {
      if (selectedCompanyId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.cockpit(selectedCompanyId) });
        if (selectedIssue) {
          queryClient.invalidateQueries({ queryKey: ["cockpit", selectedCompanyId, "issue", selectedIssue.id] });
        }
      }
      pushToast({
        title: `${label} queued`,
        body: `${action} was accepted as a TODO activity event. Cockpit did not mutate the issue directly.`,
        tone: "info",
      });
    },
    onError: (error) => {
      pushToast({ title: "Action failed", body: describeError(error), tone: "warn" });
    },
  });

  const data = query.data;
  const draftsInProgress = MOCK_DRAFTS.filter((draft) => draft.status === "Drafting").length;
  const contentPendingReview = MOCK_DRAFTS.filter((draft) => draft.status === "Needs Review").length;
  const issueCount = data?.issues.length ?? 0;
  const liveAgentCount = data?.agents.filter((agent) => agent.id).length ?? 0;
  const placeholderLaneCount = (data?.agents.length ?? 0) - liveAgentCount;

  const filteredIssues = useMemo(() => {
    return data ? getFilteredIssues(data.issues, issueFilters) : [];
  }, [data, issueFilters]);

  function setQueueFilter(filterKey: IssueBoardFilterKey) {
    setIssueFilters((current) => ({ ...current, queue: filterKey, status: null }));
    focusSection("issue-board");
  }

  function setOwnerFilter(owner: string) {
    setIssueFilters((current) => ({ ...current, owner, queue: null, status: null }));
    focusSection("issue-board");
  }

  function setStatusFilter(status: string) {
    setIssueFilters((current) => ({ ...current, status, queue: null }));
    focusSection("issue-board");
  }

  function clearFilters() {
    setIssueFilters({ queue: null, owner: null, status: null });
  }

  function handleIssueClick(issue: CockpitIssue) {
    setSelectedIssue(issue);
  }

  function handleCloseModal() {
    setSelectedIssue(null);
  }

  function handleNavigateIssue(issue: CockpitIssue) {
    setSelectedIssue(issue);
  }

  function handleReadOnlyAction(action: string, label: string) {
    if (!selectedIssue || !selectedCompanyId) return;
    actionMutation.mutate({ issueId: selectedIssue.id, action, label });
  }

  const quickActions = [
    {
      label: "New Issue",
      onClick: () => pushToast({ title: "Read-only cockpit", body: "TODO: keep issue creation in the dedicated issue flow instead of mutating from Cockpit.", tone: "info" }),
    },
    {
      label: "New Brief",
      onClick: () => pushToast({ title: "Brief creation is stubbed", body: "TODO: wire New Brief to a briefs backend endpoint.", tone: "info" }),
    },
    {
      label: "New Draft",
      onClick: () => pushToast({ title: "Draft creation is stubbed", body: "TODO: wire New Draft to a drafts/content backend endpoint.", tone: "info" }),
    },
    { label: "Review Blocked", onClick: () => setQueueFilter("blocked") },
    { label: "Review Idle", onClick: () => setQueueFilter("idle") },
    { label: "Review QA Queue", onClick: () => setQueueFilter("qa") },
    { label: "Review Close Candidates", onClick: () => setQueueFilter("close_candidates") },
    { label: "Open Event Log", onClick: () => focusSection("event-log") },
    { label: "Open Routing Log", onClick: () => focusSection("routing-log") },
  ];

  if (!selectedCompanyId) return <EmptyState title="No company selected" body="Select a company to open the cockpit." />;
  if (query.isLoading) return <CockpitLoadingSkeleton />;
  if (query.error || !data) {
    return (
      <ErrorPanel
        title="Failed to load Cockpit"
        body={`${query.error ? describeError(query.error) : "Cockpit bootstrap did not return data."} Retry the backend bootstrap request or verify the API server is healthy for this company.`}
        onRetry={() => void query.refetch()}
      />
    );
  }

  return (
    <div className="space-y-8 pb-10">
      <div className="relative overflow-hidden rounded-3xl border border-border bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.22),transparent_32%),linear-gradient(135deg,rgba(15,23,42,0.92),rgba(2,6,23,0.78))] p-5 text-white shadow-xl dark:from-slate-950 md:p-6">
        <div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="border-white/20 bg-white/10 text-white">Paperclip Cockpit v1</Badge>
              <SourceBadge label="Dashboard source: backend bootstrap" tone="live" />
              {placeholderLaneCount > 0 ? <SourceBadge label={`${placeholderLaneCount} placeholder lane${placeholderLaneCount === 1 ? "" : "s"}`} tone="placeholder" /> : null}
              <SourceBadge label="Drafts / briefs: mock / adapter pending" tone="mock" />
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight md:text-4xl">Mission Control</h1>
            <p className="mt-2 max-w-3xl text-sm text-white/70">
              Practical read-only operational console for issue flow, agent load, event audit, routing review, and clearly marked mock adapter surfaces.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 rounded-2xl border border-white/15 bg-white/10 p-3 text-center backdrop-blur">
            <MiniStat label="Issues" value={issueCount} />
            <MiniStat label="Events" value={data.events.length} />
            <MiniStat label="Routes" value={data.routingDecisions.length} />
          </div>
        </div>
      </div>

      <section className="space-y-3">
        <SectionTitle icon={Gauge} title="Mission Control Dashboard" subtitle="Executive overview first. Live issue data is filterable; mock content cards stay clearly labeled." />
        <MetricCards
          metrics={data.summary.metrics}
          draftCount={draftsInProgress}
          contentReviewCount={contentPendingReview}
          activeFilter={issueFilters.queue}
          onMetricSelect={setQueueFilter}
        />
        <div className="flex flex-wrap gap-2 rounded-2xl border border-border bg-card p-3">
          {quickActions.map((action) => (
            <Button key={action.label} variant="outline" size="sm" onClick={action.onClick}>
              {action.label}
              <ArrowRight className="h-3 w-3" />
            </Button>
          ))}
        </div>
      </section>

      <AgentFlow
        agents={data.agents}
        agentFilters={agentFilters}
        setAgentFilters={setAgentFilters}
        selectedOwner={issueFilters.owner}
        onFilter={setOwnerFilter}
        onFilterByStatus={setStatusFilter}
      />

      <IssueFlowBoard
        issues={data.issues}
        filters={issueFilters}
        onCardClick={handleIssueClick}
        onClearFilters={clearFilters}
        onRemoveQueueFilter={() => setIssueFilters((current) => ({ ...current, queue: null }))}
        onRemoveOwnerFilter={() => setIssueFilters((current) => ({ ...current, owner: null }))}
        onRemoveStatusFilter={() => setIssueFilters((current) => ({ ...current, status: null }))}
      />

      <section className="grid gap-6 2xl:grid-cols-2">
        <PipelineSection
          id="drafts"
          title="Drafts Section"
          subtitle="Adapter-ready placeholder content work. Explicitly mock for v1 until adapter integration lands."
          icon={FileText}
          states={DRAFT_STATES}
          items={MOCK_DRAFTS}
          renderMeta={(draft) => `${draft.owner} | ${draft.contentType} | ${ageLabel(draft.lastUpdated)}`}
        />
        <PipelineSection
          id="briefs"
          title="Briefs Pipeline"
          subtitle="Adapter-ready placeholder brief flow. Explicitly mock for v1 until briefs APIs exist."
          icon={ClipboardList}
          states={BRIEF_STATES}
          items={MOCK_BRIEFS}
          renderMeta={(brief) => `${brief.owner} | ${ageLabel(brief.lastUpdated)}`}
        />
      </section>

      <div className="flex flex-wrap gap-2 rounded-2xl border border-border bg-card p-3">
        <Button variant="outline" size="sm" onClick={() => pushToast({ title: "New Brief stub", body: "TODO: create brief endpoint and dialog.", tone: "info" })}>
          <MessageSquarePlus className="h-4 w-4" />
          New Brief
        </Button>
        <Button variant="outline" size="sm" onClick={() => focusSection("briefs")}>
          <Clock3 className="h-4 w-4" />
          Review Briefs
        </Button>
        <Button variant="outline" size="sm" onClick={() => pushToast({ title: "Convert Brief to Issue stub", body: "TODO: wire brief conversion to issue creation.", tone: "info" })}>
          <CheckCircle2 className="h-4 w-4" />
          Convert Brief to Issue
        </Button>
      </div>

      <EventStream events={data.events} />
      <RoutingLog rows={data.routingDecisions} />

      <div className="rounded-2xl border border-sky-500/30 bg-sky-500/10 p-4 text-sm text-sky-100">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 text-sky-400" />
          <p>
            Live issues, events, routing decisions, and registered agents come from the company-scoped backend bootstrap. Drafts, briefs, and placeholder lanes remain explicitly mocked until their adapters exist.
          </p>
        </div>
      </div>

      {selectedIssue ? (
        <CockpitIssueModal
          issue={selectedIssue}
          detail={detailQuery.data}
          isLoading={detailQuery.isLoading || detailQuery.isFetching}
          isError={detailQuery.isError}
          errorMessage={detailQuery.error ? describeError(detailQuery.error) : null}
          allIssues={filteredIssues}
          onClose={handleCloseModal}
          onNavigate={handleNavigateIssue}
          onRetry={() => void detailQuery.refetch()}
          onAction={handleReadOnlyAction}
          actionPending={actionMutation.isPending}
        />
      ) : null}
    </div>
  );
}

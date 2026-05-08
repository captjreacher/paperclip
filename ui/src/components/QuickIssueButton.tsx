import { useMemo, useState, type FormEvent } from "react";
import { Plus, Loader2 } from "lucide-react";
import type { Agent } from "@paperclipai/shared";
import { issuesApi } from "@/api/issues";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCompany } from "@/context/CompanyContext";
import { useToastActions } from "@/context/ToastContext";
import { queryKeys } from "@/lib/queryKeys";
import { useMutation, useQueryClient } from "@tanstack/react-query";

const ISSUE_TYPES = ["bug", "task", "content", "lead", "incident", "workflow"] as const;
const DISPLAY_PRIORITIES = ["low", "normal", "high", "urgent"] as const;

type QuickIssueType = (typeof ISSUE_TYPES)[number];
type DisplayPriority = (typeof DISPLAY_PRIORITIES)[number];

const priorityMap: Record<DisplayPriority, "low" | "medium" | "high" | "critical"> = {
  low: "low",
  normal: "medium",
  high: "high",
  urgent: "critical",
};

interface QuickIssueButtonProps {
  agents?: Agent[];
  buttonLabel?: string;
  variant?: "default" | "outline" | "secondary" | "ghost";
  size?: "default" | "sm" | "xs";
  onCreated?: () => void;
}

function fieldClassName() {
  return "h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-ring";
}

export function QuickIssueButton({
  agents = [],
  buttonLabel = "+ Issue",
  variant = "outline",
  size = "sm",
  onCreated,
}: QuickIssueButtonProps) {
  const { selectedCompanyId, selectedCompany, companies } = useCompany();
  const { pushToast } = useToastActions();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [type, setType] = useState<QuickIssueType>("task");
  const [priority, setPriority] = useState<DisplayPriority>("normal");
  const [assignedTarget, setAssignedTarget] = useState("workflow");
  const [description, setDescription] = useState("");
  const [titleTouched, setTitleTouched] = useState(false);

  const agentOptions = useMemo(
    () => agents.filter((agent) => agent.status !== "terminated").sort((a, b) => a.name.localeCompare(b.name)),
    [agents],
  );

  const createIssue = useMutation({
    mutationFn: async () => {
      if (!selectedCompanyId) throw new Error("No company selected");
      const selectedAgentId = assignedTarget.startsWith("agent:") ? assignedTarget.slice("agent:".length) : "";
      const selectedAgent = selectedAgentId ? agentOptions.find((agent) => agent.id === selectedAgentId) : null;
      return issuesApi.create(selectedCompanyId, {
        title: title.trim(),
        description: description.trim() || undefined,
        status: "todo",
        priority: priorityMap[priority],
        ...(selectedAgentId ? { assigneeAgentId: selectedAgentId } : {}),
        sourceSystem: "cockpit",
        issueType: type,
        assignedTarget: selectedAgent?.name ?? "workflow",
        displayPriority: priority,
      });
    },
    onSuccess: (issue) => {
      if (!selectedCompanyId) return;
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(selectedCompanyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.listMineByMe(selectedCompanyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.listTouchedByMe(selectedCompanyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.listUnreadTouchedByMe(selectedCompanyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.activity(selectedCompanyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(selectedCompanyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.cockpit(selectedCompanyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.sidebarBadges(selectedCompanyId) });
      onCreated?.();

      const company = selectedCompany ?? companies.find((entry) => entry.id === selectedCompanyId);
      const issueRef = issue.identifier ?? issue.id;
      pushToast({
        title: `Created ${issueRef}`,
        body: "The issue is now in Paperclip.",
        tone: "success",
        action: company?.issuePrefix ? { label: "Open Issue", href: `/${company.issuePrefix}/issues/${issueRef}` } : undefined,
      });

      setTitle("");
      setType("task");
      setPriority("normal");
      setAssignedTarget("workflow");
      setDescription("");
      setTitleTouched(false);
      setOpen(false);
    },
    onError: (error) => {
      pushToast({
        title: "Issue creation failed",
        body: error instanceof Error ? error.message : "Paperclip could not create the issue.",
        tone: "error",
      });
    },
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setTitleTouched(true);
    if (!title.trim() || createIssue.isPending) return;
    createIssue.mutate();
  }

  const titleError = titleTouched && !title.trim();

  return (
    <>
      <Button variant={variant} size={size} onClick={() => setOpen(true)} disabled={!selectedCompanyId}>
        <Plus className="h-4 w-4" />
        {buttonLabel}
      </Button>
      <Dialog open={open} onOpenChange={(next) => !createIssue.isPending && setOpen(next)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Issue</DialogTitle>
            <DialogDescription>Raise a Paperclip issue from the dashboard.</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="quick-issue-title">
                Title
              </label>
              <input
                id="quick-issue-title"
                className={fieldClassName()}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                onBlur={() => setTitleTouched(true)}
                aria-invalid={titleError}
                autoFocus
              />
              {titleError ? <p className="text-xs text-destructive">Title is required.</p> : null}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="quick-issue-type">
                  Type
                </label>
                <select id="quick-issue-type" className={fieldClassName()} value={type} onChange={(event) => setType(event.target.value as QuickIssueType)}>
                  {ISSUE_TYPES.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="quick-issue-priority">
                  Priority
                </label>
                <select id="quick-issue-priority" className={fieldClassName()} value={priority} onChange={(event) => setPriority(event.target.value as DisplayPriority)}>
                  {DISPLAY_PRIORITIES.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="quick-issue-target">
                Assigned target
              </label>
              <select id="quick-issue-target" className={fieldClassName()} value={assignedTarget} onChange={(event) => setAssignedTarget(event.target.value)}>
                <option value="workflow">workflow</option>
                {agentOptions.map((agent) => (
                  <option key={agent.id} value={`agent:${agent.id}`}>{agent.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="quick-issue-description">
                Description
              </label>
              <textarea
                id="quick-issue-description"
                className="min-h-24 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" disabled={createIssue.isPending} onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!title.trim() || createIssue.isPending}>
                {createIssue.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Create Issue
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

import { Router } from "express";
import { and, desc, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import {
  activityLog,
  agents,
  heartbeatRunEvents,
  issueExecutionDecisions,
  issues,
} from "@paperclipai/db";
import type {
  CockpitAgentOverview,
  CockpitEventRow,
  CockpitIssue,
  CockpitMetric,
  CockpitRoutingDecisionRow,
} from "@paperclipai/shared";
import { z } from "zod";
import { assertCompanyAccess, getActorInfo } from "./authz.js";
import { validate } from "../middleware/validate.js";
import { activityService } from "../services/activity.js";

const AGENT_FLOW_NAMES = [
  "CEO",
  "CTO",
  "Workflow",
  "Service Desk",
  "Business Analyst",
  "Designer",
  "Editor",
  "Writer",
  "Customer Support",
] as const;

const OPEN_STATUSES = new Set(["backlog", "todo", "in_progress", "in_review", "blocked", "idle", "routed"]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function daysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

function summarizePayload(payload: Record<string, unknown> | null) {
  if (!payload) return "No payload";
  const keys = Object.keys(payload).slice(0, 4);
  if (keys.length === 0) return "Empty payload";
  return keys.map((key) => `${key}: ${String(payload[key]).slice(0, 48)}`).join(" | ");
}

function issuePayload(issue: typeof issues.$inferSelect): Record<string, unknown> | null {
  return {
    originKind: issue.originKind,
    originId: issue.originId,
    originRunId: issue.originRunId,
    requestDepth: issue.requestDepth,
    billingCode: issue.billingCode,
    assigneeAdapterOverrides: issue.assigneeAdapterOverrides ?? null,
    executionPolicy: issue.executionPolicy ?? null,
    executionState: issue.executionState ?? null,
    executionWorkspacePreference: issue.executionWorkspacePreference ?? null,
    executionWorkspaceSettings: issue.executionWorkspaceSettings ?? null,
  };
}

function toCockpitIssue(
  issue: typeof issues.$inferSelect,
  agentById: Map<string, typeof agents.$inferSelect>,
): CockpitIssue {
  const owner = issue.assigneeAgentId ? agentById.get(issue.assigneeAgentId) : null;
  return {
    ...issue,
    currentOwner: owner?.name ?? issue.assigneeUserId ?? issue.executionAgentNameKey ?? null,
    sourceSystem: issue.originKind ?? "manual",
    sourceRef: issue.originId ?? issue.originRunId ?? issue.identifier ?? null,
    payload: issuePayload(issue),
  } as unknown as CockpitIssue;
}

function countIssues(issueRows: CockpitIssue[], predicate: (issue: CockpitIssue) => boolean) {
  return issueRows.filter(predicate).length;
}

function buildMetrics(issueRows: CockpitIssue[], routingRows: CockpitRoutingDecisionRow[]): CockpitMetric[] {
  const staleCutoff = daysAgo(3).getTime();
  const recentCutoff = daysAgo(7).getTime();
  const isOpen = (issue: CockpitIssue) => OPEN_STATUSES.has(issue.status);
  const isIdle = (issue: CockpitIssue) => {
    const updatedAt = new Date(issue.updatedAt).getTime();
    return (issue.status as string) === "idle" || ((issue.status === "backlog" || issue.status === "todo") && updatedAt < staleCutoff);
  };
  const awaitingBossReview = (issue: CockpitIssue) => {
    const executionState = asRecord(issue.executionState);
    return (issue.status as string) === "boss_review" || executionState?.currentStageType === "boss_review";
  };

  return [
    { key: "open", label: "Open Issues", value: countIssues(issueRows, isOpen), trendPlaceholder: "trend pending" },
    { key: "blocked", label: "Blocked", value: countIssues(issueRows, (issue) => issue.status === "blocked"), trendPlaceholder: "trend pending" },
    { key: "idle", label: "Idle", value: countIssues(issueRows, isIdle), trendPlaceholder: "trend pending" },
    { key: "qa", label: "Awaiting QA", value: countIssues(issueRows, (issue) => issue.status === "in_review" || (issue.status as string) === "qa_review"), trendPlaceholder: "trend pending" },
    { key: "boss", label: "Awaiting Boss Review", value: countIssues(issueRows, awaitingBossReview), trendPlaceholder: "trend pending" },
    { key: "close_candidates", label: "Auto-close Candidates", value: countIssues(issueRows, (issue) => issue.status === "done" && new Date(issue.updatedAt).getTime() < recentCutoff), trendPlaceholder: "trend pending" },
    { key: "drafts", label: "Drafts in Progress", value: 0, trendPlaceholder: "mock adapter" },
    { key: "content_review", label: "Content Pending Review", value: 0, trendPlaceholder: "mock adapter" },
    { key: "escalations", label: "Agent Escalations", value: countIssues(issueRows, (issue) => issue.status === "blocked") + routingRows.length, trendPlaceholder: "trend pending" },
    { key: "recently_closed", label: "Recently Closed", value: countIssues(issueRows, (issue) => ["done", "closed", "cancelled"].includes(issue.status) && new Date(issue.updatedAt).getTime() >= recentCutoff), trendPlaceholder: "trend pending" },
  ];
}

export function cockpitRoutes(db: Db) {
  const router = Router();

  async function loadAgents(companyId: string) {
    return db
      .select()
      .from(agents)
      .where(eq(agents.companyId, companyId))
      .orderBy(agents.name);
  }

  async function loadIssues(companyId: string) {
    const agentRows = await loadAgents(companyId);
    const agentById = new Map(agentRows.map((agent) => [agent.id, agent]));
    const issueRows = await db
      .select()
      .from(issues)
      .where(and(eq(issues.companyId, companyId), isNull(issues.hiddenAt)))
      .orderBy(desc(issues.updatedAt))
      .limit(300);

    return {
      rawAgents: agentRows,
      issues: issueRows.map((issue) => toCockpitIssue(issue, agentById)),
    };
  }

  async function loadEvents(companyId: string, filters: {
    issueId?: string;
    eventType?: string;
    sourceSystem?: string;
    from?: string;
    to?: string;
    limit?: number;
  } = {}): Promise<CockpitEventRow[]> {
    const limit = Math.min(Math.max(Number(filters.limit ?? 100), 1), 300);
    const activityConditions = [eq(activityLog.companyId, companyId)];
    if (filters.issueId) {
      activityConditions.push(eq(activityLog.entityType, "issue"));
      activityConditions.push(eq(activityLog.entityId, filters.issueId));
    }
    if (filters.eventType) activityConditions.push(eq(activityLog.action, filters.eventType));
    if (filters.sourceSystem) activityConditions.push(eq(activityLog.actorType, filters.sourceSystem));
    if (filters.from) activityConditions.push(gte(activityLog.createdAt, new Date(filters.from)));
    if (filters.to) activityConditions.push(lte(activityLog.createdAt, new Date(filters.to)));

    const activityRows = await db
      .select()
      .from(activityLog)
      .where(and(...activityConditions))
      .orderBy(desc(activityLog.createdAt))
      .limit(limit);

    const heartbeatConditions = [eq(heartbeatRunEvents.companyId, companyId)];
    if (filters.issueId) {
      heartbeatConditions.push(
        or(
          sql`${heartbeatRunEvents.payload} ->> 'issueId' = ${filters.issueId}`,
          sql`${heartbeatRunEvents.payload} ->> 'issue_id' = ${filters.issueId}`,
        )!,
      );
    }
    if (filters.eventType) heartbeatConditions.push(eq(heartbeatRunEvents.eventType, filters.eventType));
    if (filters.sourceSystem) heartbeatConditions.push(sql`'heartbeat' = ${filters.sourceSystem}`);
    if (filters.from) heartbeatConditions.push(gte(heartbeatRunEvents.createdAt, new Date(filters.from)));
    if (filters.to) heartbeatConditions.push(lte(heartbeatRunEvents.createdAt, new Date(filters.to)));

    const heartbeatRows = await db
      .select()
      .from(heartbeatRunEvents)
      .where(and(...heartbeatConditions))
      .orderBy(desc(heartbeatRunEvents.createdAt))
      .limit(limit);

    return [
      ...activityRows.map((row): CockpitEventRow => {
        const payload = {
          actorType: row.actorType,
          actorId: row.actorId,
          entityType: row.entityType,
          entityId: row.entityId,
          agentId: row.agentId,
          runId: row.runId,
          details: row.details ?? null,
        };
        const issueId = row.entityType === "issue" ? row.entityId : asRecord(row.details)?.issueId;
        return {
          id: row.id,
          createdAt: row.createdAt,
          eventType: row.action,
          issueId: typeof issueId === "string" ? issueId : null,
          sourceSystem: row.actorType,
          payloadSummary: summarizePayload(payload),
          payload,
        };
      }),
      ...heartbeatRows.map((row): CockpitEventRow => {
        const payload = asRecord(row.payload);
        const issueId = payload?.issueId ?? payload?.issue_id;
        return {
          id: `heartbeat:${row.id}`,
          createdAt: row.createdAt,
          eventType: row.eventType,
          issueId: typeof issueId === "string" ? issueId : null,
          sourceSystem: "heartbeat",
          payloadSummary: row.message ?? summarizePayload(payload),
          payload: {
            runId: row.runId,
            agentId: row.agentId,
            seq: row.seq,
            stream: row.stream,
            level: row.level,
            message: row.message,
            payload: payload ?? null,
          },
        };
      }),
    ]
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
      .slice(0, limit);
  }

  async function loadRoutingDecisions(companyId: string, issueId?: string, limit = 100): Promise<CockpitRoutingDecisionRow[]> {
    const conditions = [eq(issueExecutionDecisions.companyId, companyId)];
    if (issueId) conditions.push(eq(issueExecutionDecisions.issueId, issueId));
    const rows = await db
      .select()
      .from(issueExecutionDecisions)
      .where(and(...conditions))
      .orderBy(desc(issueExecutionDecisions.createdAt))
      .limit(Math.min(Math.max(Number(limit), 1), 300));

    return rows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt,
      eventType: row.stageType,
      action: row.outcome,
      targetAgent: row.actorAgentId,
      reason: row.body,
      issueId: row.issueId,
      fields: { ...row },
    }));
  }

  async function loadAgentOverview(companyId: string): Promise<{ overviews: CockpitAgentOverview[]; rawAgents: typeof agents.$inferSelect[] }> {
    const { rawAgents, issues: issueRows } = await loadIssues(companyId);
    const now = Date.now();
    const staleCutoff = now - 3 * 24 * 60 * 60 * 1000;
    const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
    const issueOwnerKey = (issue: CockpitIssue) => {
      if (issue.assigneeAgentId) return issue.assigneeAgentId;
      return normalize(issue.currentOwner ?? "");
    };
    const actualRows = rawAgents.map((agent) => {
      const owned = issueRows.filter((issue) => issueOwnerKey(issue) === agent.id);
      return {
        id: agent.id,
        name: agent.name,
        role: agent.role,
        activeIssues: owned.filter((issue) => ["backlog", "todo", "in_progress", "in_review"].includes(issue.status)).length,
        blockedIssues: owned.filter((issue) => issue.status === "blocked").length,
        idleIssues: owned.filter((issue) => new Date(issue.updatedAt).getTime() < staleCutoff && !["done", "cancelled", "closed"].includes(issue.status)).length,
        awaitingReview: owned.filter((issue) => issue.status === "in_review").length,
        lastActivityAt: agent.lastHeartbeatAt ?? owned[0]?.updatedAt ?? null,
      };
    });

    const actualKeys = new Set(actualRows.map((row) => normalize(row.name)));
    const placeholderRows = AGENT_FLOW_NAMES
      .filter((name) => !actualKeys.has(normalize(name)))
      .map((name) => {
        const key = normalize(name);
        const owned = issueRows.filter((issue) => normalize(issue.currentOwner ?? "") === key);
        return {
          id: null,
          name,
          role: "cockpit_lane",
          activeIssues: owned.filter((issue) => OPEN_STATUSES.has(issue.status)).length,
          blockedIssues: owned.filter((issue) => issue.status === "blocked").length,
          idleIssues: owned.filter((issue) => new Date(issue.updatedAt).getTime() < staleCutoff && !["done", "cancelled", "closed"].includes(issue.status)).length,
          awaitingReview: owned.filter((issue) => issue.status === "in_review").length,
          lastActivityAt: owned[0]?.updatedAt ?? null,
        };
      });

    return { overviews: [...actualRows, ...placeholderRows], rawAgents };
  }

  router.get("/companies/:companyId/cockpit/summary", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const { issues: issueRows } = await loadIssues(companyId);
    const routingRows = await loadRoutingDecisions(companyId, undefined, 50);
    res.json({ companyId, metrics: buildMetrics(issueRows, routingRows) });
  });

  router.get("/companies/:companyId/cockpit/issues", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const result = await loadIssues(companyId);
    res.json({ issues: result.issues });
  });

  router.get("/companies/:companyId/cockpit/issues/:issueId", async (req, res) => {
    const companyId = req.params.companyId as string;
    const issueId = req.params.issueId as string;
    assertCompanyAccess(req, companyId);
    const { issues: issueRows } = await loadIssues(companyId);
    const issue = issueRows.find((row) => row.id === issueId || row.identifier === issueId);
    if (!issue) {
      res.status(404).json({ error: "Issue not found" });
      return;
    }
    const events = await loadEvents(companyId, { issueId: issue.id, limit: 100 });
    const routingDecisions = await loadRoutingDecisions(companyId, issue.id, 100);
    res.json({ issue, events, routingDecisions });
  });

  router.get("/companies/:companyId/cockpit/issues/:issueId/events", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    res.json({ events: await loadEvents(companyId, { issueId: req.params.issueId as string, limit: 100 }) });
  });

  router.get("/companies/:companyId/cockpit/issues/:issueId/routing", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    res.json({ routingDecisions: await loadRoutingDecisions(companyId, req.params.issueId as string, 100) });
  });

  router.get("/companies/:companyId/cockpit/events", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    res.json({
      events: await loadEvents(companyId, {
        eventType: req.query.eventType as string | undefined,
        issueId: req.query.issueId as string | undefined,
        sourceSystem: req.query.sourceSystem as string | undefined,
        from: req.query.from as string | undefined,
        to: req.query.to as string | undefined,
        limit: Number(req.query.limit ?? 100),
      }),
    });
  });

  router.get("/companies/:companyId/cockpit/routing-decisions", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    res.json({ routingDecisions: await loadRoutingDecisions(companyId, req.query.issueId as string | undefined, Number(req.query.limit ?? 100)) });
  });

  router.get("/companies/:companyId/cockpit/agents", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const { overviews } = await loadAgentOverview(companyId);
    res.json({ agents: overviews });
  });

  router.get("/companies/:companyId/cockpit", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const [{ issues: issueRows }, { overviews, rawAgents }, events, routingDecisions] = await Promise.all([
      loadIssues(companyId),
      loadAgentOverview(companyId),
      loadEvents(companyId, { limit: 100 }),
      loadRoutingDecisions(companyId, undefined, 100),
    ]);
    res.json({
      summary: { companyId, metrics: buildMetrics(issueRows, routingDecisions) },
      issues: issueRows,
      agents: overviews,
      events,
      routingDecisions,
      rawAgents,
    });
  });

  const cockpitActionSchema = z.object({
    action: z.string().min(1),
    payload: z.record(z.unknown()).optional().nullable(),
  });

  router.post(
    "/companies/:companyId/cockpit/issues/:issueId/actions",
    validate(cockpitActionSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      const issueId = req.params.issueId as string;
      assertCompanyAccess(req, companyId);
      
      const issueRows = await db
        .select({ id: issues.id })
        .from(issues)
        .where(and(eq(issues.companyId, companyId), eq(issues.id, issueId)))
        .limit(1);
        
      if (issueRows.length === 0) {
        res.status(404).json({ error: "Issue not found" });
        return;
      }

      const { action, payload } = req.body;
      const actorInfo = getActorInfo(req);
      
      // TODO: Actual state mutation or pub-sub emission logic for Cockpit events goes here.
      // Currently, Cockpit UI is read-only. We rely entirely on this ingest event.
      await activityService(db).create({
        companyId,
        actorType: actorInfo.actorType,
        actorId: actorInfo.actorId,
        agentId: actorInfo.agentId,
        action,
        entityType: "issue",
        entityId: issueId,
        details: payload ?? null,
      });
      
      res.status(202).send();
    }
  );

  return router;
}

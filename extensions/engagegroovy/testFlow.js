import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { bootstrapEngageGroovyOverlay } from "./bootstrap.js";
import { renderEngageGroovyDescriptionMetadata } from "./paperclipBridge.js";
import { assertValidTransition } from "./stateMachine.js";

function createFakeEventBus() {
  const handlers = new Map();
  return {
    subscribe(eventPattern, handler) {
      if (!handlers.has(eventPattern)) handlers.set(eventPattern, new Set());
      handlers.get(eventPattern).add(handler);
      return () => handlers.get(eventPattern)?.delete(handler);
    },
    async emit(eventType, event) {
      const matchingHandlers = handlers.get(eventType) ?? new Set();
      for (const handler of matchingHandlers) {
        await handler({ ...event, eventType });
      }
    },
  };
}

function createFakeFetch(outbox) {
  const githubIssues = new Map();
  let nextIssueNumber = 1;

  return async function fakeFetch(url, init = {}) {
    const parsed = new URL(url);
    const method = (init.method ?? "GET").toUpperCase();

    if (parsed.hostname === "snowflake.test") {
      outbox.snowflake.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    const match = parsed.pathname.match(/^\/repos\/([^/]+)\/([^/]+)\/issues(?:\/(\d+))?$/);
    if (!match) {
      return new Response("Not found", { status: 404 });
    }

    if (method === "POST" && !match[3]) {
      const payload = JSON.parse(init.body);
      const issue = {
        id: `gh-${nextIssueNumber}`,
        number: nextIssueNumber,
        title: payload.title,
        body: payload.body,
        state: "open",
        html_url: `https://github.test/acme/editorial/issues/${nextIssueNumber}`,
      };
      githubIssues.set(nextIssueNumber, issue);
      nextIssueNumber += 1;
      return new Response(JSON.stringify(issue), { status: 201 });
    }

    if (match[3]) {
      const issueNumber = Number(match[3]);
      const issue = githubIssues.get(issueNumber);
      if (!issue) return new Response("Not found", { status: 404 });

      if (method === "GET") {
        return new Response(JSON.stringify(issue), { status: 200 });
      }

      if (method === "PATCH") {
        const payload = JSON.parse(init.body);
        if (payload.title !== undefined) issue.title = payload.title;
        if (payload.body !== undefined) issue.body = payload.body;
        if (payload.state !== undefined) issue.state = payload.state;
        githubIssues.set(issueNumber, issue);
        return new Response(JSON.stringify(issue), { status: 200 });
      }
    }

    return new Response("Method not allowed", { status: 405 });
  };
}

function createIssueDescription(overlay) {
  return [
    "Editorial workflow task.",
    "",
    renderEngageGroovyDescriptionMetadata(overlay),
  ].join("\n");
}

export async function runEngageGroovyTestFlow() {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "engagegroovy-"));
  const stateFilePath = path.join(tempRoot, "bridge-state.json");
  const outbox = {
    snowflake: [],
  };
  const issues = new Map();
  const eventBus = createFakeEventBus();
  const fetchImpl = createFakeFetch(outbox);

  const issueId = "paperclip-issue-1";
  issues.set(issueId, {
    id: issueId,
    identifier: "PAP-ENG-1",
    title: "Publish April ENGAGEGROOVY package",
    status: "todo",
    description: createIssueDescription({
      enabled: true,
      stage: "NEW",
      current_owner_role: "CEO",
      drive_folder_url: "https://drive.test/folders/pap-eng-1",
      artifacts: {},
      sub_issues: [],
    }),
  });

  const overlay = await bootstrapEngageGroovyOverlay({
    env: {
      ENGAGEGROOVY_ENABLED: "true",
      GITHUB_TOKEN: "test-token",
      ENGAGEGROOVY_GITHUB_REPO: "acme/editorial",
      ENGAGEGROOVY_STATE_FILE: stateFilePath,
      ENGAGEGROOVY_SNOWFLAKE_URL: "https://snowflake.test/events",
    },
    eventBus,
    fetchImpl,
    loadIssue: async (candidateId) => issues.get(candidateId) ?? null,
    logger: {
      info() {},
      warn() {},
    },
  });

  assert.equal(overlay.enabled, true);

  await eventBus.emit("issue.created", {
    entityId: issueId,
    entityType: "issue",
  });

  let bridgeState = JSON.parse(await fs.readFile(stateFilePath, "utf8"));
  assert.ok(bridgeState.issues[issueId], "bridge should persist a GitHub mapping after issue creation");
  assert.equal(outbox.snowflake[0].status, "issue_created");

  issues.set(issueId, {
    ...issues.get(issueId),
    description: createIssueDescription({
      enabled: true,
      stage: "CEO_BRIEFED",
      current_owner_role: "CEO",
      drive_folder_url: "https://drive.test/folders/pap-eng-1",
      artifacts: {
        ceo_brief: "https://docs.test/ceo-brief",
      },
      sub_issues: [],
    }),
  });
  await eventBus.emit("issue.updated", { entityId: issueId, entityType: "issue" });

  issues.set(issueId, {
    ...issues.get(issueId),
    description: createIssueDescription({
      enabled: true,
      stage: "RESEARCH_DONE",
      current_owner_role: "Research",
      drive_folder_url: "https://drive.test/folders/pap-eng-1",
      artifacts: {
        ceo_brief: "https://docs.test/ceo-brief",
        research_brief: "https://docs.test/research-brief",
      },
      sub_issues: [
        {
          key: "editor-needs-design",
          title: "Need a design packet for the campaign",
          role_origin: "editor",
          role_target: "design",
          context_artifact: "research_brief",
        },
      ],
    }),
  });
  await eventBus.emit("issue.updated", { entityId: issueId, entityType: "issue" });

  issues.set(issueId, {
    ...issues.get(issueId),
    description: createIssueDescription({
      enabled: true,
      stage: "BLOCKED",
      current_owner_role: "Research",
      drive_folder_url: "https://drive.test/folders/pap-eng-1",
      artifacts: {
        ceo_brief: "https://docs.test/ceo-brief",
        research_brief: "https://docs.test/research-brief",
      },
      sub_issues: [
        {
          key: "editor-needs-design",
          title: "Need a design packet for the campaign",
          role_origin: "editor",
          role_target: "design",
          context_artifact: "research_brief",
        },
      ],
    }),
  });
  await eventBus.emit("issue.updated", { entityId: issueId, entityType: "issue" });

  issues.set(issueId, {
    ...issues.get(issueId),
    description: createIssueDescription({
      enabled: true,
      stage: "EDITOR_IN_PROGRESS",
      current_owner_role: "Editor",
      drive_folder_url: "https://drive.test/folders/pap-eng-1",
      artifacts: {
        ceo_brief: "https://docs.test/ceo-brief",
        research_brief: "https://docs.test/research-brief",
        editor_brief: "https://docs.test/editor-brief",
      },
      sub_issues: [
        {
          key: "editor-needs-design",
          title: "Need a design packet for the campaign",
          role_origin: "editor",
          role_target: "design",
          context_artifact: "research_brief",
        },
      ],
    }),
  });
  await eventBus.emit("issue.updated", { entityId: issueId, entityType: "issue" });

  issues.set(issueId, {
    ...issues.get(issueId),
    description: createIssueDescription({
      enabled: true,
      stage: "DESIGN_DONE",
      current_owner_role: "Design",
      drive_folder_url: "https://drive.test/folders/pap-eng-1",
      artifacts: {
        ceo_brief: "https://docs.test/ceo-brief",
        research_brief: "https://docs.test/research-brief",
        editor_brief: "https://docs.test/editor-brief",
        design_brief: "https://docs.test/design-brief",
      },
      sub_issues: [
        {
          key: "editor-needs-design",
          title: "Need a design packet for the campaign",
          role_origin: "editor",
          role_target: "design",
          context_artifact: "research_brief",
        },
      ],
    }),
  });
  await eventBus.emit("issue.updated", { entityId: issueId, entityType: "issue" });

  issues.set(issueId, {
    ...issues.get(issueId),
    description: createIssueDescription({
      enabled: true,
      stage: "WRITING_DONE",
      current_owner_role: "Writer",
      drive_folder_url: "https://drive.test/folders/pap-eng-1",
      artifacts: {
        ceo_brief: "https://docs.test/ceo-brief",
        research_brief: "https://docs.test/research-brief",
        editor_brief: "https://docs.test/editor-brief",
        design_brief: "https://docs.test/design-brief",
        content_package: "https://docs.test/content-package",
      },
      sub_issues: [
        {
          key: "editor-needs-design",
          title: "Need a design packet for the campaign",
          role_origin: "editor",
          role_target: "design",
          context_artifact: "research_brief",
        },
      ],
    }),
  });
  await eventBus.emit("issue.updated", { entityId: issueId, entityType: "issue" });

  issues.set(issueId, {
    ...issues.get(issueId),
    description: createIssueDescription({
      enabled: true,
      stage: "REVIEW_REQUESTED",
      current_owner_role: "Editor",
      drive_folder_url: "https://drive.test/folders/pap-eng-1",
      artifacts: {
        ceo_brief: "https://docs.test/ceo-brief",
        research_brief: "https://docs.test/research-brief",
        editor_brief: "https://docs.test/editor-brief",
        design_brief: "https://docs.test/design-brief",
        content_package: "https://docs.test/content-package",
      },
      sub_issues: [
        {
          key: "editor-needs-design",
          title: "Need a design packet for the campaign",
          role_origin: "editor",
          role_target: "design",
          context_artifact: "research_brief",
        },
      ],
    }),
  });
  await eventBus.emit("issue.updated", { entityId: issueId, entityType: "issue" });

  issues.set(issueId, {
    ...issues.get(issueId),
    description: createIssueDescription({
      enabled: true,
      stage: "EDITOR_FINAL",
      current_owner_role: "Editor",
      drive_folder_url: "https://drive.test/folders/pap-eng-1",
      artifacts: {
        ceo_brief: "https://docs.test/ceo-brief",
        research_brief: "https://docs.test/research-brief",
        editor_brief: "https://docs.test/editor-brief",
        design_brief: "https://docs.test/design-brief",
        content_package: "https://docs.test/content-package",
      },
      sub_issues: [
        {
          key: "editor-needs-design",
          title: "Need a design packet for the campaign",
          role_origin: "editor",
          role_target: "design",
          context_artifact: "research_brief",
        },
      ],
    }),
  });
  await eventBus.emit("issue.updated", { entityId: issueId, entityType: "issue" });

  issues.set(issueId, {
    ...issues.get(issueId),
    description: createIssueDescription({
      enabled: true,
      stage: "READY_FOR_MGRNZ",
      current_owner_role: "Manager NZ",
      drive_folder_url: "https://drive.test/folders/pap-eng-1",
      artifacts: {
        ceo_brief: "https://docs.test/ceo-brief",
        research_brief: "https://docs.test/research-brief",
        editor_brief: "https://docs.test/editor-brief",
        design_brief: "https://docs.test/design-brief",
        content_package: "https://docs.test/content-package",
        final_package: "https://docs.test/final-package",
      },
      sub_issues: [
        {
          key: "editor-needs-design",
          title: "Need a design packet for the campaign",
          role_origin: "editor",
          role_target: "design",
          context_artifact: "research_brief",
        },
      ],
    }),
  });
  await eventBus.emit("issue.updated", { entityId: issueId, entityType: "issue" });

  issues.set(issueId, {
    ...issues.get(issueId),
    status: "done",
    description: createIssueDescription({
      enabled: true,
      stage: "COMPLETE",
      current_owner_role: "Manager NZ",
      drive_folder_url: "https://drive.test/folders/pap-eng-1",
      artifacts: {
        ceo_brief: "https://docs.test/ceo-brief",
        research_brief: "https://docs.test/research-brief",
        editor_brief: "https://docs.test/editor-brief",
        design_brief: "https://docs.test/design-brief",
        content_package: "https://docs.test/content-package",
        final_package: "https://docs.test/final-package",
      },
      sub_issues: [
        {
          key: "editor-needs-design",
          title: "Need a design packet for the campaign",
          role_origin: "editor",
          role_target: "design",
          context_artifact: "research_brief",
        },
      ],
    }),
  });
  await eventBus.emit("issue.updated", { entityId: issueId, entityType: "issue" });

  bridgeState = JSON.parse(await fs.readFile(stateFilePath, "utf8"));
  assert.equal(bridgeState.issues[issueId].lastStage, "COMPLETE");
  assert.ok(outbox.snowflake.some((event) => event.status === "sub_issue_created"));
  assert.ok(outbox.snowflake.some((event) => event.status === "artifact_submitted"));
  assert.ok(outbox.snowflake.some((event) => event.status === "issue_closed"));

  assert.throws(
    () => assertValidTransition("NEW", "WRITING_DONE"),
    /Invalid ENGAGEGROOVY stage transition/,
    "state machine should reject invalid jumps",
  );

  return {
    stateFilePath,
    emittedStatuses: outbox.snowflake.map((event) => event.status),
  };
}

function isDirectExecution() {
  if (!process.argv[1]) return false;
  return import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}

if (isDirectExecution()) {
  runEngageGroovyTestFlow()
    .then((result) => {
      console.log("ENGAGEGROOVY test flow passed");
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((error) => {
      console.error("ENGAGEGROOVY test flow failed");
      console.error(error);
      process.exitCode = 1;
    });
}

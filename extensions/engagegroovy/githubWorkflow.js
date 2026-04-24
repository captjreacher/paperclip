import { assertValidTransition } from "./stateMachine.js";

const ARTIFACT_KEYS = [
  "ceo_brief",
  "research_brief",
  "editor_brief",
  "design_brief",
  "content_package",
  "final_package",
];

const MANIFEST_START = "<!-- ENGAGEGROOVY_MANIFEST:BEGIN -->";
const MANIFEST_END = "<!-- ENGAGEGROOVY_MANIFEST:END -->";

function createEmptyArtifacts() {
  return {
    ceo_brief: null,
    research_brief: null,
    editor_brief: null,
    design_brief: null,
    content_package: null,
    final_package: null,
  };
}

function normalizeArtifacts(input) {
  const next = createEmptyArtifacts();
  const record = input && typeof input === "object" ? input : {};
  for (const key of ARTIFACT_KEYS) {
    next[key] = typeof record[key] === "string" && record[key].trim().length > 0 ? record[key].trim() : null;
  }
  return next;
}

function normalizeSubIssues(input) {
  if (!Array.isArray(input)) return [];
  return input
    .filter((candidate) => candidate && typeof candidate === "object")
    .map((candidate) => ({
      key: typeof candidate.key === "string" ? candidate.key.trim() : null,
      title: typeof candidate.title === "string" ? candidate.title.trim() : null,
      role_origin: typeof candidate.role_origin === "string" ? candidate.role_origin.trim() : null,
      role_target: typeof candidate.role_target === "string" ? candidate.role_target.trim() : null,
      context_artifact: typeof candidate.context_artifact === "string" ? candidate.context_artifact.trim() : null,
      issue_number: candidate.issue_number ?? null,
      issue_url: typeof candidate.issue_url === "string" ? candidate.issue_url.trim() : null,
      state: typeof candidate.state === "string" ? candidate.state.trim() : "open",
    }))
    .filter((candidate) => candidate.key && candidate.title);
}

function normalizePaperclipIssue(issue) {
  if (!issue || typeof issue !== "object") return null;
  return {
    id: issue.id ?? null,
    identifier: issue.identifier ?? null,
    title: issue.title ?? null,
    status: issue.status ?? null,
    url: issue.url ?? null,
  };
}

export function normalizeManifest(input) {
  const payload = input && typeof input === "object" ? input : {};
  const engagegroovy = payload.engagegroovy && typeof payload.engagegroovy === "object" ? payload.engagegroovy : {};
  return {
    engagegroovy: {
      stage: typeof engagegroovy.stage === "string" ? engagegroovy.stage.trim() : "NEW",
      artifacts: normalizeArtifacts(engagegroovy.artifacts),
      drive_folder_url:
        typeof engagegroovy.drive_folder_url === "string" && engagegroovy.drive_folder_url.trim().length > 0
          ? engagegroovy.drive_folder_url.trim()
          : null,
      current_owner_role:
        typeof engagegroovy.current_owner_role === "string" && engagegroovy.current_owner_role.trim().length > 0
          ? engagegroovy.current_owner_role.trim()
          : null,
      sub_issues: normalizeSubIssues(engagegroovy.sub_issues),
      paperclip_issue: normalizePaperclipIssue(engagegroovy.paperclip_issue),
    },
  };
}

export function extractManifestFromBody(body) {
  if (typeof body !== "string") return normalizeManifest({});
  const startIndex = body.indexOf(MANIFEST_START);
  const endIndex = body.indexOf(MANIFEST_END);
  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    return normalizeManifest({});
  }
  const jsonSlice = body.slice(startIndex + MANIFEST_START.length, endIndex).trim();
  if (!jsonSlice) return normalizeManifest({});
  try {
    return normalizeManifest(JSON.parse(jsonSlice));
  } catch {
    return normalizeManifest({});
  }
}

function renderParentIssueBody(input) {
  const manifest = normalizeManifest(input.manifest);
  const paperclipIssue = normalizePaperclipIssue(manifest.engagegroovy.paperclip_issue);
  const lines = [
    `# ${paperclipIssue?.title ?? "ENGAGEGROOVY Control Record"}`,
    "",
    paperclipIssue?.identifier ? `Paperclip issue: ${paperclipIssue.identifier}` : null,
    paperclipIssue?.status ? `Paperclip status: ${paperclipIssue.status}` : null,
    paperclipIssue?.url ? `Paperclip URL: ${paperclipIssue.url}` : null,
    "",
    "Managed by the ENGAGEGROOVY overlay.",
    "Use sub-issues for clarification and remediation. Do not use parent issue comments for workflow discussion.",
    "",
    MANIFEST_START,
    JSON.stringify(manifest, null, 2),
    MANIFEST_END,
  ];
  return lines.filter(Boolean).join("\n");
}

function renderSubIssueBody(input) {
  return [
    `Parent issue: #${input.parentIssueNumber}`,
    input.parentIssueUrl ? `Parent URL: ${input.parentIssueUrl}` : null,
    `Role origin: ${input.roleOrigin}`,
    `Role target: ${input.roleTarget}`,
    `Context artifact: ${input.contextArtifact}`,
    "",
    "Managed by the ENGAGEGROOVY overlay. Keep workflow discussion here instead of on the parent control record.",
  ].filter(Boolean).join("\n");
}

function toPaperclipReference(config, issue) {
  if (!issue) return null;
  const baseUrl = config.paperclipBaseUrl ? config.paperclipBaseUrl.replace(/\/+$/, "") : null;
  return {
    id: issue.id ?? null,
    identifier: issue.identifier ?? null,
    title: issue.title ?? null,
    status: issue.status ?? null,
    url: baseUrl && issue.id ? `${baseUrl}/issues/${issue.id}` : null,
  };
}

export function createGitHubWorkflow(input) {
  const { config, logger } = input;
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;

  if (typeof fetchImpl !== "function") {
    throw new Error("GitHub workflow adapter requires a fetch implementation");
  }

  async function request(method, pathname, body) {
    const response = await fetchImpl(`${config.githubApiBase.replace(/\/+$/, "")}${pathname}`, {
      method,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${config.githubToken}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`GitHub API request failed (${response.status} ${response.statusText}): ${text}`);
    }

    if (response.status === 204) return null;
    return response.json();
  }

  function issuePath(suffix = "") {
    return `/repos/${config.githubOwner}/${config.githubRepoName}/issues${suffix}`;
  }

  async function getIssue(issueNumber) {
    const payload = await request("GET", issuePath(`/${issueNumber}`));
    return {
      id: payload.id,
      number: payload.number,
      title: payload.title,
      body: payload.body ?? "",
      state: payload.state,
      htmlUrl: payload.html_url,
      manifest: extractManifestFromBody(payload.body ?? ""),
    };
  }

  async function updateIssueManifest(issueNumber, updater) {
    const current = await getIssue(issueNumber);
    const nextManifest = normalizeManifest(await updater(current.manifest, current));
    const paperclipIssue = nextManifest.engagegroovy.paperclip_issue;
    const payload = await request("PATCH", issuePath(`/${issueNumber}`), {
      body: renderParentIssueBody({ manifest: nextManifest }),
      title: paperclipIssue?.title ?? current.title,
    });
    return {
      id: payload.id,
      number: payload.number,
      title: payload.title,
      body: payload.body ?? "",
      state: payload.state,
      htmlUrl: payload.html_url,
      manifest: extractManifestFromBody(payload.body ?? ""),
    };
  }

  return {
    getIssue,

    async createParentIssue(input) {
      const manifest = normalizeManifest({
        engagegroovy: {
          stage: input.stage ?? "NEW",
          artifacts: input.artifacts ?? createEmptyArtifacts(),
          drive_folder_url: input.driveFolderUrl ?? null,
          current_owner_role: input.currentOwnerRole ?? null,
          sub_issues: [],
          paperclip_issue: toPaperclipReference(config, input.paperclipIssue),
        },
      });

      const payload = await request("POST", issuePath(), {
        title: input.paperclipIssue?.title ?? "ENGAGEGROOVY Control Record",
        body: renderParentIssueBody({ manifest }),
      });

      return {
        id: payload.id,
        number: payload.number,
        title: payload.title,
        body: payload.body ?? "",
        state: payload.state,
        htmlUrl: payload.html_url,
        manifest: extractManifestFromBody(payload.body ?? ""),
      };
    },

    async updateStage(issueNumber, nextStage, input = {}) {
      return updateIssueManifest(issueNumber, (currentManifest) => {
        const currentStage = currentManifest.engagegroovy.stage ?? null;
        assertValidTransition(currentStage, nextStage);
        return {
          engagegroovy: {
            ...currentManifest.engagegroovy,
            stage: nextStage,
            drive_folder_url: input.driveFolderUrl ?? currentManifest.engagegroovy.drive_folder_url,
            current_owner_role: input.currentOwnerRole ?? currentManifest.engagegroovy.current_owner_role,
            paperclip_issue: toPaperclipReference(config, input.paperclipIssue) ?? currentManifest.engagegroovy.paperclip_issue,
          },
        };
      });
    },

    async attachArtifact(issueNumber, artifactType, artifactUrl, input = {}) {
      if (!ARTIFACT_KEYS.includes(artifactType)) {
        throw new Error(`Unknown ENGAGEGROOVY artifact type: ${artifactType}`);
      }

      return updateIssueManifest(issueNumber, (currentManifest) => {
        const nextArtifacts = {
          ...currentManifest.engagegroovy.artifacts,
          [artifactType]: artifactUrl,
        };
        return {
          engagegroovy: {
            ...currentManifest.engagegroovy,
            artifacts: nextArtifacts,
            drive_folder_url: input.driveFolderUrl ?? currentManifest.engagegroovy.drive_folder_url,
            current_owner_role: input.currentOwnerRole ?? currentManifest.engagegroovy.current_owner_role,
            paperclip_issue: toPaperclipReference(config, input.paperclipIssue) ?? currentManifest.engagegroovy.paperclip_issue,
          },
        };
      });
    },

    async createSubIssue(parentIssueNumber, input) {
      const parent = await getIssue(parentIssueNumber);
      const existing = parent.manifest.engagegroovy.sub_issues.find((candidate) => candidate.key === input.key);
      if (existing) return existing;

      const created = await request("POST", issuePath(), {
        title: `[ENGAGEGROOVY][#${parentIssueNumber}] ${input.title}`,
        body: renderSubIssueBody({
          parentIssueNumber,
          parentIssueUrl: parent.htmlUrl,
          roleOrigin: input.roleOrigin,
          roleTarget: input.roleTarget,
          contextArtifact: input.contextArtifact,
        }),
      });

      await updateIssueManifest(parentIssueNumber, (currentManifest) => ({
        engagegroovy: {
          ...currentManifest.engagegroovy,
          sub_issues: [
            ...currentManifest.engagegroovy.sub_issues,
            {
              key: input.key,
              title: input.title,
              role_origin: input.roleOrigin,
              role_target: input.roleTarget,
              context_artifact: input.contextArtifact,
              issue_number: created.number,
              issue_url: created.html_url,
              state: "open",
            },
          ],
        },
      }));

      return {
        key: input.key,
        title: input.title,
        role_origin: input.roleOrigin,
        role_target: input.roleTarget,
        context_artifact: input.contextArtifact,
        issue_number: created.number,
        issue_url: created.html_url,
        state: "open",
      };
    },

    async closeIssue(issueNumber, input = {}) {
      const current = await getIssue(issueNumber);
      const manifest = normalizeManifest({
        engagegroovy: {
          ...current.manifest.engagegroovy,
          stage: "COMPLETE",
          paperclip_issue: toPaperclipReference(config, input.paperclipIssue) ?? current.manifest.engagegroovy.paperclip_issue,
        },
      });
      const payload = await request("PATCH", issuePath(`/${issueNumber}`), {
        title: manifest.engagegroovy.paperclip_issue?.title ?? current.title,
        body: renderParentIssueBody({ manifest }),
        state: "closed",
      });
      logger?.info?.({ issueNumber, githubIssueNumber: payload.number }, "ENGAGEGROOVY parent issue closed");
      return {
        id: payload.id,
        number: payload.number,
        title: payload.title,
        body: payload.body ?? "",
        state: payload.state,
        htmlUrl: payload.html_url,
        manifest: extractManifestFromBody(payload.body ?? ""),
      };
    },
  };
}

import fs from "node:fs/promises";
import path from "node:path";
import { deriveStageFromPaperclipStatus } from "./stateMachine.js";

const DESCRIPTION_START = "<!-- ENGAGEGROOVY_OVERLAY:BEGIN -->";
const DESCRIPTION_END = "<!-- ENGAGEGROOVY_OVERLAY:END -->";

function normalizeArtifactMap(input) {
  const record = input && typeof input === "object" ? input : {};
  return {
    ceo_brief: typeof record.ceo_brief === "string" && record.ceo_brief.trim().length > 0 ? record.ceo_brief.trim() : null,
    research_brief:
      typeof record.research_brief === "string" && record.research_brief.trim().length > 0 ? record.research_brief.trim() : null,
    editor_brief:
      typeof record.editor_brief === "string" && record.editor_brief.trim().length > 0 ? record.editor_brief.trim() : null,
    design_brief:
      typeof record.design_brief === "string" && record.design_brief.trim().length > 0 ? record.design_brief.trim() : null,
    content_package:
      typeof record.content_package === "string" && record.content_package.trim().length > 0 ? record.content_package.trim() : null,
    final_package:
      typeof record.final_package === "string" && record.final_package.trim().length > 0 ? record.final_package.trim() : null,
  };
}

function normalizeSubIssueRequests(input) {
  if (!Array.isArray(input)) return [];
  return input
    .filter((candidate) => candidate && typeof candidate === "object")
    .map((candidate) => ({
      key: typeof candidate.key === "string" ? candidate.key.trim() : null,
      title: typeof candidate.title === "string" ? candidate.title.trim() : null,
      role_origin: typeof candidate.role_origin === "string" ? candidate.role_origin.trim() : null,
      role_target: typeof candidate.role_target === "string" ? candidate.role_target.trim() : null,
      context_artifact: typeof candidate.context_artifact === "string" ? candidate.context_artifact.trim() : null,
    }))
    .filter((candidate) => candidate.key && candidate.title && candidate.role_origin && candidate.role_target && candidate.context_artifact);
}

function normalizeOverlayPayload(input) {
  const payload = input && typeof input === "object" ? input : {};
  return {
    enabled: payload.enabled === true,
    stage: typeof payload.stage === "string" && payload.stage.trim().length > 0 ? payload.stage.trim() : null,
    artifacts: normalizeArtifactMap(payload.artifacts),
    drive_folder_url:
      typeof payload.drive_folder_url === "string" && payload.drive_folder_url.trim().length > 0
        ? payload.drive_folder_url.trim()
        : null,
    current_owner_role:
      typeof payload.current_owner_role === "string" && payload.current_owner_role.trim().length > 0
        ? payload.current_owner_role.trim()
        : null,
    sub_issues: normalizeSubIssueRequests(payload.sub_issues),
  };
}

export function parseEngageGroovyDescription(description) {
  if (typeof description !== "string") return null;
  const startIndex = description.indexOf(DESCRIPTION_START);
  const endIndex = description.indexOf(DESCRIPTION_END);
  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) return null;
  const jsonSlice = description.slice(startIndex + DESCRIPTION_START.length, endIndex).trim();
  if (!jsonSlice) return null;
  try {
    return normalizeOverlayPayload(JSON.parse(jsonSlice));
  } catch {
    return null;
  }
}

export function renderEngageGroovyDescriptionMetadata(input) {
  return [
    DESCRIPTION_START,
    JSON.stringify(normalizeOverlayPayload(input), null, 2),
    DESCRIPTION_END,
  ].join("\n");
}

async function ensureParentDir(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function loadBridgeState(filePath) {
  try {
    const raw = JSON.parse(await fs.readFile(filePath, "utf8"));
    return raw && typeof raw === "object" ? raw : { version: 1, issues: {} };
  } catch {
    return { version: 1, issues: {} };
  }
}

async function saveBridgeState(filePath, state) {
  await ensureParentDir(filePath);
  const tempPath = `${filePath}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(state, null, 2), "utf8");
  await fs.rename(tempPath, filePath);
}

function createLogger(logger) {
  return {
    info(fields, message) {
      if (typeof logger?.info === "function") logger.info(fields, message);
    },
    warn(fields, message) {
      if (typeof logger?.warn === "function") logger.warn(fields, message);
    },
  };
}

export function createPaperclipBridge(input) {
  const { eventBus, githubWorkflow, snowflakeEmitter, config, loadIssue } = input;
  const log = createLogger(input.logger);
  const subscriptions = [];
  let queue = Promise.resolve();

  function enqueue(event) {
    queue = queue.then(() => processEvent(event)).catch((error) => {
      log.warn({ err: error, eventType: event?.eventType, entityId: event?.entityId }, "ENGAGEGROOVY bridge event processing failed");
    });
    return queue;
  }

  async function processEvent(event) {
    if (!event || event.entityType !== "issue") return;
    const state = await loadBridgeState(config.stateFilePath);
    const issueState = state.issues?.[event.entityId] ?? null;
    const issue = await loadIssue(event.entityId);
    if (!issue) return;

    const overlay = parseEngageGroovyDescription(issue.description);
    if (!overlay?.enabled && !issueState) return;

    let parentIssue = issueState?.githubIssueNumber ? await githubWorkflow.getIssue(issueState.githubIssueNumber).catch(() => null) : null;
    const desiredStage =
      overlay?.stage ??
      deriveStageFromPaperclipStatus(issue.status) ??
      parentIssue?.manifest?.engagegroovy?.stage ??
      issueState?.lastStage ??
      "NEW";

    if (!parentIssue) {
      if (!overlay?.enabled) return;
      parentIssue = await githubWorkflow.createParentIssue({
        paperclipIssue: issue,
        stage: desiredStage,
        artifacts: overlay?.artifacts,
        driveFolderUrl: overlay?.drive_folder_url,
        currentOwnerRole: overlay?.current_owner_role,
      });
      state.issues[event.entityId] = {
        githubIssueNumber: parentIssue.number,
        githubIssueUrl: parentIssue.htmlUrl,
        lastStage: parentIssue.manifest.engagegroovy.stage,
      };
      await saveBridgeState(config.stateFilePath, state);
      await snowflakeEmitter.emit("issue_created", {
        entityId: event.entityId,
        stage: parentIssue.manifest.engagegroovy.stage,
        actorRole: overlay?.current_owner_role ?? null,
      });
    }

    let currentManifest = parentIssue.manifest;
    let stageChanged = false;

    if (desiredStage && desiredStage !== currentManifest.engagegroovy.stage) {
      try {
        parentIssue = await githubWorkflow.updateStage(parentIssue.number, desiredStage, {
          paperclipIssue: issue,
          driveFolderUrl: overlay?.drive_folder_url,
          currentOwnerRole: overlay?.current_owner_role,
        });
        currentManifest = parentIssue.manifest;
        stageChanged = true;
        await snowflakeEmitter.emit("stage_changed", {
          entityId: event.entityId,
          stage: desiredStage,
          actorRole: overlay?.current_owner_role ?? null,
        });
      } catch (error) {
        log.warn(
          { err: error, issueId: issue.id, currentStage: currentManifest.engagegroovy.stage, desiredStage },
          "ENGAGEGROOVY rejected invalid stage transition",
        );
      }
    }

    const driveFolderChanged =
      overlay?.drive_folder_url &&
      overlay.drive_folder_url !== currentManifest.engagegroovy.drive_folder_url;
    const ownerRoleChanged =
      overlay?.current_owner_role &&
      overlay.current_owner_role !== currentManifest.engagegroovy.current_owner_role;
    const paperclipSummaryChanged =
      issue.title !== currentManifest.engagegroovy.paperclip_issue?.title ||
      issue.status !== currentManifest.engagegroovy.paperclip_issue?.status ||
      issue.identifier !== currentManifest.engagegroovy.paperclip_issue?.identifier;

    if (!stageChanged && (driveFolderChanged || ownerRoleChanged || paperclipSummaryChanged)) {
      parentIssue = await githubWorkflow.updateStage(parentIssue.number, currentManifest.engagegroovy.stage, {
        paperclipIssue: issue,
        driveFolderUrl: overlay?.drive_folder_url,
        currentOwnerRole: overlay?.current_owner_role,
      });
      currentManifest = parentIssue.manifest;
    }

    if (overlay) {
      for (const [artifactType, artifactUrl] of Object.entries(overlay.artifacts)) {
        if (!artifactUrl) continue;
        if (currentManifest.engagegroovy.artifacts[artifactType] === artifactUrl) continue;
        parentIssue = await githubWorkflow.attachArtifact(parentIssue.number, artifactType, artifactUrl, {
          paperclipIssue: issue,
          driveFolderUrl: overlay.drive_folder_url,
          currentOwnerRole: overlay.current_owner_role,
        });
        currentManifest = parentIssue.manifest;
        await snowflakeEmitter.emit("artifact_submitted", {
          entityId: event.entityId,
          stage: currentManifest.engagegroovy.stage,
          actorRole: overlay.current_owner_role ?? null,
          artifactType,
        });
      }

      for (const subIssue of overlay.sub_issues) {
        const alreadyExists = currentManifest.engagegroovy.sub_issues.some((candidate) => candidate.key === subIssue.key);
        if (alreadyExists) continue;
        const createdSubIssue = await githubWorkflow.createSubIssue(parentIssue.number, {
          key: subIssue.key,
          title: subIssue.title,
          roleOrigin: subIssue.role_origin,
          roleTarget: subIssue.role_target,
          contextArtifact: subIssue.context_artifact,
        });
        currentManifest.engagegroovy.sub_issues.push(createdSubIssue);
        await snowflakeEmitter.emit("sub_issue_created", {
          entityId: event.entityId,
          stage: currentManifest.engagegroovy.stage,
          actorRole: overlay.current_owner_role ?? null,
          subIssue: true,
        });
      }
    }

    if (currentManifest.engagegroovy.stage === "COMPLETE" && parentIssue.state !== "closed") {
      parentIssue = await githubWorkflow.closeIssue(parentIssue.number, {
        paperclipIssue: issue,
      });
      currentManifest = parentIssue.manifest;
      await snowflakeEmitter.emit("issue_closed", {
        entityId: event.entityId,
        stage: currentManifest.engagegroovy.stage,
        actorRole: overlay?.current_owner_role ?? null,
      });
    }

    state.issues[event.entityId] = {
      githubIssueNumber: parentIssue.number,
      githubIssueUrl: parentIssue.htmlUrl,
      lastStage: currentManifest.engagegroovy.stage,
    };
    await saveBridgeState(config.stateFilePath, state);
  }

  return {
    start() {
      const createdUnsubscribe = eventBus.subscribe("issue.created", enqueue);
      const updatedUnsubscribe = eventBus.subscribe("issue.updated", enqueue);
      if (typeof createdUnsubscribe === "function") subscriptions.push(createdUnsubscribe);
      if (typeof updatedUnsubscribe === "function") subscriptions.push(updatedUnsubscribe);
    },

    dispose() {
      for (const unsubscribe of subscriptions.splice(0)) {
        try {
          unsubscribe();
        } catch {
          // Ignore disposal errors for a best-effort observer.
        }
      }
    },
  };
}

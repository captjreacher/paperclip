import os from "node:os";
import path from "node:path";

function readTrimmed(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readBoolean(value, fallback = false) {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function parseRepository(value) {
  const repo = readTrimmed(value);
  if (!repo) return null;
  const [owner, name] = repo.split("/");
  if (!owner || !name) return null;
  return {
    fullName: `${owner}/${name}`,
    owner,
    name,
  };
}

function resolvePaperclipHome(env) {
  return readTrimmed(env.PAPERCLIP_HOME) ?? path.join(os.homedir(), ".paperclip");
}

function resolvePaperclipInstanceId(env) {
  return readTrimmed(env.PAPERCLIP_INSTANCE_ID) ?? "default";
}

function resolveStateFilePath(env) {
  const explicitPath = readTrimmed(env.ENGAGEGROOVY_STATE_FILE);
  if (explicitPath) return explicitPath;
  const paperclipHome = resolvePaperclipHome(env);
  const instanceId = resolvePaperclipInstanceId(env);
  return path.join(paperclipHome, "instances", instanceId, "data", "engagegroovy", "bridge-state.json");
}

export function resolveEngageGroovyConfig(env = process.env) {
  const enabled = readBoolean(env.ENGAGEGROOVY_ENABLED, false);
  const repo =
    parseRepository(env.ENGAGEGROOVY_GITHUB_REPO) ??
    parseRepository(env.GITHUB_REPOSITORY) ??
    (readTrimmed(env.ENGAGEGROOVY_GITHUB_OWNER) && readTrimmed(env.ENGAGEGROOVY_GITHUB_REPO_NAME)
      ? {
        owner: readTrimmed(env.ENGAGEGROOVY_GITHUB_OWNER),
        name: readTrimmed(env.ENGAGEGROOVY_GITHUB_REPO_NAME),
        fullName: `${readTrimmed(env.ENGAGEGROOVY_GITHUB_OWNER)}/${readTrimmed(env.ENGAGEGROOVY_GITHUB_REPO_NAME)}`,
      }
      : null);

  const githubApiBase = readTrimmed(env.ENGAGEGROOVY_GITHUB_API_BASE) ?? "https://api.github.com";
  const paperclipBaseUrl =
    readTrimmed(env.PAPERCLIP_PUBLIC_URL) ??
    readTrimmed(env.PAPERCLIP_AUTH_PUBLIC_BASE_URL) ??
    null;
  const snowflakeUrl = readTrimmed(env.ENGAGEGROOVY_SNOWFLAKE_URL);

  return {
    enabled,
    githubToken: readTrimmed(env.GITHUB_TOKEN),
    githubApiBase,
    githubRepo: repo?.fullName ?? null,
    githubOwner: repo?.owner ?? null,
    githubRepoName: repo?.name ?? null,
    paperclipBaseUrl,
    snowflakeEnabled: Boolean(snowflakeUrl),
    snowflakeUrl,
    snowflakeToken: readTrimmed(env.ENGAGEGROOVY_SNOWFLAKE_TOKEN),
    stateFilePath: resolveStateFilePath(env),
  };
}

export function validateEngageGroovyConfig(config) {
  const errors = [];
  if (!config.enabled) return errors;
  if (!config.githubToken) errors.push("GITHUB_TOKEN is required when ENGAGEGROOVY_ENABLED=true");
  if (!config.githubRepo) errors.push("ENGAGEGROOVY_GITHUB_REPO or ENGAGEGROOVY_GITHUB_OWNER/ENGAGEGROOVY_GITHUB_REPO_NAME is required");
  return errors;
}

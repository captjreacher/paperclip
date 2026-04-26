import path from "node:path";
import { promises as fs, constants as fsConstants } from "node:fs";

export interface CpanelDeployConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  protocol: "ftp" | "ftps" | "sftp";
  remoteDir: string;
  localDir: string;
}

export interface CpanelDeployOptions {
  config: CpanelDeployConfig;
  dryRun?: boolean;
  preserveWellKnown?: boolean;
  verbose?: boolean;
}

export interface DeployResult {
  success: boolean;
  uploaded: string[];
  skipped: string[];
  errors: Array<{ path: string; error: string }>;
  dryRun: boolean;
}

export interface ValidateConfigResult {
  valid: boolean;
  errors: string[];
}

const UNSAFE_REMOTE_PATHS = new Set([
  "",
  "/",
  "home",
  "/home",
  "/home/",
  "~",
  "root",
  "/root",
  "tmp",
  "/tmp",
  "var",
  "/var",
  "etc",
  "/etc",
  "usr",
  "/usr",
  "bin",
  "/bin",
  "sbin",
  "/sbin",
  "lib",
  "/lib",
  "sys",
  "/sys",
  "proc",
  "/proc",
  "dev",
  "/dev",
]);

const EXCLUDED_FILES = new Set([
  ".env",
  ".env.local",
  ".env.development",
  ".env.production",
  ".env.example",
  ".env.backup",
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  ".gitignore",
  ".gitattributes",
  "README.md",
  "LICENSE",
  "tsconfig.json",
  "vitest.config.ts",
  ".eslintrc",
  ".prettierrc",
  "node_modules",
  ".git",
  ".DS_Store",
  "Thumbs.db",
]);

const SENSITIVE_KEYS = new Set([
  "password",
  "secret",
  "token",
  "key",
  "auth",
  "credential",
  "passwd",
  "authorization",
]);

export function redactSensitiveValue(value: string): string {
  if (value.length <= 4) return "*".repeat(value.length);
  return `${value[0]}${"*".repeat(Math.min(value.length - 2, 8))}${value[value.length - 1]}`;
}

export function redactConfig(config: CpanelDeployConfig): Record<string, string | number> {
  const redacted: Record<string, string | number> = { ...config };
  for (const key of Object.keys(redacted)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      const val = redacted[key];
      if (typeof val === "string") {
        redacted[key] = redactSensitiveValue(val);
      }
    }
  }
  return redacted;
}

export function validateRemoteDir(remoteDir: string): boolean {
  if (!remoteDir || typeof remoteDir !== "string") return false;
  const normalized = remoteDir.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\/|\/$/g, "");
  if (UNSAFE_REMOTE_PATHS.has(normalized)) return false;
  if (normalized === "") return false;
  if (normalized.startsWith("..")) return false;
  const segments = normalized.split("/");
  if (segments.some((s) => s === ".." || s === "")) return false;
  return true;
}

export function isExcludedFile(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  const basename = path.basename(normalized);
  if (EXCLUDED_FILES.has(basename)) return true;
  if (normalized.includes("/node_modules/") || normalized.startsWith("node_modules/")) return true;
  if (normalized.includes("/.git/") || normalized.startsWith(".git/")) return true;
  if (normalized.includes("/dist/") || normalized.startsWith("dist/")) return true;
  if (normalized.includes("/.next/") || normalized.startsWith(".next/")) return true;
  if (normalized.includes("/coverage/") || normalized.startsWith("coverage/")) return true;
  return false;
}

export async function validateLocalSource(localDir: string): Promise<ValidateConfigResult> {
  const errors: string[] = [];

  try {
    await fs.access(localDir, fsConstants.F_OK);
  } catch {
    errors.push(`Local source directory does not exist: ${localDir}`);
    return { valid: false, errors };
  }

  let isDir = false;
  try {
    const stats = await fs.stat(localDir);
    isDir = stats.isDirectory();
  } catch {
    errors.push(`Cannot access local source directory: ${localDir}`);
    return { valid: false, errors };
  }

  if (!isDir) {
    errors.push(`Local source is not a directory: ${localDir}`);
    return { valid: false, errors };
  }

  const indexPath = path.join(localDir, "index.html");
  try {
    await fs.access(indexPath, fsConstants.R_OK);
  } catch {
    errors.push(`index.html not found in source directory: ${localDir}/index.html`);
  }

  return { valid: errors.length === 0, errors };
}

export function validateConfig(config: Partial<CpanelDeployConfig>): ValidateConfigResult {
  const errors: string[] = [];

  if (!config.host || typeof config.host !== "string" || config.host.trim() === "") {
    errors.push("CPANEL_DEPLOY_HOST is required");
  }

  if (config.port !== undefined) {
    if (typeof config.port !== "number" || config.port < 1 || config.port > 65535) {
      errors.push("CPANEL_DEPLOY_PORT must be between 1 and 65535");
    }
  }

  if (!config.user || typeof config.user !== "string" || config.user.trim() === "") {
    errors.push("CPANEL_DEPLOY_USER is required");
  }

  if (!config.password || typeof config.password !== "string" || config.password.trim() === "") {
    errors.push("CPANEL_DEPLOY_PASSWORD is required");
  }

  if (config.protocol !== undefined) {
    if (!["ftp", "ftps", "sftp"].includes(config.protocol)) {
      errors.push("CPANEL_DEPLOY_PROTOCOL must be 'ftp', 'ftps', or 'sftp'");
    }
  }

  if (!config.remoteDir || typeof config.remoteDir !== "string" || config.remoteDir.trim() === "") {
    errors.push("CPANEL_DEPLOY_REMOTE_DIR is required");
  } else if (!validateRemoteDir(config.remoteDir)) {
    errors.push(
      `CPANEL_DEPLOY_REMOTE_DIR is unsafe: "${config.remoteDir}". Refusing to deploy to root or system directories.`,
    );
  }

  return { valid: errors.length === 0, errors };
}

export function readConfigFromEnv(): Partial<CpanelDeployConfig> {
  return {
    host: process.env.CPANEL_DEPLOY_HOST,
    port: process.env.CPANEL_DEPLOY_PORT ? parseInt(process.env.CPANEL_DEPLOY_PORT, 10) : undefined,
    user: process.env.CPANEL_DEPLOY_USER,
    password: process.env.CPANEL_DEPLOY_PASSWORD,
    protocol: (process.env.CPANEL_DEPLOY_PROTOCOL as CpanelDeployConfig["protocol"]) || undefined,
    remoteDir: process.env.CPANEL_DEPLOY_REMOTE_DIR,
    localDir: process.env.CPANEL_DEPLOY_LOCAL_DIR || "site",
  };
}
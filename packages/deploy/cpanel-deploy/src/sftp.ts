import { promises as fs, statSync } from "node:fs";
import path from "node:path";
import Client from "ssh2-sftp-client";
import type { CpanelDeployConfig, CpanelDeployOptions, DeployResult } from "./index.js";
import { isExcludedFile, redactConfig } from "./index.js";

export interface SftpProgress {
  path: string;
  action: "upload" | "skip" | "error";
  size?: number;
  error?: string;
}

export async function collectFiles(
  localDir: string,
  relativeDir: string = "",
): Promise<string[]> {
  const files: string[] = [];
  const fullDir = path.join(localDir, relativeDir);

  try {
    const entries = await fs.readdir(fullDir, { withFileTypes: true });

    for (const entry of entries) {
      const relativePath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        if (entry.name === ".well-known") {
          files.push(relativePath);
          continue;
        }
        if (isExcludedFile(relativePath)) continue;
        const subFiles = await collectFiles(localDir, relativePath);
        files.push(...subFiles);
      } else {
        files.push(relativePath);
      }
    }
  } catch {
    // Directory may not exist or be readable
  }

  return files.filter((f) => !isExcludedFile(f));
}

function getFileSize(filePath: string): number {
  try {
    return statSync(filePath).size;
  } catch {
    return 0;
  }
}

export async function deployViaSftp(
  options: CpanelDeployOptions,
  onProgress?: (progress: SftpProgress) => void,
): Promise<DeployResult> {
  const { config, dryRun = false, verbose = false } = options;
  const redacted = redactConfig(config);
  if (verbose) {
    console.log("[cpanel-deploy] Connecting via SFTP:", { ...redacted });
  }

  const client = new Client();
  const uploaded: string[] = [];
  const skipped: string[] = [];
  const errors: Array<{ path: string; error: string }> = [];

  try {
    const port = config.port || 22;

    await client.connect({
      host: config.host,
      port,
      username: config.user,
      password: config.password,
      readyTimeout: 30000,
      retries: 2,
    });

    if (verbose) {
      console.log("[cpanel-deploy] Connected to", config.host);
    }

    const remoteDir = config.remoteDir.replace(/\\/g, "/").replace(/\/+/g, "/");
    const dirExists = await client.exists(remoteDir);

    if (!dirExists && !dryRun) {
      await client.mkdir(remoteDir, true);
      if (verbose) {
        console.log("[cpanel-deploy] Created remote directory:", remoteDir);
      }
    }

    const files = await collectFiles(config.localDir);

    for (const file of files) {
      const fullLocalPath = path.join(config.localDir, file);
      const remotePath = `${remoteDir}/${file.replace(/\\/g, "/")}`;

      if (isExcludedFile(file)) {
        skipped.push(file);
        onProgress?.({ path: file, action: "skip" });
        continue;
      }

      try {
        const size = getFileSize(fullLocalPath);

        if (dryRun) {
          uploaded.push(file);
          onProgress?.({ path: file, action: "upload", size });
          if (verbose) {
            console.log(`[cpanel-deploy] [DRY-RUN] Would upload: ${file} (${size} bytes)`);
          }
        } else {
          const dirPath = path.dirname(remotePath);
          if (dirPath && dirPath !== "." && dirPath !== remoteDir) {
            try {
              await client.mkdir(dirPath, true);
            } catch {
              // Directory may already exist
            }
          }

          await client.put(fullLocalPath, remotePath);
          uploaded.push(file);
          onProgress?.({ path: file, action: "upload", size });
          if (verbose) {
            console.log(`[cpanel-deploy] Uploaded: ${file} (${size} bytes)`);
          }
        }
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        errors.push({ path: file, error });
        onProgress?.({ path: file, action: "error", error });
        if (verbose) {
          console.error(`[cpanel-deploy] Error uploading ${file}:`, error);
        }
      }
    }
  } finally {
    await client.end();
  }

  return {
    success: errors.length === 0,
    uploaded,
    skipped,
    errors,
    dryRun,
  };
}
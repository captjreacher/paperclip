import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const basicFtp = require("basic-ftp") as any;
const FtpClient = basicFtp.Client ?? basicFtp.default ?? basicFtp;

import { promises as fs, statSync } from "node:fs";
import path from "node:path";
import type { CpanelDeployConfig, CpanelDeployOptions, DeployResult } from "./index.js";
import { isExcludedFile, redactConfig } from "./index.js";

export interface FtpProgress {
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

async function getFtpClient(): Promise<any> {
  const mod = await import("basic-ftp");
  return mod.default;
}

export async function deployViaFtp(
  options: CpanelDeployOptions,
  onProgress?: (progress: FtpProgress) => void,
): Promise<DeployResult> {
  const { config, dryRun = false, verbose = false } = options;
  const redacted = redactConfig(config);
  if (verbose) {
    console.log("[cpanel-deploy] Connecting via FTP/FTPS:", { ...redacted });
  }

 const client = new FtpClient();  
  const uploaded: string[] = [];
  const skipped: string[] = [];
  const errors: Array<{ path: string; error: string }> = [];

  try {
    const port = config.port || 21;
    const secure = config.protocol === "ftps";

    await client.access({
  host: config.host,
  port: config.port,
  user: config.user,
  password: config.password,
  secure: config.protocol === "ftps",
});

console.log("FTP current directory:", await client.pwd());

    if (verbose) {
      console.log("[cpanel-deploy] Connected to", config.host);
    }

    const remoteDir = config.remoteDir.replace(/\\/g, "/").replace(/\/+/g, "/");
    try {
      await client.cd(remoteDir);
    } catch {
      if (!dryRun) {
        await client.send(`MKD ${remoteDir}`);
        await client.cd(remoteDir);
      }
      if (verbose) {
        console.log("[cpanel-deploy] Created remote directory:", remoteDir);
      }
    }

    const files = await collectFiles(config.localDir);

    for (const file of files) {
      const fullLocalPath = path.join(config.localDir, file);
      const remotePath = file.replace(/\\/g, "/");

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
          if (dirPath && dirPath !== ".") {
            try {
              await client.send(`MKD ${dirPath}`);
            } catch {
              // Directory may already exist
            }
          }

          await client.uploadFrom(fullLocalPath, remotePath);
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
    await client.close();
  }

  return {
    success: errors.length === 0,
    uploaded,
    skipped,
    errors,
    dryRun,
  };
}
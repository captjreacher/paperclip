import pc from "picocolors";
import type {
  CpanelDeployConfig,
  CpanelDeployOptions,
  DeployResult,
  ValidateConfigResult,
} from "./index.js";
import {
  isExcludedFile,
  readConfigFromEnv,
  redactConfig,
  validateConfig,
  validateLocalSource,
  validateRemoteDir,
} from "./index.js";
import { deployViaFtp } from "./ftp.js";
import { deployViaSftp } from "./sftp.js";

export interface DeployOptions {
  config?: Partial<CpanelDeployConfig>;
  dryRun?: boolean;
  verbose?: boolean;
  preserveWellKnown?: boolean;
}

export async function deploy(options: DeployOptions = {}): Promise<DeployResult> {
  const {
    config: configOverrides = {},
    dryRun = false,
    verbose = false,
    preserveWellKnown = true,
  } = options;

  const envConfig = readConfigFromEnv();
  const config: CpanelDeployConfig = {
    host: configOverrides.host ?? envConfig.host ?? "",
    port: configOverrides.port ?? envConfig.port ?? 22,
    user: configOverrides.user ?? envConfig.user ?? "",
    password: configOverrides.password ?? envConfig.password ?? "",
    protocol: configOverrides.protocol ?? envConfig.protocol ?? "sftp",
    remoteDir: configOverrides.remoteDir ?? envConfig.remoteDir ?? "",
    localDir: configOverrides.localDir ?? envConfig.localDir ?? "site",
  };

  if (verbose) {
    console.log(pc.cyan("[cpanel-deploy] Starting deployment..."));
    console.log(pc.dim("  Protocol:"), config.protocol);
    console.log(pc.dim("  Host:"), config.host);
    console.log(pc.dim("  Remote:"), config.remoteDir);
    console.log(pc.dim("  Local:"), config.localDir);
    if (dryRun) {
      console.log(pc.yellow("  Mode: DRY-RUN (no files will be uploaded)"));
    }
    console.log();
  }

  const configValidation = validateConfig(config);
  if (!configValidation.valid) {
    console.error(pc.red("[cpanel-deploy] Configuration errors:"));
    for (const error of configValidation.errors) {
      console.error(pc.red(`  - ${error}`));
    }
    throw new Error(`Invalid configuration: ${configValidation.errors.join("; ")}`);
  }

  const localValidation = await validateLocalSource(config.localDir);
  if (!localValidation.valid) {
    console.error(pc.red("[cpanel-deploy] Local source validation errors:"));
    for (const error of localValidation.errors) {
      console.error(pc.red(`  - ${error}`));
    }
    throw new Error(`Invalid local source: ${localValidation.errors.join("; ")}`);
  }

  const deployOptions: CpanelDeployOptions = {
    config,
    dryRun,
    verbose,
    preserveWellKnown,
  };

  let result: DeployResult;
  if (config.protocol === "ftp" || config.protocol === "ftps") {
    result = await deployViaFtp(deployOptions, (progress) => {
      if (verbose) {
        const color = progress.action === "error" ? pc.red : pc.green;
        console.log(color(`  ${progress.action}: ${progress.path}`));
      }
    });
  } else {
    result = await deployViaSftp(deployOptions, (progress) => {
      if (verbose) {
        const color = progress.action === "error" ? pc.red : pc.green;
        console.log(color(`  ${progress.action}: ${progress.path}`));
      }
    });
  }

  return result;
}

export async function deployWithLogging(options: DeployOptions = {}): Promise<DeployResult> {
  const result = await deploy(options);
  const { dryRun, success, uploaded, skipped, errors } = result;

  console.log();
  if (dryRun) {
    console.log(pc.yellow("═".repeat(50)));
    console.log(pc.yellow("  DRY-RUN COMPLETE - No files were uploaded"));
    console.log(pc.yellow("═".repeat(50)));
  } else {
    console.log(pc.green("═".repeat(50)));
    console.log(pc.green("  DEPLOYMENT COMPLETE"));
    console.log(pc.green("═".repeat(50)));
  }

  console.log(pc.dim(`  Uploaded: ${pc.bold(uploaded.length.toString())} files`));
  console.log(pc.dim(`  Skipped:  ${pc.bold(skipped.length.toString())} files`));
  if (errors.length > 0) {
    console.log(pc.red(`  Errors:   ${pc.bold(errors.length.toString())} files`));
  }
  console.log();

  if (errors.length > 0) {
    console.error(pc.red("Failed files:"));
    for (const { path, error } of errors) {
      console.error(pc.red(`  - ${path}: ${error}`));
    }
    console.log();
  }

  if (!success && !dryRun) {
    throw new Error(`Deployment failed with ${errors.length} error(s)`);
  }

  return result;
}

export {
  isExcludedFile,
  redactConfig,
  validateConfig,
  validateLocalSource,
  validateRemoteDir,
  readConfigFromEnv,
  type CpanelDeployConfig,
  type CpanelDeployOptions,
  type DeployResult,
  type ValidateConfigResult,
} from "./index.js";
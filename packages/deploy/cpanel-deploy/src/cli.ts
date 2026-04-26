#!/usr/bin/env node

import pc from "picocolors";
import { deployWithLogging } from "./deploy.js";

interface CliArgs {
  dryRun: boolean;
  verbose: boolean;
  help: boolean;
}

function parseArgs(args: string[]): CliArgs {
  const parsed: CliArgs = {
    dryRun: false,
    verbose: false,
    help: false,
  };

  for (const arg of args) {
    const normalized = arg.toLowerCase();
    if (normalized === "--dry-run" || normalized === "-n") {
      parsed.dryRun = true;
    } else if (normalized === "--verbose" || normalized === "-v") {
      parsed.verbose = true;
    } else if (normalized === "--help" || normalized === "-h") {
      parsed.help = true;
    }
  }

  return parsed;
}

function printHelp() {
  console.log(`
${pc.bold("cpanel-deploy")} - Upload website files to cPanel via FTP/SFTP

${pc.bold("USAGE")}
  cpanel-deploy [OPTIONS]

${pc.bold("OPTIONS")}
  --dry-run, -n   Show what would be uploaded without making changes
  --verbose, -v   Show detailed progress for each file
  --help, -h       Show this help message

${pc.bold("ENVIRONMENT VARIABLES")}
  CPANEL_DEPLOY_HOST        cPanel server hostname or IP
  CPANEL_DEPLOY_PORT        SSH/FTP port (default: 22 for SFTP, 21 for FTP)
  CPANEL_DEPLOY_USER        cPanel username
  CPANEL_DEPLOY_PASSWORD    cPanel password or API token
  CPANEL_DEPLOY_PROTOCOL    Connection protocol: sftp, ftp, or ftps (default: sftp)
  CPANEL_DEPLOY_REMOTE_DIR  Target directory on cPanel (e.g., public_html, engagegroovy.com)
  CPANEL_DEPLOY_LOCAL_DIR   Local source directory (default: ./site)

${pc.bold("EXAMPLES")}
  Dry run to preview changes:
    cpanel-deploy --dry-run

  Actual deployment:
    cpanel-deploy

  Verbose output:
    cpanel-deploy --verbose

${pc.bold("SAFETY")}
  - Never deploys to root directories (/, /home, /tmp, etc.)
  - Excludes sensitive files (.env, node_modules, .git, package.json)
  - Requires index.html in source directory
  - Never deletes remote files (additive upload only)
  - .well-known directory is preserved

${pc.bold("AGENT INSTRUCTIONS")}
  Agents should only edit files in the /site directory.
  Use "pnpm deploy:cpanel --dry-run" to preview changes before deployment.
  Run "pnpm deploy:cpanel" to deploy to cPanel.
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  console.log();
  console.log(pc.bold(pc.cyan("cPanel File Deployment")));
  console.log(pc.dim("=".repeat(50)));
  console.log();

  try {
    const result = await deployWithLogging({
      dryRun: args.dryRun,
      verbose: args.verbose,
    });

    if (!result.success) {
      console.error(pc.red("Deployment completed with errors."));
      process.exit(1);
    }

    console.log(pc.green("Deployment completed successfully."));
    process.exit(0);
  } catch (err) {
    console.error();
    console.error(pc.red("Deployment failed:"));
    if (err instanceof Error) {
      console.error(pc.red(`  ${err.message}`));
    } else {
      console.error(pc.red(`  ${String(err)}`));
    }
    console.log();
    console.log(pc.dim("Run with --help for usage information."));
    process.exit(1);
  }
}

main();
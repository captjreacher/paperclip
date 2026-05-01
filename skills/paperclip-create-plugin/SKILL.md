````md
# SKILL.md — Create and Install Custom Paperclip Plugins

## Purpose

Create, validate, build, install, and activate custom Paperclip plugins in a local development environment.

This skill is used when adding new plugin capabilities such as file tools, UI extensions, automation hooks, workspace tools, webhooks, or agent-accessible functions.

---

## When to use this skill

Use this skill when:

- Creating a new Paperclip plugin
- Updating an existing plugin manifest
- Registering agent tools
- Installing a local plugin into a Paperclip instance
- Debugging plugin activation failures
- Fixing Windows-specific local plugin issues

---

## Core assumptions

- Repo root is:

```powershell
C:\dev_local\paperclip
````

* Paperclip is run through pnpm:

```powershell
pnpm paperclipai run
```

* Local API usually runs on:

```text
http://127.0.0.1:3101
```

* Plugins live under:

```text
packages/plugins/
```

---

## Required plugin structure

A custom plugin should normally include:

```text
packages/plugins/<plugin-name>/
  package.json
  tsconfig.json
  src/
    index.ts
    manifest.ts
    worker.ts
  dist/
    index.js
    manifest.js
    worker.js
```

---

## Required package.json shape

Use built output, not source files, for package exports.

```json
{
  "name": "@paperclipai/plugin-example",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "exports": {
    ".": "./dist/index.js"
  },
  "paperclipPlugin": {
    "manifest": "./dist/manifest.js",
    "worker": "./dist/worker.js"
  },
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@paperclipai/plugin-sdk": "workspace:*"
  },
  "devDependencies": {
    "@types/node": "^25.6.0"
  }
}
```

---

## Required manifest shape

`src/manifest.ts` must use the current Paperclip plugin schema.

```ts
export default {
  id: "example-plugin",
  apiVersion: 1,
  displayName: "Example Plugin",
  author: "Paperclip",
  version: "0.1.0",
  description: "Example plugin for Paperclip.",

  categories: ["workspace"],

  capabilities: [
    "agent.tools.register",
    "plugin.state.read",
    "plugin.state.write"
  ],

  entrypoints: {
    worker: "./dist/worker.js"
  },

  tools: [
    {
      name: "example_tool",
      displayName: "Example Tool",
      description: "Example agent-accessible tool.",
      parametersSchema: {
        type: "object",
        properties: {}
      }
    }
  ]
};
```

Valid categories are:

```text
connector
workspace
automation
ui
```

Do not use old categories such as:

```text
developer-tools
agent-tools
```

Capabilities must be strings, not objects.

---

## Required index export

`src/index.ts` must default-export the manifest.

```ts
import manifest from "./manifest.js";

export default manifest;
```

This is required because the plugin loader expects the plugin package default export to resolve to the manifest.

---

## Required worker structure

The worker must start a long-running Plugin SDK process.

Do not export loose functions only. If the file executes and exits normally, Paperclip activation will fail because the worker process terminates.

Use:

```ts
import { definePlugin, runWorker } from "@paperclipai/plugin-sdk";

const plugin = definePlugin((ctx) => {
  ctx.tools.register("example_tool", async () => {
    return {
      ok: true,
      message: "Example tool executed"
    };
  });
});

runWorker(plugin);
```

Key rule:

> A plugin worker must call `runWorker(...)` and stay alive.

---

## Build process

From repo root:

```powershell
cd C:\dev_local\paperclip

Remove-Item .\packages\plugins\<plugin-name>\dist -Recurse -Force -ErrorAction SilentlyContinue

pnpm --filter @paperclipai/plugin-<plugin-name> build
```

Verify output:

```powershell
Get-Content .\packages\plugins\<plugin-name>\dist\index.js
Get-Content .\packages\plugins\<plugin-name>\dist\manifest.js
Get-Content .\packages\plugins\<plugin-name>\dist\worker.js
```

Expected:

* `dist/index.js` default-exports manifest
* `dist/manifest.js` has `id`, `apiVersion`, `displayName`, `author`, `entrypoints`
* `dist/worker.js` calls SDK worker logic

---

## Install process

Start Paperclip in one terminal:

```powershell
cd C:\dev_local\paperclip
pnpm paperclipai run
```

In a second terminal:

```powershell
cd C:\dev_local\paperclip
$env:PAPERCLIP_API_URL="http://127.0.0.1:3101"

curl.exe http://127.0.0.1:3101/api/health

pnpm paperclipai plugin install .\packages\plugins\<plugin-name>

pnpm paperclipai plugin list
```

Expected result:

```text
status=ready
```

---

## Windows-specific fixes

### 1. tsx loader must use file URL

In `server/src/services/plugin-loader.ts`, Windows may fail with:

```text
ERR_UNSUPPORTED_ESM_URL_SCHEME
Received protocol 'c:'
```

Fix:

```ts
import { pathToFileURL } from "node:url";
```

Then:

```ts
workerOptions.execArgv = ["--import", pathToFileURL(DEV_TSX_LOADER_PATH).href];
```

### 2. Avoid raw Windows paths in Node ESM imports

If dynamically importing filesystem paths, convert with:

```ts
import { pathToFileURL } from "node:url";

await import(pathToFileURL(filePath).href);
```

---

## Common failure modes

### API unreachable

Error:

```text
Could not reach the Paperclip API
```

Check:

```powershell
curl.exe http://127.0.0.1:3101/api/health
```

If it fails, restart:

```powershell
pnpm paperclipai run
```

---

### Invalid manifest

Error:

```text
id: Required
apiVersion: Invalid literal value, expected 1
displayName: Required
author: Required
entrypoints: Required
```

Cause:

* Loader is reading the wrong export
* `src/index.ts` does not default-export manifest
* `package.json` exports source instead of dist
* manifest uses old schema

Fix:

```ts
import manifest from "./manifest.js";
export default manifest;
```

And:

```json
"exports": {
  ".": "./dist/index.js"
}
```

---

### Worker exits immediately

Error:

```text
Worker initialize failed
Worker process exited (code=0)
```

Cause:

* `src/worker.ts` exported functions but did not start the SDK worker

Fix:

```ts
import { definePlugin, runWorker } from "@paperclipai/plugin-sdk";

const plugin = definePlugin((ctx) => {
  ctx.tools.register("tool_name", async () => {
    return { ok: true };
  });
});

runWorker(plugin);
```

---

### Plugin already installed

If plugin is installed but broken:

```powershell
pnpm paperclipai plugin list
```

Uninstall using the exact key shown:

```powershell
pnpm paperclipai plugin uninstall <plugin-key>
```

Do not uninstall a plugin key that does not appear in the list.

---

## Acceptance criteria

A custom plugin is complete when:

* Build succeeds
* Install succeeds
* `pnpm paperclipai plugin list` shows `status=ready`
* Plugin appears in the UI
* Declared tools are registered
* Worker remains running
* No Windows ESM path errors occur

```
```

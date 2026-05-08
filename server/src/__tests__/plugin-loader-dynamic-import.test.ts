import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { pluginLoader } from "../services/plugin-loader.js";
import { toDynamicImportSpecifier } from "../utils/dynamic-import.js";

const tempDirs: string[] = [];

function createTempPlugin(): string {
  const pluginDir = mkdtempSync(path.join(process.cwd(), ".tmp-paperclip-plugin-"));
  tempDirs.push(pluginDir);
  mkdirSync(path.join(pluginDir, "dist"));
  writeFileSync(
    path.join(pluginDir, "package.json"),
    JSON.stringify({
      name: "paperclip-plugin-windows-path-test",
      version: "1.0.0",
      type: "module",
      paperclipPlugin: {
        manifest: "./dist/manifest.js",
      },
    }),
  );
  writeFileSync(
    path.join(pluginDir, "dist", "manifest.js"),
    `export default {
      id: "paperclip.windows_path_test",
      apiVersion: 1,
      version: "1.0.0",
      displayName: "Windows Path Test",
      description: "Verifies manifests load through file URLs.",
      author: "Paperclip",
      categories: ["connector"],
      capabilities: ["companies.read"],
      entrypoints: { worker: "./dist/worker.js" }
    };`,
  );
  return pluginDir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("plugin loader dynamic imports", () => {
  it("loads local filesystem manifest paths through valid ESM import specifiers", async () => {
    const pluginDir = createTempPlugin();
    const loader = pluginLoader({} as never, {
      enableLocalFilesystem: false,
      enableNpmDiscovery: false,
    });

    const manifest = await loader.loadManifest(pluginDir);

    expect(manifest?.id).toBe("paperclip.windows_path_test");
  });

  it("preserves URL and package dynamic import specifiers", () => {
    expect(toDynamicImportSpecifier(path.resolve("plugin.js"))).toMatch(/^file:\/\//);
    expect(toDynamicImportSpecifier("node:fs")).toBe("node:fs");
    expect(toDynamicImportSpecifier("file:///tmp/plugin.js")).toBe("file:///tmp/plugin.js");
    expect(toDynamicImportSpecifier("@scope/plugin")).toBe("@scope/plugin");
  });
});

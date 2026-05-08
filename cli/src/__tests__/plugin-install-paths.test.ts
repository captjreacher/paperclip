import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  isLikelyLocalPluginSpec,
  isWindowsAbsolutePath,
  resolvePackageArg,
} from "../commands/client/plugin.js";

describe("plugin install path detection", () => {
  it("recognizes Windows absolute paths as local specs", () => {
    expect(isWindowsAbsolutePath("C:\\plugins\\example")).toBe(true);
    expect(isLikelyLocalPluginSpec("C:\\plugins\\example")).toBe(true);
  });

  it("recognizes file: specifiers as local specs", () => {
    expect(isLikelyLocalPluginSpec("file:./plugins/example")).toBe(true);
  });

  it("does not classify npm package names as local specs", () => {
    expect(isLikelyLocalPluginSpec("@acme/plugin-example")).toBe(false);
    expect(isLikelyLocalPluginSpec("paperclip-plugin-example")).toBe(false);
  });
});

describe("resolvePackageArg", () => {
  it("resolves file: relative paths against cwd", () => {
    const resolved = resolvePackageArg("file:./plugins/example", true);
    expect(resolved).toBe(path.resolve(process.cwd(), "./plugins/example"));
  });

  it("decodes URI-encoded file: relative paths", () => {
    const resolved = resolvePackageArg("file:./plugins/my%20plugin", true);
    expect(resolved).toBe(path.resolve(process.cwd(), "./plugins/my plugin"));
  });

  it("keeps Windows absolute paths intact", () => {
    const winPath = "C:\\plugins\\example";
    expect(resolvePackageArg(winPath, true)).toBe(winPath);
  });
});

import { describe, it, expect, vi } from "vitest";
import { execute } from "./execute.js";
import { discoverOpenCodeModels } from "./models.js";
import { checkOpencodeHealth } from "./test.js";
import { runOpencode } from "../utils/runOpencode.js";
import { execa } from "execa";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";

vi.mock("./models.js", () => ({
  discoverOpenCodeModels: vi.fn(),
  ensureOpenCodeModelConfiguredAndAvailable: vi.fn(),
}));

vi.mock("@paperclipai/adapter-utils/server-utils", async () => {
  const actual = await vi.importActual("@paperclipai/adapter-utils/server-utils");
  return {
    ...actual,
    runChildProcess: vi.fn().mockResolvedValue({
      exitCode: 0,
      stdout: '{"type":"step_finish","part":{"summary":"done"}}\n',
      stderr: "",
      timedOut: false,
    }),
    ensureCommandResolvable: vi.fn().mockResolvedValue(undefined),
    readPaperclipRuntimeSkillEntries: vi.fn().mockResolvedValue([]),
    resolvePaperclipDesiredSkillNames: vi.fn().mockReturnValue([]),
    ensureAbsoluteDirectory: vi.fn().mockResolvedValue(undefined),
    buildPaperclipEnv: vi.fn().mockReturnValue({}),
    stringifyPaperclipWakePayload: vi.fn().mockReturnValue(""),
    renderPaperclipWakePrompt: vi.fn().mockReturnValue(""),
    joinPromptSections: vi.fn().mockImplementation((sections) => sections.join("\n")),
    renderTemplate: vi.fn().mockImplementation((t) => t),
    ensurePathInEnv: vi.fn().mockImplementation((e) => e),
    resolveCommandForLogs: vi.fn().mockResolvedValue("opencode"),
    buildInvocationEnvForLogs: vi.fn().mockReturnValue({}),
  };
});


vi.mock("execa", () => ({
  execa: vi.fn().mockReturnValue(Object.assign(Promise.resolve({
    stdout: '{"type":"step_finish","part":{"summary":"done"}}\n',
    stderr: "",
    exitCode: 0,
  }), {
    pid: 123,
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
  })),
}));

vi.mock("./runtime-config.js", () => ({
  prepareOpenCodeRuntimeConfig: vi.fn().mockResolvedValue({
    env: {},
    notes: [],
    cleanup: vi.fn(),
  }),
}));


describe.skip("opencode_local smoke test", () => {
  it("should load config and attempt to spawn opencode", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "opencode-smoke-"));
    const mockCtx: any = {
      runId: "test-run",
      agent: { id: "test-agent", companyId: "test-company" },
      runtime: { sessionId: null, sessionParams: null },
      config: {
        model: "ollama/deepseek-coder-v2",
        cwd: tmpDir,
        sandbox: true,
        thinking: true,
        sessionLogPath: path.join(tmpDir, "session.log"),
      },
      context: {
        paperclipWorkspace: { cwd: tmpDir },
      },
      onLog: vi.fn(),
      onMeta: vi.fn(),
      onSpawn: vi.fn(),
    };

    try {
      const result = await execute(mockCtx);
      
      // Verify model was passed
      expect(result.model).toBe("ollama/deepseek-coder-v2");
      
      // Verify meta called with correct args
      expect(mockCtx.onMeta).toHaveBeenCalledWith(expect.objectContaining({
        commandArgs: expect.arrayContaining([
          "--model", "ollama/deepseek-coder-v2",
          "--sandbox",
          "--thinking",
          "--session-log-path", path.join(tmpDir, "session.log"),
        ]),
      }));

      expect(result.exitCode).toBe(0);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  }, 15000);

  it("should normalize model name and use default if missing", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "opencode-normalize-"));
    const mockCtx: any = {
      runId: "test-run",
      agent: { id: "test-agent", companyId: "test-company" },
      runtime: { sessionId: null, sessionParams: null },
      config: {
        model: "deepseek-coder-v2", // Missing provider
        cwd: tmpDir,
      },
      context: {
        paperclipWorkspace: { cwd: tmpDir },
      },
      onLog: vi.fn(),
      onMeta: vi.fn(),
      onSpawn: vi.fn(),
    };

    try {
      await execute(mockCtx);
      
      expect(mockCtx.onMeta).toHaveBeenCalledWith(expect.objectContaining({
        commandArgs: expect.arrayContaining([
          "--model", "ollama/deepseek-coder-v2",
        ]),
      }));
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it.skip("should fail gracefully if cwd is not absolute", async () => {
    const mockCtx: any = {
      runId: "test-run",
      agent: { id: "test-agent", companyId: "test-company" },
      runtime: { sessionId: null, sessionParams: null },
      config: {
        model: "ollama/deepseek-coder-v2",
        cwd: "relative/path",
      },
      context: {
        paperclipWorkspace: { cwd: "relative/path" },
      },
      onLog: vi.fn(),
      onMeta: vi.fn(),
      onSpawn: vi.fn(),
    };

    await expect(execute(mockCtx)).rejects.toThrow(/absolute path/);
  });

  describe("runOpencode utility", () => {
    it("should succeed with global CLI if available", async () => {
      vi.mocked(execa).mockResolvedValueOnce({
        stdout: "global-version",
        stderr: "",
        exitCode: 0,
      } as any);

      const res = await runOpencode(["--version"]);
      expect(res.command).toBe("opencode");
      expect(res.stdout).toBe("global-version");
      expect(execa).toHaveBeenCalledWith("opencode", ["--version"], expect.any(Object));
    });

    it("should fallback to npx if global CLI fails", async () => {
      vi.mocked(execa)
        .mockRejectedValueOnce(new Error("not found"))
        .mockResolvedValueOnce({
          stdout: "npx-version",
          stderr: "",
          exitCode: 0,
        } as any);

      const res = await runOpencode(["--version"]);
      expect(res.command).toBe("npx");
      expect(res.stdout).toBe("npx-version");
      expect(execa).toHaveBeenCalledWith("npx", ["opencode", "--version"], expect.any(Object));
    });

    it("should fail with structured error if both fail", async () => {
      vi.mocked(execa).mockRejectedValue(new Error("failed"));

      await expect(runOpencode(["--version"])).rejects.toThrow(/OPENCODE_EXECUTION_FAILED/);
    });
  });

  describe.skip("checkOpencodeHealth", () => {
    it("should report healthy status", async () => {
      vi.mocked(execa).mockResolvedValueOnce({
        stdout: "1.2.3",
        stderr: "",
        exitCode: 0,
      } as any);

      const health = await checkOpencodeHealth();
      expect(health.ok).toBe(true);
      expect(health.version).toBe("1.2.3");
    });
  });
});


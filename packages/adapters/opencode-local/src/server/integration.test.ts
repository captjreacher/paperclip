import { describe, it, expect } from "vitest";
import { execute } from "./execute.js";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";

import { ensureCommandResolvable } from "@paperclipai/adapter-utils/server-utils";
import { listOpenCodeModels } from "./models.js";

// This test runs real OpenCode processes.
// Requirements:
// 1. OpenCode CLI installed and in PATH
// 2. Ollama running with deepseek-coder-v2 pulled
// 3. opencode.jsonc configured for ollama/deepseek-coder-v2
describe("opencode_local integration test", () => {
  it.skipIf(!process.env.OPENCODE_SMOKE_INTEGRATION)("should run real execution with a simple prompt", async () => {
    // Pre-flight check: if opencode is not in PATH, skip the test instead of failing
    try {
      await ensureCommandResolvable("opencode", process.cwd(), process.env);
    } catch {
      console.warn("\n[opencode_local] Skipping integration test: 'opencode' command not found in PATH.");
      return;
    }

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "opencode-int-"));
    
    // Create a dummy file to list
    await fs.writeFile(path.join(tmpDir, "hello.txt"), "Hello World");

    const availableModels = await listOpenCodeModels();
    if (availableModels.length === 0) {
      console.warn("\n[opencode_local] Skipping integration test: No models available in 'opencode models'.");
      return;
    }

    const defaultModel = "ollama/deepseek-coder-v2";
    const ollamaModels = availableModels.filter(m => m.id.startsWith("ollama/"));
    const modelToUse = availableModels.some(m => m.id === defaultModel) 
      ? defaultModel 
      : (ollamaModels[0]?.id || availableModels[0].id);

    console.log(`[opencode_local] Using model for integration test: ${modelToUse}`);

    const mockCtx: any = {
      runId: `int-${Date.now()}`,
      agent: { id: "int-agent", companyId: "int-company" },
      runtime: { sessionId: null, sessionParams: null },
      config: {
        model: modelToUse,
        cwd: tmpDir,
      },
      context: {
        paperclipWorkspace: { cwd: tmpDir },
        paperclipWake: { reason: "Integration testing" },
      },
      onLog: async (stream: string, chunk: string) => {
        process.stdout.write(`[${stream}] ${chunk}`);
      },
      onMeta: async (meta: any) => {
        console.log("\n[meta] Command:", meta.command);
        console.log("[meta] Args:", meta.commandArgs.join(" "));
      },
      onSpawn: async () => {},
    };

    try {
      console.log(`\nStarting integration test in ${tmpDir}...`);
      const result = await execute(mockCtx);
      
      console.log("\nIntegration Result Summary:", result.summary);
      expect(result.errorMessage, `Execution failed: ${result.errorMessage}`).toBeNull();
      expect(result.exitCode).toBe(0);
      
      // The model should have summarized the structure as requested by the wake reason or prompt
      // Note: execute.ts joins prompt sections, we might want to pass a specific prompt via config.promptTemplate
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  }, 120000); // 2 minute timeout for local LLM
});

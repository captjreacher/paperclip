import { resolveEngageGroovyConfig, validateEngageGroovyConfig } from "./config.js";
import { createGitHubWorkflow } from "./githubWorkflow.js";
import { createSnowflakeEmitter } from "./snowflakeEmitter.js";
import { createPaperclipBridge } from "./paperclipBridge.js";

export async function bootstrapEngageGroovyOverlay(input) {
  const config = resolveEngageGroovyConfig(input.env);
  if (!config.enabled) {
    return {
      enabled: false,
      dispose() {},
    };
  }

  const validationErrors = validateEngageGroovyConfig(config);
  if (validationErrors.length > 0) {
    input.logger?.warn?.({ validationErrors }, "ENGAGEGROOVY overlay disabled due to configuration errors");
    return {
      enabled: false,
      dispose() {},
    };
  }

  const githubWorkflow = createGitHubWorkflow({
    config,
    logger: input.logger,
    fetchImpl: input.fetchImpl,
  });
  const snowflakeEmitter = createSnowflakeEmitter({
    config,
    logger: input.logger,
    fetchImpl: input.fetchImpl,
  });
  const bridge = createPaperclipBridge({
    config,
    eventBus: input.eventBus,
    githubWorkflow,
    snowflakeEmitter,
    loadIssue: input.loadIssue,
    logger: input.logger,
  });

  bridge.start();
  input.logger?.info?.(
    {
      githubRepo: config.githubRepo,
      snowflakeEnabled: snowflakeEmitter.enabled,
      stateFilePath: config.stateFilePath,
    },
    "ENGAGEGROOVY overlay initialized",
  );

  return {
    enabled: true,
    dispose() {
      bridge.dispose();
    },
  };
}

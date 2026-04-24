export function createSnowflakeEmitter(input) {
  const { config, logger } = input;
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;

  if (!config.snowflakeEnabled) {
    return {
      enabled: false,
      async emit() {
        return { delivered: false };
      },
    };
  }

  if (typeof fetchImpl !== "function") {
    throw new Error("Snowflake emitter requires a fetch implementation");
  }

  return {
    enabled: true,

    async emit(status, inputEvent) {
      const body = {
        event_type: "agency_event",
        entity_type: inputEvent.entityType ?? "issue",
        entity_id: String(inputEvent.entityId),
        status,
        payload: {
          stage: inputEvent.stage ?? null,
          actor_role: inputEvent.actorRole ?? null,
          artifact_type: inputEvent.artifactType ?? null,
          sub_issue: Boolean(inputEvent.subIssue),
        },
      };

      try {
        const response = await fetchImpl(config.snowflakeUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(config.snowflakeToken ? { Authorization: `Bearer ${config.snowflakeToken}` } : {}),
          },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(`Snowflake emitter request failed (${response.status} ${response.statusText}): ${text}`);
        }

        return { delivered: true };
      } catch (error) {
        logger?.warn?.({ err: error, status, entityId: inputEvent.entityId }, "ENGAGEGROOVY snowflake emit failed");
        return { delivered: false, error };
      }
    },
  };
}

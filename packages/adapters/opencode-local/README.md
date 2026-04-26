# @paperclipai/adapter-opencode-local

Paperclip adapter for the OpenCode CLI runtime.

## Overview

This adapter allows Paperclip agents to execute using a local installation of [OpenCode](https://github.com/opencodeai/opencode). It supports:

- Local LLM providers (Ollama, LM Studio) via OpenCode's provider routing
- Session resume across heartbeats
- Headless execution with auto-approved permissions
- Restricted sandbox mode
- Explicit thinking/reasoning output

## Setup

See the [OpenCode Local Adapter Setup Guide](../../docs/adapters/opencode-local-setup.md) for detailed installation and configuration instructions.

## Configuration

The adapter expects the following fields in \`adapterConfig\`:

| Field | Type | Description |
|-------|------|-------------|
| \`model\` | string | **Required**. OpenCode model id (e.g. \`ollama/deepseek-coder-v2\`) |
| \`cwd\` | string | **Required**. Absolute path to the agent's workspace |
| \`sandbox\` | boolean | Enable restricted sandbox mode |
| \`thinking\` | boolean | Enable explicit thinking output |
| \`sessionLogPath\` | string | Path to write OpenCode session logs. Defaults to Paperclip's instance log directory. |
| \`variant\` | string | Provider-specific reasoning/profile variant |


## Development

\`\`\`bash
pnpm test
\`\`\`

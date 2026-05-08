# File Manager Plugin

First-party local plugin for exposing a safe filesystem root to Paperclip.

By default it exposes `.agents` from the Paperclip server working directory, which makes local agent documents and skills visible in the sidebar.

## Features

- Sidebar file tree and read-only file preview
- Agent tools:
  - `list_dir`
  - `read_file`
  - `write_file`
- Configurable root path
- Read-only mode enabled by default
- Path traversal protection for every operation

## Local Install

From the repo root:

```bash
pnpm --filter @paperclipai/plugin-file-manager build
pnpm paperclipai plugin install ./packages/plugins/file-manager
```

The plugin is also listed by `/api/plugins/examples` so it can be installed from the bundled examples UI.

## Configuration

| Setting | Default | Description |
| --- | --- | --- |
| `rootPath` | `.agents` | Absolute path, or path relative to the server working directory, exposed by the plugin. |
| `rootLabel` | `Agent documents` | Label shown above the sidebar tree. |
| `readOnly` | `true` | Blocks the `write_file` tool when enabled. |


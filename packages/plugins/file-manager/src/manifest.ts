export default {
  id: "file-manager",
  apiVersion: 1,
  displayName: "File Manager",
  author: "Paperclip",
  version: "0.1.0",
  description: "Safe file operations for agent document folders.",
  categories: ["workspace"],
  capabilities: [
    "agent.tools.register",
    "plugin.state.read",
    "plugin.state.write",
    "ui.sidebar.register"
  ],
  entrypoints: {
    worker: "./dist/worker.js",
    ui: "./dist/ui"
  },
  instanceConfigSchema: {
    type: "object",
    properties: {
      rootPath: {
        type: "string",
        title: "Root Path",
        default: ".agents",
        description: "Absolute path, or path relative to the Paperclip server working directory, exposed by this plugin.",
      },
      rootLabel: {
        type: "string",
        title: "Root Label",
        default: "Agent documents",
        description: "Label shown above the file tree.",
      },
      readOnly: {
        type: "boolean",
        title: "Read Only",
        default: true,
        description: "Blocks plugin write_file tool calls when enabled.",
      },
    },
  },
  ui: {
    slots: [
      {
        type: "sidebar",
        id: "file-manager-sidebar",
        displayName: "File Manager",
        exportName: "FileManagerSidebar",
      },
      {
        type: "sidebarPanel",
        id: "file-manager-sidebar-panel",
        displayName: "File Manager Panel",
        exportName: "FileManagerSidebarPanel",
      }
    ]
  },
  tools: [
    {
      name: "list_dir",
      displayName: "List Directory",
      description: "List files in the configured agent document root.",
      parametersSchema: {
        type: "object",
        properties: {
          path: { type: "string" }
        }
      }
    },
    {
      name: "read_file",
      displayName: "Read File",
      description: "Read a file from the configured agent document root.",
      parametersSchema: {
        type: "object",
        required: ["path"],
        properties: {
          path: { type: "string" }
        }
      }
    },
    {
      name: "write_file",
      displayName: "Write File",
      description: "Write a file inside the configured agent document root when writes are enabled.",
      parametersSchema: {
        type: "object",
        required: ["path", "content"],
        properties: {
          path: { type: "string" },
          content: { type: "string" }
        }
      }
    }
  ]
};

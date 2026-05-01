export default {
  id: "file-manager",
  apiVersion: 1,
  displayName: "File Manager",
  author: "Paperclip",
  version: "0.1.0",
  description: "Safe file operations for agents",
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
      description: "List files in a safe workspace directory.",
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
      description: "Read a file from a safe workspace directory.",
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
      description: "Write a file inside a safe workspace directory.",
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
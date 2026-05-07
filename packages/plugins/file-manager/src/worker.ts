import { promises as fs } from "node:fs";
import path from "node:path";
import { definePlugin, runWorker, type PluginContext } from "@paperclipai/plugin-sdk";

const DEFAULT_ROOT = ".agents";
const DEFAULT_LABEL = "Agent documents";

type FileManagerConfig = {
  rootPath: string;
  rootLabel: string;
  readOnly: boolean;
};

type TreeEntry = {
  name: string;
  isDirectory: boolean;
  path: string;
  size: number | null;
  updatedAt: string | null;
};

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function resolveRoot(rootPath: string) {
  return path.resolve(rootPath);
}

function isPathInside(candidatePath: string, rootPath: string): boolean {
  const relative = path.relative(rootPath, candidatePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function safePath(rootPath: string, p: string) {
  const root = resolveRoot(rootPath);
  const full = path.resolve(root, p);
  if (!isPathInside(full, root)) {
    throw new Error("Path escape blocked");
  }
  return full;
}

async function loadConfig(ctx: PluginContext): Promise<FileManagerConfig> {
  const config = await ctx.config.get();
  return {
    rootPath: asString(config.rootPath, DEFAULT_ROOT),
    rootLabel: asString(config.rootLabel, DEFAULT_LABEL),
    readOnly: asBoolean(config.readOnly, true),
  };
}

async function write_file(config: FileManagerConfig, { path: p, content }: any) {
  if (config.readOnly) {
    throw new Error("File Manager is configured as read-only");
  }
  const full = safePath(config.rootPath, p);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, "utf8");
  return { path: p, bytes: Buffer.byteLength(content, "utf8") };
}

async function read_file(config: FileManagerConfig, { path: p }: any) {
  const full = safePath(config.rootPath, p);
  const content = await fs.readFile(full, "utf8");
  return { path: p, content };
}

async function list_dir(config: FileManagerConfig, { path: p = "" }: any) {
  const full = safePath(config.rootPath, p);
  const files = await fs.readdir(full, { withFileTypes: true });
  return {
    rootPath: resolveRoot(config.rootPath),
    path: p,
    files: files.map((entry) => ({
      name: entry.name,
      isDirectory: entry.isDirectory(),
    })),
  };
}

async function get_tree(config: FileManagerConfig, dirPath: string = ""): Promise<TreeEntry[]> {
  const full = safePath(config.rootPath, dirPath);
  try {
    await fs.mkdir(resolveRoot(config.rootPath), { recursive: true });
  } catch {}
  
  try {
    const entries = await fs.readdir(full, { withFileTypes: true });
    const root = resolveRoot(config.rootPath);
    const mapped = await Promise.all(entries.map(async (ent) => {
      const fullPath = path.join(full, ent.name);
      const stat = await fs.stat(fullPath);
      return {
        name: ent.name,
        isDirectory: ent.isDirectory(),
        path: path.posix.join(dirPath.replace(/\\/g, "/"), ent.name).replace(/^\//, ""),
        size: ent.isDirectory() ? null : stat.size,
        updatedAt: stat.mtime.toISOString(),
      };
    }));
    return mapped.filter((entry) => isPathInside(path.resolve(root, entry.path), root)).sort((a, b) => {
      if (a.isDirectory === b.isDirectory) return a.name.localeCompare(b.name);
      return a.isDirectory ? -1 : 1;
    });
  } catch (err: any) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
}

const plugin = definePlugin({
  async setup(ctx) {
    ctx.logger.info("file-manager plugin setup complete");

    ctx.data.register("config", async () => {
      const config = await loadConfig(ctx);
      return {
        rootPath: resolveRoot(config.rootPath),
        rootLabel: config.rootLabel,
        readOnly: config.readOnly,
      };
    });

    ctx.data.register("tree", async (params) => {
      const config = await loadConfig(ctx);
      const p = typeof params.path === "string" ? params.path : "";
      return await get_tree(config, p);
    });

    ctx.data.register("file", async (params) => {
      const config = await loadConfig(ctx);
      const p = typeof params.path === "string" ? params.path : "";
      if (!p) return { content: "", path: "" };
      return await read_file(config, { path: p });
    });

    ctx.tools.register(
      "list_dir",
      {
        displayName: "List Directory",
        description: "List files in the configured agent document root.",
        parametersSchema: {
          type: "object",
          properties: {
            path: { type: "string" }
          }
        }
      },
      async (params) => {
        const config = await loadConfig(ctx);
        const result = await list_dir(config, params);
        return { data: result, content: JSON.stringify(result) };
      }
    );

    ctx.tools.register(
      "read_file",
      {
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
      async (params) => {
        const config = await loadConfig(ctx);
        const result = await read_file(config, params);
        return { data: result, content: result.content };
      }
    );

    ctx.tools.register(
      "write_file",
      {
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
      },
      async (params) => {
        const config = await loadConfig(ctx);
        const result = await write_file(config, params);
        return { data: result, content: JSON.stringify(result) };
      }
    );
  },

  async onHealth() {
    return { status: "ok", message: "file-manager plugin ready" };
  },
});

export default plugin;
runWorker(plugin, import.meta.url);

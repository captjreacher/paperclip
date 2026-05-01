import { promises as fs } from "node:fs";
import path from "node:path";
import { definePlugin, runWorker } from "@paperclipai/plugin-sdk";

const ROOT = path.resolve(".paperclip/artifacts");

function safePath(p: string) {
  const full = path.resolve(ROOT, p);
  if (!full.startsWith(ROOT)) {
    throw new Error("Path escape blocked");
  }
  return full;
}

async function write_file({ path: p, content }: any) {
  const full = safePath(p);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, "utf8");
  return { path: full };
}

async function read_file({ path: p }: any) {
  const full = safePath(p);
  const content = await fs.readFile(full, "utf8");
  return { content };
}

async function list_dir({ path: p = "" }: any) {
  const full = safePath(p);
  const files = await fs.readdir(full);
  return { files };
}

async function get_tree(dirPath: string = "") {
  const full = safePath(dirPath);
  try {
    await fs.mkdir(ROOT, { recursive: true });
  } catch {}
  
  try {
    const entries = await fs.readdir(full, { withFileTypes: true });
    return entries.map(ent => ({
      name: ent.name,
      isDirectory: ent.isDirectory(),
      path: path.posix.join(dirPath.replace(/\\/g, "/"), ent.name).replace(/^\//, ""),
    })).sort((a, b) => {
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

    ctx.data.register("tree", async (params) => {
      const p = typeof params.path === "string" ? params.path : "";
      return await get_tree(p);
    });

    ctx.tools.register(
      "list_dir",
      {
        displayName: "List Directory",
        description: "List files in a safe workspace directory.",
        parametersSchema: {
          type: "object",
          properties: {
            path: { type: "string" }
          }
        }
      },
      async (params) => {
        const result = await list_dir(params);
        return { data: result, content: JSON.stringify(result) };
      }
    );

    ctx.tools.register(
      "read_file",
      {
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
      async (params) => {
        const result = await read_file(params);
        return { data: result, content: result.content };
      }
    );

    ctx.tools.register(
      "write_file",
      {
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
      },
      async (params) => {
        const result = await write_file(params);
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
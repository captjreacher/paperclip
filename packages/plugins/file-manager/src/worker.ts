import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(".paperclip/artifacts");

function safePath(p: string) {
  const full = path.resolve(ROOT, p);
  if (!full.startsWith(ROOT)) {
    throw new Error("Path escape blocked");
  }
  return full;
}

export async function write_file({ path: p, content }: any) {
  const full = safePath(p);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, "utf8");
  return { path: full };
}

export async function read_file({ path: p }: any) {
  const full = safePath(p);
  const content = await fs.readFile(full, "utf8");
  return { content };
}

export async function list_dir({ path: p = "" }: any) {
  const full = safePath(p);
  const files = await fs.readdir(full);
  return { files };
}
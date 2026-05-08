import { useState } from "react";
import { usePluginData, type PluginSidebarProps } from "@paperclipai/plugin-sdk/ui";

type FileEntry = {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number | null;
  updatedAt?: string | null;
};

type FileManagerConfig = {
  rootPath: string;
  rootLabel: string;
  readOnly: boolean;
};

function FileTreeItem({
  item,
  depth = 0,
  selectedPath,
  onSelectFile,
}: {
  item: FileEntry;
  depth?: number;
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const paddingLeft = depth * 12;

  if (item.isDirectory) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="hover:bg-accent/50 transition-colors rounded"
          style={{
            paddingLeft: `${paddingLeft}px`,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "6px",
            paddingBottom: "4px",
            paddingTop: "4px",
            paddingRight: "6px",
            fontSize: "13px",
            fontWeight: 500,
            width: "100%",
            textAlign: "left",
          }}
        >
          <span
            style={{
              fontSize: "10px",
              width: "12px",
              display: "inline-block",
              textAlign: "center",
              color: "var(--foreground)",
              opacity: 0.7,
            }}
          >
            {isOpen ? "v" : ">"}
          </span>
          <span style={{ opacity: 0.9 }}>{item.name}</span>
        </button>
        {isOpen ? (
          <FileTree
            path={item.path}
            depth={depth + 1}
            selectedPath={selectedPath}
            onSelectFile={onSelectFile}
          />
        ) : null}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onSelectFile(item.path)}
      className="hover:bg-accent/50 transition-colors rounded"
      style={{
        paddingLeft: `${paddingLeft + 18}px`,
        paddingBottom: "4px",
        paddingTop: "4px",
        paddingRight: "6px",
        fontSize: "13px",
        color: "var(--foreground)",
        opacity: selectedPath === item.path ? 1 : 0.8,
        background: selectedPath === item.path ? "var(--accent)" : "transparent",
        textAlign: "left",
        width: "100%",
      }}
      title={item.path}
    >
      {item.name}
    </button>
  );
}

function FileTree({
  path = "",
  depth = 0,
  selectedPath,
  onSelectFile,
}: {
  path?: string;
  depth?: number;
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
}) {
  const treeQuery = usePluginData<FileEntry[]>("tree", { path });

  if (!treeQuery.data && treeQuery.loading) {
    return (
      <div style={{ paddingLeft: `${depth * 12 + 18}px`, fontSize: "12px", opacity: 0.5 }}>
        Loading...
      </div>
    );
  }

  if (treeQuery.error) {
    return (
      <div style={{ paddingLeft: `${depth * 12 + 18}px`, fontSize: "12px", color: "var(--destructive, #cc0000)" }}>
        Error loading files
      </div>
    );
  }

  const items = treeQuery.data || [];

  if (items.length === 0) {
    return (
      <div style={{ paddingLeft: `${depth * 12 + 18}px`, fontSize: "12px", opacity: 0.5, fontStyle: "italic" }}>
        Empty folder
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
      {items.map((item) => (
        <FileTreeItem
          key={item.path}
          item={item}
          depth={depth}
          selectedPath={selectedPath}
          onSelectFile={onSelectFile}
        />
      ))}
    </div>
  );
}

export function FileManagerSidebarPanel() {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const configQuery = usePluginData<FileManagerConfig>("config", {});
  const fileQuery = usePluginData<{ path: string; content: string }>(
    "file",
    selectedPath ? { path: selectedPath } : {},
  );
  const config = configQuery.data;

  return (
    <div style={{ padding: "16px", color: "var(--foreground)", display: "flex", flexDirection: "column", gap: "16px" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        <div style={{ fontWeight: 600, fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.05em", opacity: 0.6 }}>
          {config?.rootLabel ?? "Agent documents"}
        </div>
        {config?.rootPath ? (
          <div
            style={{ fontSize: "11px", opacity: 0.55, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            title={config.rootPath}
          >
            {config.rootPath}
          </div>
        ) : null}
      </div>
      <FileTree selectedPath={selectedPath} onSelectFile={setSelectedPath} />
      {selectedPath ? (
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
          <div style={{ fontSize: "12px", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={selectedPath}>
            {selectedPath}
          </div>
          <pre style={{ margin: 0, maxHeight: "320px", overflow: "auto", fontSize: "11px", lineHeight: 1.45, whiteSpace: "pre-wrap" }}>
            {fileQuery.loading ? "Loading..." : fileQuery.error ? "Unable to read file." : fileQuery.data?.content ?? ""}
          </pre>
        </div>
      ) : null}
    </div>
  );
}

export function FileManagerSidebar({ context }: PluginSidebarProps) {
  return (
    <div
      className={[
        "flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium transition-colors",
        "text-foreground/80 hover:bg-accent/50 hover:text-foreground cursor-pointer",
      ].join(" ")}
      title={context.companyId ? "File Manager" : "Select a company to browse files"}
    >
      <span className="relative shrink-0 flex items-center justify-center">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2 5a2 2 0 0 1 2-2h4.5a2 2 0 0 1 1.5.7l2 2.3h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5Z" />
        </svg>
      </span>
      <span className="flex-1 truncate">Files</span>
    </div>
  );
}

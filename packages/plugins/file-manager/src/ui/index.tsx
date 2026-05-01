import { useState } from "react";
import { usePluginData, type PluginSidebarProps } from "@paperclipai/plugin-sdk/ui";

function FileTreeItem({ item, depth = 0 }: { item: { name: string, path: string, isDirectory: boolean }, depth?: number }) {
  const [isOpen, setIsOpen] = useState(false);
  const paddingLeft = depth * 12;

  if (item.isDirectory) {
    return (
      <div>
        <div 
          onClick={() => setIsOpen(!isOpen)}
          className="hover:bg-accent/50 transition-colors rounded"
          style={{ paddingLeft: `${paddingLeft}px`, cursor: "pointer", display: "flex", alignItems: "center", gap: "6px", paddingBottom: "4px", paddingTop: "4px", fontSize: "13px", fontWeight: 500 }}
        >
          <span style={{ fontSize: "10px", width: "12px", display: "inline-block", textAlign: "center", color: "var(--foreground)", opacity: 0.7 }}>
            {isOpen ? "▼" : "▶"}
          </span>
          <span style={{opacity: 0.9}}>📁 {item.name}</span>
        </div>
        {isOpen && <FileTree path={item.path} depth={depth + 1} />}
      </div>
    );
  }

  return (
    <div className="hover:bg-accent/50 transition-colors rounded" style={{ paddingLeft: `${paddingLeft + 18}px`, paddingBottom: "4px", paddingTop: "4px", fontSize: "13px", color: "var(--foreground)", opacity: 0.8 }}>
      📄 {item.name}
    </div>
  );
}

function FileTree({ path = "", depth = 0 }: { path?: string, depth?: number }) {
  const treeQuery = usePluginData<Array<{ name: string, path: string, isDirectory: boolean }>>("tree", { path });

  if (!treeQuery.data && treeQuery.loading) {
    return <div style={{ paddingLeft: `${depth * 12 + 18}px`, fontSize: "12px", opacity: 0.5 }}>Loading...</div>;
  }

  if (treeQuery.error) {
    return <div style={{ paddingLeft: `${depth * 12 + 18}px`, fontSize: "12px", color: "var(--destructive, #cc0000)" }}>Error loading files</div>;
  }

  const items = treeQuery.data || [];

  if (items.length === 0) {
    return <div style={{ paddingLeft: `${depth * 12 + 18}px`, fontSize: "12px", opacity: 0.5, fontStyle: "italic" }}>Empty folder</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
      {items.map(item => (
        <FileTreeItem key={item.path} item={item} depth={depth} />
      ))}
    </div>
  );
}

export function FileManagerSidebarPanel() {
  return (
    <div style={{ padding: "16px", color: "var(--foreground)", display: "flex", flexDirection: "column", gap: "16px" }}>
      <div style={{ fontWeight: 600, fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.05em", opacity: 0.6 }}>
        Artifacts
      </div>
      <FileTree />
    </div>
  );
}

export function FileManagerSidebar({ context }: PluginSidebarProps) {
  // If the user hasn't selected a company, we might not want to render or we can render disabled
  return (
    <div
      className={[
        "flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium transition-colors",
        "text-foreground/80 hover:bg-accent/50 hover:text-foreground cursor-pointer",
      ].join(" ")}
    >
      <span className="relative shrink-0 flex items-center justify-center">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2 5a2 2 0 0 1 2-2h4.5a2 2 0 0 1 1.5.7l2 2.3h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5Z" />
        </svg>
      </span>
      <span className="flex-1 truncate">
        Files
      </span>
    </div>
  );
}

import { fs, path } from "../lib/cep/node";
import { evalFile, csi, posix } from "../lib/utils/bolt";

export type UserScript = {
  filePath: string;
  fileName: string;
  name: string;
  tooltip: string;
  icon: string;
};

const DEFAULT_ICON = `<svg viewBox="0 0 16 16" width="70%" height="70%" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 3 L10 3 L12 5 L12 13 L4 13 Z"/><line x1="6" y1="7" x2="10" y2="7"/><line x1="6" y1="9.5" x2="10" y2="9.5"/></svg>`;

function humanizeName(fileName: string): string {
  return fileName
    .replace(/\.jsx$/, "")
    .replace(/^\d+[-_ ]*/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function parseMetadata(filePath: string): { name: string; tooltip: string; icon: string } {
  const result = { name: "", tooltip: "", icon: "" };
  try {
    const content = fs.readFileSync(filePath, { encoding: "utf-8" });
    const blockMatch = content.match(/\/\*\*([\s\S]*?)\*\//);
    if (!blockMatch) return result;
    const block = blockMatch[1];
    const lines = block.split(/\r?\n/);
    for (const line of lines) {
      const tagMatch = line.match(/@(\w+)\s+(.+)/);
      if (tagMatch) {
        const [, key, value] = tagMatch;
        if (key === "name") result.name = value.trim();
        else if (key === "tooltip") result.tooltip = value.trim();
        else if (key === "icon") result.icon = value.trim();
      }
    }
  } catch {}
  return result;
}

class UserScriptStore {
  scripts: UserScript[] = $state([]);

  getDir(): string {
    const extRoot = csi.getSystemPath("extension");
    return path.join(extRoot, "scripts");
  }

  scan() {
    if (!window.cep) return;
    const dir = this.getDir();
    try {
      const files = fs.readdirSync(dir).filter((f: string) => f.endsWith(".jsx"));
      this.scripts = files.map((fileName: string) => {
        const filePath = path.join(dir, fileName);
        const meta = parseMetadata(filePath);
        const name = meta.name || humanizeName(fileName);
        return {
          filePath,
          fileName,
          name,
          tooltip: meta.tooltip || name,
          icon: meta.icon || DEFAULT_ICON,
        };
      });
    } catch {
      this.scripts = [];
    }
  }

  execute(script: UserScript) {
    if (!window.cep) return;
    evalFile(posix(script.filePath)).catch((e) => {
      console.error("Script execution error:", e);
    });
  }
}

export const userScripts = new UserScriptStore();

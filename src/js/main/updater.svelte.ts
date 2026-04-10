import { version } from "../../shared/shared";
import { openLinkInBrowser, csi } from "../lib/utils/bolt";
import { settings } from "./settings.svelte";

const STATE_KEY = "pendulum-update-state";
const CHECK_INTERVAL = 24 * 60 * 60 * 1000;
const GITHUB_API = "https://api.github.com/repos/alexwiench/pendulum/releases?per_page=5";

type ReleaseInfo = {
  version: string;
  url: string;
  body: string;
  publishedAt: string;
};

type PersistedState = {
  lastCheckTimestamp: number;
  latestRelease: ReleaseInfo | null;
  dismissedVersion: string | null;
};

export type InstallSource = "local" | "exchange" | "aescripts" | "unknown";

function compareSemver(a: string, b: string): number {
  const pa = a.replace(/^v/, "").split("-")[0].split(".").map(Number);
  const pb = b.replace(/^v/, "").split("-")[0].split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na !== nb) return na < nb ? -1 : 1;
  }
  // Pre-release tag (has "-") sorts below its release version
  const aHasPre = a.includes("-");
  const bHasPre = b.includes("-");
  if (aHasPre && !bHasPre) return -1;
  if (!aHasPre && bHasPre) return 1;
  return 0;
}

function detectInstallSource(): InstallSource {
  if (!window.cep) return "unknown";
  try {
    const extPath = csi.getSystemPath("extension").toLowerCase();
    if (extPath.includes("aescripts")) return "aescripts";
    if (
      extPath.includes("com.adobe.cep.extensions") ||
      (extPath.includes("common files") && extPath.includes("adobe") && extPath.includes("cep"))
    ) return "exchange";
    return "local";
  } catch {
    return "unknown";
  }
}

class UpdaterStore {
  updateAvailable: ReleaseInfo | null = $state(null);
  checking = $state(false);
  error: string | null = $state(null);
  installSource: InstallSource = $state("unknown");

  private _persisted: PersistedState = {
    lastCheckTimestamp: 0,
    latestRelease: null,
    dismissedVersion: null,
  };

  get dismissed(): boolean {
    return this.updateAvailable?.version === this._persisted.dismissedVersion;
  }

  get showBanner(): boolean {
    return this.updateAvailable !== null && !this.dismissed;
  }

  constructor() {
    this.installSource = detectInstallSource();
    this._loadState();
    if (this._persisted.latestRelease) {
      const cached = this._persisted.latestRelease;
      if (compareSemver(cached.version, version) > 0) {
        this.updateAvailable = cached;
      }
    }
  }

  async checkForUpdates(force = false): Promise<void> {
    if (this.checking) return;
    if (!settings.updatesEnabled && !force) return;
    if (this.installSource === "exchange" || this.installSource === "aescripts") return;
    if (!force && Date.now() - this._persisted.lastCheckTimestamp < CHECK_INTERVAL) return;

    this.checking = true;
    this.error = null;

    try {
      const res = await fetch(GITHUB_API, {
        headers: { Accept: "application/vnd.github.v3+json" },
      });

      if (!res.ok) {
        this.error = res.status === 403 ? "Rate limited" : `HTTP ${res.status}`;
        return;
      }

      const releases: Array<{
        tag_name: string;
        html_url: string;
        body: string;
        published_at: string;
        prerelease: boolean;
        draft: boolean;
      }> = await res.json();

      const candidates = releases.filter((r) => {
        if (r.draft) return false;
        if (settings.updateChannel === "stable" && r.prerelease) return false;
        return true;
      });

      const newest = candidates.find((r) => compareSemver(r.tag_name, version) > 0);

      this._persisted.lastCheckTimestamp = Date.now();

      if (newest) {
        const info: ReleaseInfo = {
          version: newest.tag_name.replace(/^v/, ""),
          url: newest.html_url,
          body: newest.body ?? "",
          publishedAt: newest.published_at,
        };
        this._persisted.latestRelease = info;
        if (this.updateAvailable?.version !== info.version) {
          this.updateAvailable = info;
        }
      } else {
        this._persisted.latestRelease = null;
        this.updateAvailable = null;
      }

      this._persistState();
    } catch {
      this.error = "Network unavailable";
    } finally {
      this.checking = false;
    }
  }

  dismiss() {
    if (this.updateAvailable) {
      this._persisted.dismissedVersion = this.updateAvailable.version;
      this._persistState();
    }
  }

  openReleasePage() {
    if (this.updateAvailable) {
      openLinkInBrowser(this.updateAvailable.url);
    }
  }

  private _persistState() {
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify(this._persisted));
    } catch {
      // localStorage may be unavailable
    }
  }

  private _loadState() {
    try {
      const raw = localStorage.getItem(STATE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (typeof data.lastCheckTimestamp === "number") this._persisted.lastCheckTimestamp = data.lastCheckTimestamp;
      if (typeof data.dismissedVersion === "string") this._persisted.dismissedVersion = data.dismissedVersion;
      if (data.latestRelease && typeof data.latestRelease === "object") {
        const r = data.latestRelease;
        if (typeof r.version === "string" && typeof r.url === "string") {
          this._persisted.latestRelease = {
            version: r.version,
            url: r.url,
            body: r.body ?? "",
            publishedAt: r.publishedAt ?? "",
          };
        }
      }
    } catch {
      // corrupt — use defaults
    }
  }
}

export const updater = new UpdaterStore();

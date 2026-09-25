import { ipcMain, safeStorage } from "electron";
import { store } from "../store";
import { isFromApp } from "../appOrigin";
import type {
  CreateIssueResult,
  GitHubConnectResult,
  GitHubResult,
  GitHubStatus,
  UploadImageResult,
} from "../shared/types";
import {
  GitHubError,
  createIssue,
  createTokenStore,
  markdownImage,
  parseImageDataUrl,
  uploadImage,
  validateIssueDraft,
  verifyToken,
} from "../github";

// IPC: the GitHub token (Settings → GitHub) and filing issues with it
// (Changelog → Report an issue). The token stays in main; the renderer only
// ever learns whether one is saved and whose it is. Everything that stores it
// or acts with it only answers the app's own page (issue #112).

const token = createTokenStore({
  read: () => store.get("githubToken"),
  write: (value) => store.set("githubToken", value),
  crypto: safeStorage,
});

// The login shown in Settings, looked up once per run rather than per render
let cachedLogin: string | null = null;

const NOT_CONNECTED = "Add a GitHub token in Settings → GitHub first.";
const NOT_ALLOWED = "Not allowed.";

function errorText(err: unknown): string {
  return err instanceof GitHubError ? err.message : "Something went wrong talking to GitHub.";
}

export function registerGitHubIpc() {
  ipcMain.handle("github-get-status", async (event): Promise<GitHubStatus> => {
    // Checking the status sends the token to GitHub, so it answers the app only
    if (!isFromApp(event)) return { connected: false };
    const saved = token.load();
    if (!saved) return { connected: false };
    if (!cachedLogin) {
      try {
        cachedLogin = await verifyToken(saved);
      } catch {
        // Offline or expired: still connected as far as the UI is concerned;
        // using it will say what's wrong.
      }
    }
    return { connected: true, ...(cachedLogin ? { login: cachedLogin } : {}) };
  });

  ipcMain.handle("github-set-token", async (event, raw: unknown): Promise<GitHubConnectResult> => {
    if (!isFromApp(event)) return { ok: false, error: NOT_ALLOWED };
    const value = typeof raw === "string" ? raw.trim() : "";
    if (!value || value.length > 512 || /\s/.test(value)) {
      return { ok: false, error: "Paste a GitHub personal access token." };
    }
    try {
      const login = await verifyToken(value);
      if (!token.save(value)) {
        return {
          ok: false,
          error: "This system can't store the token securely, so it wasn't saved.",
        };
      }
      cachedLogin = login;
      return { ok: true, login };
    } catch (err) {
      return { ok: false, error: errorText(err) };
    }
  });

  ipcMain.handle("github-clear-token", (event): GitHubResult => {
    if (!isFromApp(event)) return { ok: false, error: NOT_ALLOWED };
    token.clear();
    cachedLogin = null;
    return { ok: true };
  });

  ipcMain.handle(
    "github-upload-image",
    async (event, dataUrl: unknown): Promise<UploadImageResult> => {
      if (!isFromApp(event)) return { ok: false, error: NOT_ALLOWED };
      const saved = token.load();
      if (!saved) return { ok: false, error: NOT_CONNECTED };
      const image = parseImageDataUrl(dataUrl);
      if (!image.ok) return { ok: false, error: image.error };
      try {
        const url = await uploadImage(saved, image.bytes, image.ext);
        return { ok: true, markdown: markdownImage("image", url) };
      } catch (err) {
        return { ok: false, error: errorText(err) };
      }
    },
  );

  ipcMain.handle(
    "github-create-issue",
    async (event, draft: unknown): Promise<CreateIssueResult> => {
      if (!isFromApp(event)) return { ok: false, error: NOT_ALLOWED };
      const saved = token.load();
      if (!saved) return { ok: false, error: NOT_CONNECTED };
      const { title, body } = (draft ?? {}) as { title?: unknown; body?: unknown };
      const problem = validateIssueDraft(title, body);
      if (problem) return { ok: false, error: problem };
      try {
        const issue = await createIssue(saved, title as string, body as string);
        return { ok: true, issue };
      } catch (err) {
        return { ok: false, error: errorText(err) };
      }
    },
  );
}

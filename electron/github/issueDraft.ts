// Checks and naming for issues filed from the app, and for the images pasted
// into them. Pure (test/issueDraft.test.ts).

export const REPO_OWNER = "devlargs";
export const REPO_NAME = "largs-hub";
// Every issue filed from the app is assigned here
export const ISSUE_ASSIGNEE = "devlargs";
// GitHub's API can't upload issue attachments (the website's user-attachments
// upload needs a browser session), so pasted images are committed here instead.
export const IMAGE_BRANCH = "issue-images";

// GitHub's own limits
const MAX_TITLE_LENGTH = 256;
const MAX_BODY_LENGTH = 65_536;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const IMAGE_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

/** A sentence saying what's wrong with the draft, or null when it can be filed. */
export function validateIssueDraft(title: unknown, body: unknown): string | null {
  if (typeof title !== "string" || !title.trim()) return "Give the issue a title.";
  if (title.length > MAX_TITLE_LENGTH) return "The title is too long (256 characters at most).";
  if (typeof body !== "string") return "The description is missing.";
  if (body.length > MAX_BODY_LENGTH) return "The description is too long for GitHub.";
  return null;
}

export type ParsedImage = { ok: true; bytes: Buffer; ext: string } | { ok: false; error: string };

/** A pasted image, sent over IPC as a data URL. */
export function parseImageDataUrl(dataUrl: unknown): ParsedImage {
  if (typeof dataUrl !== "string") return { ok: false, error: "That isn't an image." };
  const match = dataUrl.match(/^data:([a-z/+-]+);base64,([A-Za-z0-9+/=]+)$/);
  const ext = match ? IMAGE_TYPES[match[1]] : undefined;
  if (!match || !ext) {
    return { ok: false, error: "Only PNG, JPEG, GIF and WebP images can be attached." };
  }
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length === 0) return { ok: false, error: "That image is empty." };
  if (bytes.length > MAX_IMAGE_BYTES) return { ok: false, error: "Images can be 10 MB at most." };
  return { ok: true, bytes, ext };
}

/** Where an image goes on the image branch: 2026/09/<id>.png */
export function imagePathFor(now: Date, id: string, ext: string): string {
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${now.getUTCFullYear()}/${month}/${id}.${ext}`;
}

export function rawImageUrl(path: string): string {
  return `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${IMAGE_BRANCH}/${path}`;
}

export function markdownImage(alt: string, url: string): string {
  return `![${alt.replace(/[[\]]/g, "")}](${url})`;
}

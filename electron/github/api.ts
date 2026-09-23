import { REPO_NAME, REPO_OWNER } from "./issueDraft";

// A minimal GitHub REST client. Runs in main only: the token never leaves it,
// and the UI view's CSP doesn't allow it to reach api.github.com anyway.

export const REPO_PATH = `/repos/${REPO_OWNER}/${REPO_NAME}`;

export class GitHubError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

// What a failed request means for the user, in a sentence
export function describeStatus(status: number): string {
  if (status === 401) {
    return "GitHub didn't accept the token. It may have expired; add a new one in Settings.";
  }
  if (status === 403 || status === 404) {
    return "The token can't do that on largs-hub. It needs Issues and Contents read and write access to that repository.";
  }
  if (status === 422) return "GitHub rejected the request.";
  return `GitHub answered with an error (${status}).`;
}

export async function githubRequest<T>(
  token: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`https://api.github.com${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "Largs-Hub",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new GitHubError("Couldn't reach GitHub. Check your internet connection.", 0);
  }
  if (!response.ok) throw new GitHubError(describeStatus(response.status), response.status);
  return (await response.json()) as T;
}

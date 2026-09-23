import { randomUUID } from "crypto";
import type { IssueCreated } from "../shared/types";
import { GitHubError, REPO_PATH, githubRequest } from "./api";
import { IMAGE_BRANCH, ISSUE_ASSIGNEE, imagePathFor, rawImageUrl } from "./issueDraft";

// The GitHub calls behind "Report an issue".

/** The token's GitHub login, once it's shown it can see largs-hub. */
export async function verifyToken(token: string): Promise<string> {
  const user = await githubRequest<{ login: string }>(token, "GET", "/user");
  await githubRequest(token, "GET", REPO_PATH);
  return user.login;
}

export async function createIssue(
  token: string,
  title: string,
  body: string,
): Promise<IssueCreated> {
  const issue = await githubRequest<{ number: number; html_url: string }>(
    token,
    "POST",
    `${REPO_PATH}/issues`,
    { title: title.trim(), body, assignees: [ISSUE_ASSIGNEE] },
  );
  return { number: issue.number, url: issue.html_url };
}

// Create the image branch from the default branch's head, the first time.
async function ensureImageBranch(token: string): Promise<void> {
  try {
    await githubRequest(token, "GET", `${REPO_PATH}/git/ref/heads/${IMAGE_BRANCH}`);
    return;
  } catch (err) {
    if (!(err instanceof GitHubError) || err.status !== 404) throw err;
  }
  const repo = await githubRequest<{ default_branch: string }>(token, "GET", REPO_PATH);
  const head = await githubRequest<{ object: { sha: string } }>(
    token,
    "GET",
    `${REPO_PATH}/git/ref/heads/${repo.default_branch}`,
  );
  await githubRequest(token, "POST", `${REPO_PATH}/git/refs`, {
    ref: `refs/heads/${IMAGE_BRANCH}`,
    sha: head.object.sha,
  });
}

/** Commit an image to the image branch; resolves to its raw URL. */
export async function uploadImage(token: string, bytes: Buffer, ext: string): Promise<string> {
  await ensureImageBranch(token);
  const path = imagePathFor(new Date(), randomUUID(), ext);
  await githubRequest(token, "PUT", `${REPO_PATH}/contents/${path}`, {
    message: "chore: image for an issue filed from the app",
    content: bytes.toString("base64"),
    branch: IMAGE_BRANCH,
  });
  return rawImageUrl(path);
}

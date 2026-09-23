// Filing GitHub issues from the app (Changelog → Report an issue).
//
//   token.ts       the personal access token, encrypted by the OS
//   issueDraft.ts  draft checks, image parsing and naming (pure)
//   api.ts         the minimal REST client and its error wording
//   issues.ts      verify the token, create an issue, upload an image

export { createTokenStore } from "./token";
export type { TokenStore, TokenCrypto } from "./token";
export { validateIssueDraft, parseImageDataUrl, markdownImage } from "./issueDraft";
export { GitHubError } from "./api";
export { verifyToken, createIssue, uploadImage } from "./issues";

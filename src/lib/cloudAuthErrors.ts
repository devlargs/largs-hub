// The account form's checks and messages. Pure (test/cloudAuthErrors.test.ts);
// cloudAuth.ts does the Firebase calls.

export type AuthResult = { ok: true } | { ok: false; error: string };

export const MIN_ACCOUNT_PASSWORD = 8;
export const RESET_SENT_MESSAGE =
  "If an account exists for that email, a reset link is on its way.";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(email: string): string | null {
  return EMAIL_RE.test(email.trim()) ? null : "That email doesn't look right.";
}

export function validateSignIn(email: string, password: string): string | null {
  return validateEmail(email) ?? (password.length === 0 ? "Enter your password." : null);
}

// Stricter than Firebase's own six characters.
export function validateSignUp(email: string, password: string, confirm: string): string | null {
  const invalidEmail = validateEmail(email);
  if (invalidEmail) return invalidEmail;
  if (password.length < MIN_ACCOUNT_PASSWORD) return "Use at least 8 characters.";
  if (password !== confirm) return "The passwords don't match.";
  return null;
}

const MESSAGES: Record<string, string> = {
  "auth/invalid-credential": "Wrong email or password.",
  "auth/wrong-password": "Wrong email or password.",
  "auth/user-not-found": "Wrong email or password.",
  "auth/invalid-login-credentials": "Wrong email or password.",
  "auth/email-already-in-use": "An account with this email already exists.",
  "auth/weak-password": "Use at least 8 characters.",
  "auth/invalid-email": "That email doesn't look right.",
  "auth/missing-email": "That email doesn't look right.",
  "auth/too-many-requests": "Too many attempts. Try again in a few minutes.",
  "auth/network-request-failed": "Can't reach the server. Check your connection.",
};

export const GENERIC_AUTH_ERROR = "Something went wrong. Try again.";

/** The Firebase error code of `error`, if it has one. */
export function authErrorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

/** A sentence for the form. Never includes anything the user typed. */
export function authErrorMessage(error: unknown): string {
  const code = authErrorCode(error);
  return (code && MESSAGES[code]) || GENERIC_AUTH_ERROR;
}

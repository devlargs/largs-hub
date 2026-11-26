import { describe, expect, it } from "vitest";
import {
  authErrorMessage,
  GENERIC_AUTH_ERROR,
  validateEmail,
  validateSignIn,
  validateSignUp,
} from "../src/lib/cloudAuthErrors";
import { readFirebaseConfig } from "../src/lib/firebaseConfig";

describe("validateSignUp", () => {
  it("checks the email first", () => {
    expect(validateSignUp("not-an-email", "longenough", "longenough")).toBe(
      "That email doesn't look right.",
    );
  });

  it("needs at least 8 characters", () => {
    expect(validateSignUp("a@b.co", "1234567", "1234567")).toBe("Use at least 8 characters.");
  });

  it("needs the passwords to match", () => {
    expect(validateSignUp("a@b.co", "12345678", "12345679")).toBe("The passwords don't match.");
  });

  it("passes a good form", () => {
    expect(validateSignUp(" a@b.co ", "12345678", "12345678")).toBeNull();
  });
});

describe("validateSignIn and validateEmail", () => {
  it("needs an email and a password", () => {
    expect(validateEmail("me@example.com")).toBeNull();
    expect(validateSignIn("me@example", "x")).toBe("That email doesn't look right.");
    expect(validateSignIn("me@example.com", "")).toBe("Enter your password.");
    expect(validateSignIn("me@example.com", "x")).toBeNull();
  });
});

describe("authErrorMessage", () => {
  it("maps Firebase codes to friendly sentences", () => {
    const msg = (code: string) => authErrorMessage({ code });
    expect(msg("auth/invalid-credential")).toBe("Wrong email or password.");
    expect(msg("auth/wrong-password")).toBe("Wrong email or password.");
    expect(msg("auth/user-not-found")).toBe("Wrong email or password.");
    expect(msg("auth/email-already-in-use")).toBe("An account with this email already exists.");
    expect(msg("auth/weak-password")).toBe("Use at least 8 characters.");
    expect(msg("auth/invalid-email")).toBe("That email doesn't look right.");
    expect(msg("auth/too-many-requests")).toBe("Too many attempts. Try again in a few minutes.");
    expect(msg("auth/network-request-failed")).toBe(
      "Can't reach the server. Check your connection.",
    );
  });

  it("falls back for anything else", () => {
    expect(authErrorMessage({ code: "auth/something-new" })).toBe(GENERIC_AUTH_ERROR);
    expect(authErrorMessage(new Error("boom"))).toBe(GENERIC_AUTH_ERROR);
    expect(authErrorMessage(null)).toBe(GENERIC_AUTH_ERROR);
  });
});

describe("readFirebaseConfig", () => {
  const env = {
    VITE_FIREBASE_API_KEY: "key",
    VITE_FIREBASE_AUTH_DOMAIN: "x.firebaseapp.com",
    VITE_FIREBASE_PROJECT_ID: "x",
    VITE_FIREBASE_STORAGE_BUCKET: "x.appspot.com",
    VITE_FIREBASE_MESSAGING_SENDER_ID: "1",
    VITE_FIREBASE_APP_ID: "1:2:web:3",
  };

  it("reads a complete config", () => {
    expect(readFirebaseConfig(env)).toMatchObject({ apiKey: "key", projectId: "x" });
  });

  it("turns sync off when any value is missing or blank", () => {
    expect(readFirebaseConfig({})).toBeNull();
    expect(readFirebaseConfig({ ...env, VITE_FIREBASE_APP_ID: "" })).toBeNull();
    expect(readFirebaseConfig({ ...env, VITE_FIREBASE_API_KEY: "  " })).toBeNull();
  });
});

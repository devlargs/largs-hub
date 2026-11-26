import { readFirebaseConfig } from "./firebaseConfig";

// The Firebase web config, read from Vite's env at build time (.env, or the
// release workflow's secrets). Kept apart from firebase.ts, which loads the
// SDK, so the UI can ask whether sync exists in this build without pulling
// Firebase in.

export const firebaseConfig = readFirebaseConfig(import.meta.env ?? {});

// False in builds made without a .env (contributors, CI): the Account section
// says so and nothing else of the feature runs.
export const firebaseEnabled = firebaseConfig !== null;

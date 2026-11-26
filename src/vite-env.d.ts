/// <reference types="vite/client" />

// Firebase web config for accounts and cloud sync, inlined by Vite at build
// time from .env (see .env.example) or the release workflow's secrets. Any of
// them missing turns the feature off (src/lib/firebaseConfig.ts).
interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET?: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

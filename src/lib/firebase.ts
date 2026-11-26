import { initializeApp, type FirebaseApp } from "firebase/app";
import {
  browserLocalPersistence,
  indexedDBLocalPersistence,
  initializeAuth,
  type Auth,
} from "firebase/auth";
import { initializeFirestore, type Firestore } from "firebase/firestore";
import { firebaseConfig } from "./firebaseEnv";

// Firebase, initialised once. Imported lazily (cloudSync.ts, cloudAuth.ts) and
// only when firebaseEnabled, so a build without the config never loads it.
// No Analytics: it doesn't work in Electron.
//
// The sign-in persists in the UI view's IndexedDB (the default session, which
// is on disk), so it survives restarts. Dev (http://localhost:5173) and an
// installed build (file://) are different origins and don't share it.

export interface FirebaseHandles {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
}

let handles: FirebaseHandles | null = null;

export function getFirebase(): FirebaseHandles {
  if (handles) return handles;
  if (!firebaseConfig) throw new Error("Cloud sync isn't set up in this build.");
  const app = initializeApp(firebaseConfig);
  const auth = initializeAuth(app, {
    persistence: [indexedDBLocalPersistence, browserLocalPersistence],
  });
  // ignoreUndefinedProperties: an optional field left undefined is dropped
  // rather than failing the whole write.
  const db = initializeFirestore(app, { ignoreUndefinedProperties: true });
  handles = { app, auth, db };
  return handles;
}

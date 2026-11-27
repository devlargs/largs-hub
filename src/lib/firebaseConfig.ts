// The Firebase web config's shape and check. Pure (test/cloudAuthErrors.test.ts);
// firebaseEnv.ts applies it to Vite's env.

export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

/** The config, or null when any value is missing or blank. */
export function readFirebaseConfig(
  env: Record<string, string | undefined>,
): FirebaseWebConfig | null {
  const config = {
    apiKey: env.VITE_FIREBASE_API_KEY?.trim() ?? "",
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN?.trim() ?? "",
    projectId: env.VITE_FIREBASE_PROJECT_ID?.trim() ?? "",
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET?.trim() ?? "",
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID?.trim() ?? "",
    appId: env.VITE_FIREBASE_APP_ID?.trim() ?? "",
  };
  return Object.values(config).every((value) => value.length > 0) ? config : null;
}

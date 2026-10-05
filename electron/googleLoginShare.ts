import { Session, session } from "electron";
import { store } from "./store";
import { servicePartition } from "./partitions";
import {
  hasGoogleSignIn,
  isGoogleLoginCookie,
  isGoogleSignInCookie,
  pickGoogleLoginSource,
  toCookieToSet,
} from "./googleLogin";

// Starts a new service signed in to Google, with the login of the service the
// user last signed in to Google from (googleLogin.ts has the rules). Only new
// services get it; existing ones keep whatever account they have, so different
// services can still use different Google accounts.

const tracked = new WeakSet<Session>();

/**
 * Remembers this service as the latest Google sign-in whenever its partition
 * gains a new Google account cookie. Once per session: views are recreated
 * after hibernation, the session isn't.
 */
export function trackGoogleSignIns(ses: Session, serviceId: string): void {
  if (tracked.has(ses)) return;
  tracked.add(ses);
  ses.cookies.on("changed", (_event, cookie, cause, removed) => {
    if (removed || cause !== "inserted" || !isGoogleSignInCookie(cookie)) return;
    store.set("lastGoogleSignInServiceId", serviceId);
  });
}

/**
 * Copies the latest Google login into `newServiceId`'s partition. Call before
 * the service's view first loads. Best-effort: a failure leaves the new
 * service signed out, as it always used to be.
 */
export async function seedGoogleLogin(newServiceId: string): Promise<void> {
  try {
    const others = store.get("services").filter((s) => s.id !== newServiceId);
    const signedIn = await Promise.all(
      others.map(async (s) => ({
        id: s.id,
        signedIn: hasGoogleSignIn(
          await session.fromPartition(servicePartition(s.id)).cookies.get({ name: "SID" }),
        ),
      })),
    );
    const sourceId = pickGoogleLoginSource(signedIn, store.get("lastGoogleSignInServiceId"));
    if (!sourceId) return;

    const source = session.fromPartition(servicePartition(sourceId));
    const target = session.fromPartition(servicePartition(newServiceId));
    const cookies = (await source.cookies.get({})).filter(isGoogleLoginCookie);
    const results = await Promise.allSettled(
      cookies.map((c) => target.cookies.set(toCookieToSet(c))),
    );
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed) console.warn(`[googleLogin] ${failed} of ${cookies.length} cookies not copied`);
    await target.cookies.flushStore();
  } catch (err) {
    console.warn("[googleLogin] could not copy the Google login:", err);
  }
}

import type { Passcode, PasscodeDraft, Service } from "../types";

// Pure helpers for Settings → Passcodes (test/passcodesLib.test.ts).

export const ALL_SERVICES_LABEL = "All services";

/** Which service a passcode is offered in, as the list shows it. */
export function passcodeServiceName(passcode: Passcode, services: readonly Service[]): string {
  if (passcode.serviceId === null) return ALL_SERVICES_LABEL;
  return services.find((s) => s.id === passcode.serviceId)?.name ?? ALL_SERVICES_LABEL;
}

/** By name, ignoring case, so the list doesn't reshuffle on every edit. */
export function sortPasscodes(passcodes: readonly Passcode[]): Passcode[] {
  return [...passcodes].sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { sensitivity: "base" }),
  );
}

/**
 * What the dialog sends. Editing with the passcode field left blank keeps the
 * saved one, so the secret is only included when something was typed.
 */
export function buildPasscodeDraft(form: {
  id?: string;
  label: string;
  username: string;
  serviceId: string;
  secret: string;
}): PasscodeDraft {
  return {
    ...(form.id ? { id: form.id } : {}),
    label: form.label.trim(),
    username: form.username.trim(),
    serviceId: form.serviceId || null,
    ...(form.secret ? { secret: form.secret } : {}),
  };
}

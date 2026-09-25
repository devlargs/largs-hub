export function electronSupport(
  installed: string,
  latest: string,
): { status: "ok" | "last" | "unsupported"; installedMajor: number; oldestSupported: number };

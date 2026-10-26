import "server-only";

import Bowser from "bowser";

export type ClientSignature = {
  device: string | null;
  browser: string | null;
  os: string | null;
};

export const EMPTY_SIGNATURE: ClientSignature = {
  device: null,
  browser: null,
  os: null,
};

/**
 * Coarse, non-identifying description of the reader's client. Deliberately
 * ships no raw UA string and no IP to the database.
 */
export function parseUserAgent(userAgent: string | null): ClientSignature {
  if (!userAgent || userAgent.length < 8) return EMPTY_SIGNATURE;

  try {
    const parser = Bowser.getParser(userAgent);
    const platform = parser.getPlatformType(true);

    return {
      device:
        platform === "mobile" ||
        platform === "tablet" ||
        platform === "desktop" ||
        platform === "tv"
          ? platform
          : "other",
      browser: label(parser.getBrowserName(), parser.getBrowserVersion()),
      os: label(parser.getOSName(), parser.getOSVersion()),
    };
  } catch {
    return EMPTY_SIGNATURE;
  }
}

function label(rawName: string | undefined, rawVersion: string | undefined): string | null {
  const name = rawName?.trim();
  if (!name || name.toLowerCase() === "unknown") return null;

  const major = rawVersion?.trim().split(".")[0].replace(/\D/g, "");
  return (major ? `${name} ${major}` : name).slice(0, 60);
}

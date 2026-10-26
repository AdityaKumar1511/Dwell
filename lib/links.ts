/** 12 bytes of base64url = 16 characters, ~96 bits of entropy. */
export const SLUG_ENTROPY_BYTES = 12;

/** Accepts anything we could plausibly have generated; rejects noise early. */
export const SLUG_PATTERN = /^[A-Za-z0-9_-]{12,64}$/;

/** How long a viewer's PDF URL stays valid. */
export const SIGNED_URL_TTL_SECONDS = 60 * 60;

/**
 * Session IDs: the entire access control for a guest's photos.
 *
 * The QR on the kiosk links to /s/{id} on the gallery and there is no
 * login behind it, so the whole burden is on the ID being unguessable:
 * 100 bits from `crypto.getRandomValues`. The alphabet is 32 characters
 * with every confusable pair removed (no i/l/1, no o/0), because when the
 * QR will not scan the attendant reads the ID aloud.
 *
 * Carried over from the wedding ledger's invite tokens unchanged, so a
 * session ID and an invite token are the same shape.
 */

/** 32 characters: a-z less i, l, o; digits less 1. A power of two keeps the mapping uniform. */
const ALPHABET = "abcdefghjkmnpqrstuvwxyz023456789";

/** 20 characters x 5 bits = 100 bits. */
export const SHORT_ID_LENGTH = 20;

const SHORT_ID_PATTERN = new RegExp(`^[${ALPHABET}]{${SHORT_ID_LENGTH}}$`);

export function newShortId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(SHORT_ID_LENGTH));
  let id = "";
  // 256 is a multiple of 32, so masking to 5 bits stays uniform.
  for (const byte of bytes) id += ALPHABET[byte & 31];
  return id;
}

/** Whether a string could be an ID at all, so a bad URL costs no database trip. */
export function isShortIdShape(value: string): boolean {
  return SHORT_ID_PATTERN.test(value);
}

/** Groups of four, for reading aloud: "abcd efgh jkmn pqrs tuvw". */
export function spellShortId(id: string): string {
  return id.match(/.{1,4}/g)?.join(" ") ?? id;
}

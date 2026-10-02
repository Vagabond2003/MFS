/**
 * Credential hashing for the mock server, using WebCrypto PBKDF2-SHA256 with
 * a per-secret random salt. A production backend should use Argon2id or
 * bcrypt server-side; the important property demonstrated here is that
 * passwords and PINs are never stored or compared in plaintext.
 */

const ITERATIONS = 60_000;
const enc = new TextEncoder();

function toB64(bytes: Uint8Array) {
  let s = "";
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s);
}

function fromB64(b64: string) {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

async function pbkdf2(secret: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export async function hashSecret(secret: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(secret, salt, ITERATIONS);
  return `pbkdf2_sha256$${ITERATIONS}$${toB64(salt)}$${toB64(hash)}`;
}

export async function verifySecret(secret: string, stored: string) {
  const [algo, iter, saltB64, hashB64] = stored.split("$");
  if (algo !== "pbkdf2_sha256" || !iter || !saltB64 || !hashB64) return false;
  const expected = fromB64(hashB64);
  const actual = await pbkdf2(secret, fromB64(saltB64), Number(iter));
  return constantTimeEqual(expected, actual);
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function sha256Hex(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const TRX_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

function randomString(alphabet: string, length: number) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = "";
  for (let i = 0; i < length; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

export function randomId(prefix: string) {
  return `${prefix}_${randomString(ID_ALPHABET, 14)}`;
}

/** Public transaction reference, e.g. "K7Q2M9XA4D" */
export function newTrxId(taken: Set<string>) {
  let id = "";
  do id = randomString(TRX_ALPHABET, 10);
  while (taken.has(id));
  taken.add(id);
  return id;
}

export function randomDigits(length: number) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = "";
  for (let i = 0; i < length; i++) out += String(bytes[i] % 10);
  return out;
}

export function shortCode(prefix: string, length = 6) {
  return `${prefix}-${randomString(TRX_ALPHABET, length)}`;
}

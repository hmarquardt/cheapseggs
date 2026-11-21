/**
 * Private assessment envelopes.
 *
 * Reviewed platform primitives only: AES-256-GCM from WebCrypto, a fresh 96-bit nonce per
 * envelope, and authenticated additional data that binds the ciphertext to one assessment,
 * participant, revision and purpose. There is no plaintext fallback and no custom cipher.
 *
 * The production key is a separately provisioned 32-byte secret. `SPIN_DIGEST_KEY` and
 * `BETTER_AUTH_SECRET` are never used here. Rotation: make the new key current, keep the
 * previous key(s) in `CHEMISTRY_ENVELOPE_PREVIOUS_KEYS` until every readable envelope has
 * expired or been re-sealed, then remove them. Key version is stored per envelope.
 */
import type { Bindings } from "../server/bindings";

export interface ChemistryKeyring {
  currentVersion: number;
  keys: ReadonlyMap<number, CryptoKey>;
}

export interface SealedEnvelope {
  envelope: string;
  keyVersion: number;
}

const ALGORITHM = "AES-GCM";
const ENVELOPE_VERSION = 1;
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BITS = 128;
const PAD_BUCKET = 512;
const MAX_PLAINTEXT_BYTES = 64 * 1024;
const MAX_ENVELOPE_CHARS = 140 * 1024;

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1)
    binary += String.fromCharCode(bytes[index] as number);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]{16,}$/.test(value)) return null;
  const padded =
    value.replaceAll("-", "+").replaceAll("_", "/") + "===".slice((value.length + 3) % 4);
  try {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  } catch {
    return null;
  }
}

function parseVersion(value: string | undefined): number | null {
  if (!value || !/^[1-9][0-9]{0,5}$/.test(value)) return null;
  const version = Number(value);
  return Number.isSafeInteger(version) ? version : null;
}

async function importKey(raw: Uint8Array<ArrayBuffer>): Promise<CryptoKey | null> {
  try {
    return await crypto.subtle.importKey("raw", raw, { name: ALGORITHM }, false, [
      "encrypt",
      "decrypt",
    ]);
  } catch {
    return null;
  }
}

/** Fail closed: null means the private service must behave as unavailable. */
export async function loadChemistryKeyring(env: Bindings): Promise<ChemistryKeyring | null> {
  const currentVersion = parseVersion(env.CHEMISTRY_ENVELOPE_KEY_VERSION ?? "1");
  const currentRaw = env.CHEMISTRY_ENVELOPE_KEY
    ? decodeBase64Url(env.CHEMISTRY_ENVELOPE_KEY)
    : null;
  if (currentVersion === null || !currentRaw || currentRaw.byteLength !== KEY_BYTES) return null;
  const keys = new Map<number, CryptoKey>();
  const currentKey = await importKey(currentRaw);
  if (!currentKey) return null;
  keys.set(currentVersion, currentKey);

  if (env.CHEMISTRY_ENVELOPE_PREVIOUS_KEYS) {
    let previous: unknown;
    try {
      previous = JSON.parse(env.CHEMISTRY_ENVELOPE_PREVIOUS_KEYS);
    } catch {
      return null;
    }
    if (!previous || typeof previous !== "object" || Array.isArray(previous)) return null;
    for (const [rawVersion, rawKey] of Object.entries(previous)) {
      const version = parseVersion(rawVersion);
      if (version === null || version === currentVersion || keys.size >= 8) return null;
      if (typeof rawKey !== "string") return null;
      const bytes = decodeBase64Url(rawKey);
      if (!bytes || bytes.byteLength !== KEY_BYTES) return null;
      const key = await importKey(bytes);
      if (!key) return null;
      keys.set(version, key);
    }
  }
  return { currentVersion, keys };
}

/** Domain-separated additional data; every part is server-derived, never client-supplied. */
export function envelopeAad(parts: readonly string[]): string {
  return ["chemistry-envelope-v1", ...parts].join("\u001f");
}

function padded(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const length = Math.ceil((bytes.byteLength + 1) / PAD_BUCKET) * PAD_BUCKET;
  const output = new Uint8Array(length);
  output.set(bytes);
  return output;
}

function unpadded(bytes: Uint8Array): Uint8Array | null {
  let end = bytes.byteLength;
  while (end > 0 && bytes[end - 1] === 0) end -= 1;
  // The sentinel guarantees at least one zero byte; reject envelopes without padding.
  if (end === bytes.byteLength) return null;
  return bytes.subarray(0, end);
}

export async function sealEnvelope(
  plaintext: string,
  aad: string,
  keyring: ChemistryKeyring,
): Promise<SealedEnvelope> {
  const key = keyring.keys.get(keyring.currentVersion);
  if (!key) throw new Error("envelope_unavailable");
  const encoded = new TextEncoder().encode(plaintext);
  if (encoded.byteLength === 0 || encoded.byteLength > MAX_PLAINTEXT_BYTES)
    throw new Error("envelope_too_large");
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: ALGORITHM,
      iv,
      additionalData: new TextEncoder().encode(aad),
      tagLength: TAG_BITS,
    },
    key,
    padded(encoded),
  );
  const envelope = JSON.stringify({
    v: ENVELOPE_VERSION,
    alg: ALGORITHM,
    kv: keyring.currentVersion,
    iv: encodeBase64Url(iv),
    ct: encodeBase64Url(new Uint8Array(ciphertext)),
  });
  if (envelope.length > MAX_ENVELOPE_CHARS) throw new Error("envelope_too_large");
  return { envelope, keyVersion: keyring.currentVersion };
}

/** Throws a generic error for malformed, tampered, unknown-version or missing-key envelopes. */
export async function openEnvelope(
  envelope: string,
  aad: string,
  keyring: ChemistryKeyring,
): Promise<string> {
  if (envelope.length === 0 || envelope.length > MAX_ENVELOPE_CHARS)
    throw new Error("envelope_invalid");
  let parsed: unknown;
  try {
    parsed = JSON.parse(envelope);
  } catch {
    throw new Error("envelope_invalid");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error("envelope_invalid");
  const record = parsed as Record<string, unknown>;
  if (record.v !== ENVELOPE_VERSION || record.alg !== ALGORITHM)
    throw new Error("envelope_invalid");
  const version = typeof record.kv === "number" ? record.kv : null;
  if (version === null || !Number.isSafeInteger(version) || version < 1)
    throw new Error("envelope_invalid");
  const key = keyring.keys.get(version);
  if (!key) throw new Error("envelope_key_unavailable");
  const iv = typeof record.iv === "string" ? decodeBase64Url(record.iv) : null;
  const ciphertext = typeof record.ct === "string" ? decodeBase64Url(record.ct) : null;
  if (!iv || iv.byteLength !== IV_BYTES || !ciphertext || ciphertext.byteLength < TAG_BITS / 8)
    throw new Error("envelope_invalid");
  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt(
      { name: ALGORITHM, iv, additionalData: new TextEncoder().encode(aad), tagLength: TAG_BITS },
      key,
      ciphertext,
    );
  } catch {
    throw new Error("envelope_rejected");
  }
  const trimmed = unpadded(new Uint8Array(plaintext));
  if (!trimmed) throw new Error("envelope_invalid");
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(trimmed);
  } catch {
    throw new Error("envelope_invalid");
  }
}

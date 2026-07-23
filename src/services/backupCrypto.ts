/**
 * Passphrase encryption for backups (F3 — "own-cloud" encrypted backup).
 *
 * The existing export already reaches the user's Drive/cloud through the
 * system SAF picker; this adds an optional passphrase so the file is
 * unreadable at rest wherever it lands. Pure JS (@noble/*, audited):
 * scrypt (N=2^14, r=8, p=1) → XChaCha20-Poly1305. Never our servers,
 * never our keys — decision D1.
 *
 * Envelope (JSON):
 *   { app: "pill-o-clock-encrypted", v: 1, kdf: "scrypt",
 *     n, r, p, salt, nonce, ct }           // salt/nonce/ct base64
 */
import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { utf8ToBytes, bytesToUtf8 } from "@noble/ciphers/utils.js";
import { scrypt } from "@noble/hashes/scrypt.js";
import * as Crypto from "expo-crypto";

export const ENCRYPTED_BACKUP_MARKER = "pill-o-clock-encrypted";

const SCRYPT_PARAMS = { N: 2 ** 14, r: 8, p: 1, dkLen: 32 };

export class WrongPassphraseError extends Error {
  constructor() {
    super("wrong_passphrase");
  }
}

export interface EncryptedEnvelope {
  app: typeof ENCRYPTED_BACKUP_MARKER;
  v: 1;
  kdf: "scrypt";
  n: number;
  r: number;
  p: number;
  salt: string;
  nonce: string;
  ct: string;
}

// Hermes has no btoa/atob and TextDecoder is not guaranteed — hand-rolled
// base64 + @noble utf8 helpers keep this dependency-free and device-safe.
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function toB64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += B64[a >> 2] + B64[((a & 3) << 4) | (b >> 4)];
    out += i + 1 < bytes.length ? B64[((b & 15) << 2) | (c >> 6)] : "=";
    out += i + 2 < bytes.length ? B64[c & 63] : "=";
  }
  return out;
}

function fromB64(b64: string): Uint8Array {
  const clean = b64.replace(/=+$/, "");
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let acc = 0;
  let bits = 0;
  let j = 0;
  for (const ch of clean) {
    const v = B64.indexOf(ch);
    if (v === -1) throw new Error("invalid base64");
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[j++] = (acc >> bits) & 0xff;
    }
  }
  return out;
}

const utf8 = {
  encode: (s: string) => utf8ToBytes(s),
  decode: (b: Uint8Array) => bytesToUtf8(b),
};

/** Encrypts a backup JSON string under a passphrase. */
export function encryptBackup(json: string, passphrase: string): string {
  const salt = Crypto.getRandomBytes(16);
  const nonce = Crypto.getRandomBytes(24);
  const key = scrypt(utf8.encode(passphrase), salt, SCRYPT_PARAMS);
  const ct = xchacha20poly1305(key, nonce).encrypt(utf8.encode(json));
  const envelope: EncryptedEnvelope = {
    app: ENCRYPTED_BACKUP_MARKER,
    v: 1,
    kdf: "scrypt",
    n: SCRYPT_PARAMS.N,
    r: SCRYPT_PARAMS.r,
    p: SCRYPT_PARAMS.p,
    salt: toB64(salt),
    nonce: toB64(nonce),
    ct: toB64(ct),
  };
  return JSON.stringify(envelope);
}

/** Detects our envelope shape without attempting decryption. */
export function isEncryptedEnvelope(raw: unknown): raw is EncryptedEnvelope {
  return (
    typeof raw === "object" &&
    raw !== null &&
    (raw as EncryptedEnvelope).app === ENCRYPTED_BACKUP_MARKER &&
    typeof (raw as EncryptedEnvelope).ct === "string"
  );
}

/**
 * Decrypts an envelope back to the backup JSON string. Wrong passphrase or
 * tampering (Poly1305 auth failure) → WrongPassphraseError.
 */
export function decryptBackup(envelope: EncryptedEnvelope, passphrase: string): string {
  const key = scrypt(utf8.encode(passphrase), fromB64(envelope.salt), {
    N: envelope.n,
    r: envelope.r,
    p: envelope.p,
    dkLen: 32,
  });
  try {
    const pt = xchacha20poly1305(key, fromB64(envelope.nonce)).decrypt(fromB64(envelope.ct));
    return utf8.decode(pt);
  } catch {
    throw new WrongPassphraseError();
  }
}

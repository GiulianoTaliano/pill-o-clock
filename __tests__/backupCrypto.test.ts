/**
 * Passphrase encryption for backups (F3): round-trip, wrong passphrase,
 * tamper detection, envelope detection.
 */
import {
  encryptBackup,
  decryptBackup,
  isEncryptedEnvelope,
  WrongPassphraseError,
  ENCRYPTED_BACKUP_MARKER,
  type EncryptedEnvelope,
} from "../src/services/backupCrypto";

const SAMPLE = JSON.stringify({ app: "pill-o-clock", version: 3, data: { medications: [] } });

describe("encryptBackup / decryptBackup", () => {
  it("round-trips under the right passphrase", () => {
    const envelope = JSON.parse(encryptBackup(SAMPLE, "correct horse")) as EncryptedEnvelope;
    expect(envelope.app).toBe(ENCRYPTED_BACKUP_MARKER);
    expect(envelope.kdf).toBe("scrypt");
    expect(decryptBackup(envelope, "correct horse")).toBe(SAMPLE);
  });

  it("ciphertext does not contain the plaintext", () => {
    const envelope = JSON.parse(encryptBackup(SAMPLE, "s3cret!")) as EncryptedEnvelope;
    expect(envelope.ct).not.toContain("pill-o-clock");
    expect(JSON.stringify(envelope)).not.toContain("medications");
  });

  it("rejects a wrong passphrase", () => {
    const envelope = JSON.parse(encryptBackup(SAMPLE, "right")) as EncryptedEnvelope;
    expect(() => decryptBackup(envelope, "wrong")).toThrow(WrongPassphraseError);
  });

  it("rejects a tampered ciphertext (Poly1305 auth)", () => {
    const envelope = JSON.parse(encryptBackup(SAMPLE, "pass-123")) as EncryptedEnvelope;
    const bytes = Uint8Array.from(atob(envelope.ct), (c) => c.charCodeAt(0));
    bytes[0] ^= 0xff;
    envelope.ct = btoa(String.fromCharCode(...bytes));
    expect(() => decryptBackup(envelope, "pass-123")).toThrow(WrongPassphraseError);
  });
});

describe("isEncryptedEnvelope", () => {
  it("detects envelopes and rejects plain backups", () => {
    const envelope = JSON.parse(encryptBackup(SAMPLE, "x-pass-1"));
    expect(isEncryptedEnvelope(envelope)).toBe(true);
    expect(isEncryptedEnvelope(JSON.parse(SAMPLE))).toBe(false);
    expect(isEncryptedEnvelope(null)).toBe(false);
    expect(isEncryptedEnvelope("string")).toBe(false);
  });
});

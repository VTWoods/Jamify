import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  decryptSecret,
  encryptSecret,
  signSessionToken,
  verifySessionToken,
} from "./crypto";

describe("crypto utilities", () => {
  const prevSecret = process.env.SESSION_SECRET;

  beforeAll(() => {
    process.env.SESSION_SECRET = "a-very-strong-test-session-secret-0123456789";
  });

  afterAll(() => {
    if (prevSecret === undefined) {
      delete process.env.SESSION_SECRET;
    } else {
      process.env.SESSION_SECRET = prevSecret;
    }
  });

  it("encrypts and decrypts secrets roundtrip", () => {
    const token = "spotify-refresh-token-example";
    const encrypted = encryptSecret(token);
    expect(encrypted).not.toContain(token);
    expect(decryptSecret(encrypted)).toBe(token);
  });

  it("rejects tampered ciphertext", () => {
    const encrypted = encryptSecret("secret-value");
    const tampered = `${encrypted.slice(0, -2)}xx`;
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it("signs and verifies valid session tokens", () => {
    const token = signSessionToken({
      userId: "user_123",
      exp: Date.now() + 60_000,
    });
    const payload = verifySessionToken(token);
    expect(payload?.userId).toBe("user_123");
  });

  it("rejects expired or tampered session tokens", () => {
    const expired = signSessionToken({
      userId: "user_123",
      exp: Date.now() - 1000,
    });
    expect(verifySessionToken(expired)).toBeNull();

    const valid = signSessionToken({
      userId: "user_123",
      exp: Date.now() + 60_000,
    });
    expect(verifySessionToken(`${valid}tampered`)).toBeNull();
  });
});

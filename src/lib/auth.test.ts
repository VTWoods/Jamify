import { describe, expect, it } from "vitest";
import {
  getRequestOrigin,
  getSpotifyRedirectUri,
  isOriginSecure,
} from "./auth";

describe("request origin and Spotify redirect URI resolution", () => {
  it("uses x-forwarded-proto and x-forwarded-host behind a reverse proxy like Caddy", () => {
    const req = new Request("http://127.0.0.1:3000/api/auth/spotify/login", {
      headers: {
        "x-forwarded-proto": "https",
        "x-forwarded-host": "jamify.example.com",
        host: "127.0.0.1:3000",
      },
    });
    const origin = getRequestOrigin(req);
    expect(origin).toBe("https://jamify.example.com");
    expect(isOriginSecure(origin)).toBe(true);
    expect(getSpotifyRedirectUri(origin)).toBe(
      "https://jamify.example.com/api/auth/spotify/callback",
    );
  });

  it("handles comma-separated proxy forwarding headers", () => {
    const req = new Request("http://127.0.0.1:3000/api/auth/spotify/login", {
      headers: {
        "x-forwarded-proto": "https, http",
        "x-forwarded-host": "jamify.example.com, internal.proxy",
      },
    });
    expect(getRequestOrigin(req)).toBe("https://jamify.example.com");
  });

  it("uses the client Host header when accessed directly", () => {
    const req = new Request("http://0.0.0.0:3000/api/auth/spotify/login", {
      headers: {
        host: "127.0.0.1:3000",
      },
    });
    const origin = getRequestOrigin(req);
    expect(origin).toBe("http://127.0.0.1:3000");
    expect(isOriginSecure(origin)).toBe(false);
    expect(getSpotifyRedirectUri(origin)).toBe(
      "http://127.0.0.1:3000/api/auth/spotify/callback",
    );
  });
});

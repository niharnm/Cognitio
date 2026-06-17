import { describe, expect, it, vi } from "vitest";

describe("POST /api/verify", () => {
  it("returns a configuration error without leaking server secrets", async () => {
    vi.stubEnv("BRIGHT_DATA_API_KEY", "");
    vi.stubEnv("BRIGHT_DATA_SERP_ZONE", "");
    vi.stubEnv("BRIGHT_DATA_UNLOCKER_ZONE", "");

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost:3000/api/verify", {
        method: "POST",
        body: JSON.stringify({
          claim: "The agency announced a new public rule on June 12, 2026.",
          mode: "manual"
        })
      })
    );

    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.error.code).toBe("provider_not_configured");
    expect(JSON.stringify(payload)).not.toContain("BRIGHT_DATA_API_KEY=");
  });

  it("rejects invalid modes before provider setup", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost:3000/api/verify", {
        method: "POST",
        body: JSON.stringify({
          claim: "The agency announced a new public rule on June 12, 2026.",
          mode: "background_scan"
        })
      })
    );

    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error.message).toContain("Mode must be");
  });

  it("rejects unsupported image attachments before provider setup", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost:3000/api/verify", {
        method: "POST",
        body: JSON.stringify({
          claim: "The agency announced a new public rule on June 12, 2026.",
          mode: "manual",
          imageAttachments: [
            {
              name: "claim.txt",
              mediaType: "text/plain",
              sizeBytes: 120,
              dataUrl: "data:text/plain;base64,ZmFrZQ=="
            }
          ]
        })
      })
    );

    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error.message).toContain("Images must be PNG");
  });

  it("validates image attachments without echoing raw image data on configuration errors", async () => {
    vi.stubEnv("BRIGHT_DATA_API_KEY", "");
    vi.stubEnv("BRIGHT_DATA_SERP_ZONE", "");
    vi.stubEnv("BRIGHT_DATA_UNLOCKER_ZONE", "");

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost:3000/api/verify", {
        method: "POST",
        body: JSON.stringify({
          claim: "The agency announced a new public rule on June 12, 2026.",
          mode: "manual",
          imageAttachments: [
            {
              name: "claim.png",
              mediaType: "image/png",
              sizeBytes: 120,
              dataUrl: "data:image/png;base64,iVBORw0KGgo="
            }
          ]
        })
      })
    );

    const payloadText = JSON.stringify(await response.json());

    expect(response.status).toBe(503);
    expect(payloadText).not.toContain("iVBORw0KGgo=");
  });
});

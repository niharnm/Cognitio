import { describe, expect, it } from "vitest";
import { buildVerificationResult, normalizeClaim, rankSources, verifyClaim, type EvidenceProvider } from "../index";

describe("normalizeClaim", () => {
  it("rejects short or opinion-like text", () => {
    expect(normalizeClaim({ claim: "Fake?", mode: "manual" }).checkable).toBe(false);
    expect(normalizeClaim({ claim: "I think this is the best policy", mode: "manual" }).checkable).toBe(false);
  });

  it("builds bounded search queries for factual claims", () => {
    const normalized = normalizeClaim({
      claim: "The city announced a new public health rule on June 12, 2026.",
      mode: "manual"
    });

    expect(normalized.checkable).toBe(true);
    expect(normalized.queries.length).toBeGreaterThanOrEqual(2);
    expect(normalized.queries.length).toBeLessThanOrEqual(4);
  });
});

describe("rankSources", () => {
  it("deduplicates URLs and ranks stronger sources higher", () => {
    const ranked = rankSources([
      {
        title: "Blog repeats claim",
        url: "https://example.blogspot.com/post?utm_source=test",
        snippet: "reported"
      },
      {
        title: "Official report confirms claim",
        url: "https://www.cdc.gov/report",
        snippet: "official confirmed"
      },
      {
        title: "Official report confirms claim",
        url: "https://www.cdc.gov/report?ref=copy",
        snippet: "official confirmed"
      }
    ]);

    expect(ranked).toHaveLength(2);
    expect(ranked[0]?.url).toContain("cdc.gov");
    expect(ranked[0]?.stance).toBe("supports");
  });
});

describe("buildVerificationResult", () => {
  it("returns supported only with independent stronger support", () => {
    const normalizedClaim = normalizeClaim({
      claim: "The agency announced the final rule on June 12, 2026.",
      mode: "manual"
    });

    const result = buildVerificationResult({
      input: { claim: normalizedClaim.original, mode: "manual" },
      normalizedClaim,
      sources: rankSources([
        {
          title: "Official agency announcement",
          url: "https://www.cdc.gov/news",
          snippet: "official announced"
        },
        {
          title: "Reuters confirms final rule",
          url: "https://www.reuters.com/world/example",
          snippet: "confirmed according to officials"
        }
      ])
    });

    expect(result.verdict).toBe("supported");
    expect(result.missingEvidence).toHaveLength(0);
  });

  it("returns disputed when stronger evidence disputes the claim", () => {
    const normalizedClaim = normalizeClaim({
      claim: "The agency banned all domestic flights yesterday.",
      mode: "manual"
    });

    const result = buildVerificationResult({
      input: { claim: normalizedClaim.original, mode: "manual" },
      normalizedClaim,
      sources: rankSources([
        {
          title: "Fact check: false claim about flight ban",
          url: "https://www.factcheck.org/flight-ban",
          snippet: "false claim and no evidence"
        }
      ])
    });

    expect(result.verdict).toBe("disputed");
  });

  it("keeps image attachments as context and warns that OCR is not enabled", () => {
    const normalizedClaim = normalizeClaim({
      claim: "The agency announced a new public policy on June 12, 2026.",
      mode: "manual"
    });

    const result = buildVerificationResult({
      input: {
        claim: normalizedClaim.original,
        mode: "manual",
        imageAttachments: [
          {
            name: "screenshot.png",
            mediaType: "image/png",
            sizeBytes: 1200
          }
        ]
      },
      normalizedClaim,
      sources: []
    });

    expect(result.input.imageAttachments).toHaveLength(1);
    expect(result.warnings.join(" ")).toContain("OCR/vision analysis is not enabled");
  });
});

describe("verifyClaim", () => {
  it("does not fabricate support when provider returns no sources", async () => {
    const provider: EvidenceProvider = {
      async search() {
        return [];
      },
      async fetchPage() {
        return null;
      }
    };

    const result = await verifyClaim(
      {
        claim: "A public official announced a new nationwide policy on June 12, 2026.",
        mode: "manual"
      },
      provider
    );

    expect(result.verdict).toBe("unverified");
    expect(result.sources).toHaveLength(0);
    expect(result.missingEvidence).toContain("No public sources were returned for the generated search queries.");
  });

  it("enriches evidence from provider page fetches", async () => {
    const provider: EvidenceProvider = {
      async search() {
        return [
          {
            title: "Official statement confirms policy",
            url: "https://www.justice.gov/example",
            snippet: "official confirmed"
          },
          {
            title: "AP reports policy",
            url: "https://apnews.com/example",
            snippet: "reported according to officials"
          }
        ];
      },
      async fetchPage() {
        return {
          title: "Updated official statement",
          text: "The full public source text supports the extracted public claim."
        };
      }
    };

    const result = await verifyClaim(
      {
        claim: "The Justice Department announced a new public policy on June 12, 2026.",
        mode: "manual"
      },
      provider
    );

    expect(result.verdict).toBe("supported");
    expect(result.sources[0]?.extractedText).toContain("full public source text");
  });
});

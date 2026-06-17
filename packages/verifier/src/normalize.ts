import type { NormalizedClaim, VerificationInput } from "./types";

const opinionMarkers = [
  "i think",
  "i feel",
  "best",
  "worst",
  "should",
  "probably",
  "maybe",
  "could be",
  "might"
];

const questionOnlyPattern = /^[\s"'`]*(who|what|when|where|why|how|is|are|did|does|do|can|could|would)\b/i;

export function normalizeClaim(input: VerificationInput): NormalizedClaim {
  const original = input.claim.trim().replace(/\s+/g, " ");
  const normalized = stripNoise(original);

  if (!normalized) {
    return {
      original,
      normalized,
      checkable: false,
      reason: "No claim text was provided.",
      queries: []
    };
  }

  if (normalized.length < 16) {
    return {
      original,
      normalized,
      checkable: false,
      reason: "The text is too short to verify as a factual claim.",
      queries: []
    };
  }

  if (questionOnlyPattern.test(normalized) && normalized.endsWith("?")) {
    return {
      original,
      normalized,
      checkable: false,
      reason: "Questions need to be rewritten as factual claims before verification.",
      queries: []
    };
  }

  const lower = normalized.toLowerCase();
  if (opinionMarkers.some((marker) => lower.includes(marker))) {
    return {
      original,
      normalized,
      checkable: false,
      reason: "The text appears to be opinion, prediction, or preference rather than a factual claim.",
      queries: []
    };
  }

  return {
    original,
    normalized,
    checkable: true,
    queries: buildQueries(normalized, input.pageTitle)
  };
}

function stripNoise(text: string): string {
  return text
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
    .replace(/\s+[-|•]\s+.*$/, "")
    .trim();
}

function buildQueries(claim: string, pageTitle?: string): string[] {
  const quoted = `"${claim.slice(0, 180)}"`;
  const plain = claim.slice(0, 220);
  const factCheck = `${plain} fact check`;
  const source = pageTitle ? `${plain} ${pageTitle.slice(0, 80)}` : "";

  return Array.from(new Set([quoted, plain, factCheck, source].filter(Boolean))).slice(0, 4);
}

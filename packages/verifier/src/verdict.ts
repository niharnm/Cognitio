import type {
  AiSummaryAudit,
  EvidenceSource,
  NormalizedClaim,
  VerdictLabel,
  VerificationInput,
  VerificationResult
} from "./types";

export function buildVerificationResult(params: {
  input: VerificationInput;
  normalizedClaim: NormalizedClaim;
  sources: EvidenceSource[];
  aiSummaryAudit?: AiSummaryAudit;
  warnings?: string[];
}): VerificationResult {
  const { input, normalizedClaim } = params;
  const sources = params.sources.slice(0, 8);
  const supportingEvidence = sources.filter((source) => source.stance === "supports");
  const conflictingEvidence = sources.filter((source) => source.stance === "disputes");
  const contextEvidence = sources.filter((source) => source.stance === "context");
  const missingEvidence = buildMissingEvidence(normalizedClaim, sources);
  const verdict = chooseVerdict(normalizedClaim, supportingEvidence, conflictingEvidence, contextEvidence);
  const confidence = chooseConfidence(verdict, supportingEvidence, conflictingEvidence, sources);
  const warnings = [...(params.warnings ?? [])];

  if (input.imageAttachments?.length) {
    warnings.push(
      "Image attachments were received as request context, but OCR/vision analysis is not enabled. The verdict is based on the typed claim and public source evidence."
    );
  }

  return {
    id: createResultId(input.claim),
    input,
    normalizedClaim,
    verdict,
    confidence,
    explanation: explainVerdict(verdict, supportingEvidence, conflictingEvidence, contextEvidence),
    sources,
    supportingEvidence,
    conflictingEvidence,
    contextEvidence,
    missingEvidence,
    aiSummaryAudit:
      params.aiSummaryAudit ??
      {
        status: "not_checked",
        note: "AI summary audit was not requested for this verification."
      },
    checkedAt: new Date().toISOString(),
    warnings
  };
}

function chooseVerdict(
  normalizedClaim: NormalizedClaim,
  supportingEvidence: EvidenceSource[],
  conflictingEvidence: EvidenceSource[],
  contextEvidence: EvidenceSource[]
): VerdictLabel {
  if (!normalizedClaim.checkable) {
    return "not_checkable";
  }

  const independentSupport = new Set(supportingEvidence.map((source) => source.independenceKey)).size;
  const strongSupport = supportingEvidence.filter((source) => source.authorityScore >= 3).length;
  const strongConflict = conflictingEvidence.filter((source) => source.authorityScore >= 3).length;

  if (contextEvidence.length > 0 && strongSupport === 0) {
    return "misleading_context";
  }

  if (strongConflict > 0 && supportingEvidence.length > 0) {
    return "disputed";
  }

  if (strongConflict > 0 && supportingEvidence.length === 0) {
    return "disputed";
  }

  if (independentSupport >= 2 && strongSupport >= 1) {
    return "supported";
  }

  return "unverified";
}

function chooseConfidence(
  verdict: VerdictLabel,
  supportingEvidence: EvidenceSource[],
  conflictingEvidence: EvidenceSource[],
  sources: EvidenceSource[]
): VerificationResult["confidence"] {
  const strongSources = sources.filter((source) => source.authorityScore >= 3).length;
  if (verdict === "not_checkable") {
    return "high";
  }
  if (strongSources >= 2 && (supportingEvidence.length >= 2 || conflictingEvidence.length >= 1)) {
    return "high";
  }
  if (sources.length >= 3 || strongSources >= 1) {
    return "medium";
  }
  return "low";
}

function explainVerdict(
  verdict: VerdictLabel,
  _supportingEvidence: EvidenceSource[],
  _conflictingEvidence: EvidenceSource[],
  _contextEvidence: EvidenceSource[]
): string {
  switch (verdict) {
    case "supported":
      return "Multiple independent sources, including at least one stronger source, support the claim.";
    case "disputed":
      return "One or more stronger sources dispute the claim or describe it as false, unfounded, or misleading.";
    case "misleading_context":
      return "The available evidence suggests the claim may omit important context, timing, or source details.";
    case "not_checkable":
      return "The submitted text is not a clear factual claim that can be checked against public evidence.";
    case "unverified":
    default:
      return "The available public evidence is not strong enough to verify the claim.";
  }
}

function buildMissingEvidence(normalizedClaim: NormalizedClaim, sources: EvidenceSource[]): string[] {
  if (!normalizedClaim.checkable) {
    return [normalizedClaim.reason ?? "A clearer factual claim is needed."];
  }

  const missing: string[] = [];
  const independentSources = new Set(sources.map((source) => source.independenceKey)).size;

  if (sources.length === 0) {
    missing.push("No public sources were returned for the generated search queries.");
  }
  if (independentSources < 2) {
    missing.push("Fewer than two independent sources were found.");
  }
  if (!sources.some((source) => source.authorityScore >= 3)) {
    missing.push("No higher-authority primary, wire, official, academic, or fact-checking source was found.");
  }

  return missing;
}

function createResultId(claim: string): string {
  let hash = 0;
  for (const char of claim) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return `vr_${hash.toString(16)}_${Date.now().toString(36)}`;
}

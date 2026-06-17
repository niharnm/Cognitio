export { normalizeClaim } from "./normalize";
export { rankSources, scoreAuthority, independenceKey } from "./source-ranking";
export { buildVerificationResult } from "./verdict";
export { verifyClaim } from "./verify";
export { BrightDataProvider, createBrightDataProviderFromEnv } from "./providers/bright-data";
export type {
  AiSummaryAudit,
  ConfidenceLevel,
  EvidenceProvider,
  EvidenceSource,
  EvidenceStance,
  ImageAttachment,
  NormalizedClaim,
  SearchResult,
  VerdictLabel,
  VerificationInput,
  VerificationResult
} from "./types";

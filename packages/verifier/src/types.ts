export type VerdictLabel =
  | "supported"
  | "disputed"
  | "unverified"
  | "misleading_context"
  | "not_checkable";

export type ConfidenceLevel = "high" | "medium" | "low";

export type EvidenceStance = "supports" | "disputes" | "context" | "unknown";

export interface ImageAttachment {
  name: string;
  mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
  sizeBytes: number;
}

export interface VerificationInput {
  claim: string;
  sourceUrl?: string;
  pageTitle?: string;
  imageAttachments?: ImageAttachment[];
  mode: "selected_text" | "page" | "manual";
}

export interface NormalizedClaim {
  original: string;
  normalized: string;
  checkable: boolean;
  reason?: string;
  queries: string[];
}

export interface SearchResult {
  title: string;
  url: string;
  snippet?: string;
  publishedAt?: string;
  source?: string;
}

export interface EvidenceSource extends SearchResult {
  stance: EvidenceStance;
  authorityScore: number;
  freshnessScore: number;
  independenceKey: string;
  extractedText?: string;
  whyItMatters: string;
}

export interface AiSummaryAudit {
  status: "not_configured" | "not_checked" | "aligned" | "conflicting" | "weak_sources";
  summary?: string;
  sources?: SearchResult[];
  note: string;
}

export interface VerificationResult {
  id: string;
  input: VerificationInput;
  normalizedClaim: NormalizedClaim;
  verdict: VerdictLabel;
  confidence: ConfidenceLevel;
  explanation: string;
  sources: EvidenceSource[];
  supportingEvidence: EvidenceSource[];
  conflictingEvidence: EvidenceSource[];
  contextEvidence: EvidenceSource[];
  missingEvidence: string[];
  aiSummaryAudit: AiSummaryAudit;
  checkedAt: string;
  warnings: string[];
}

export interface EvidenceProvider {
  search(query: string): Promise<SearchResult[]>;
  fetchPage(url: string): Promise<{ text: string; title?: string; publishedAt?: string } | null>;
  auditAiSummary?(claim: NormalizedClaim): Promise<AiSummaryAudit>;
}

import { normalizeClaim } from "./normalize";
import { rankSources } from "./source-ranking";
import type { EvidenceProvider, EvidenceSource, SearchResult, VerificationInput, VerificationResult } from "./types";
import { buildVerificationResult } from "./verdict";

export async function verifyClaim(input: VerificationInput, provider: EvidenceProvider): Promise<VerificationResult> {
  const normalizedClaim = normalizeClaim(input);

  if (!normalizedClaim.checkable) {
    return buildVerificationResult({
      input,
      normalizedClaim,
      sources: [],
      aiSummaryAudit: {
        status: "not_checked",
        note: "AI summary audit was skipped because the input is not a checkable factual claim."
      }
    });
  }

  const searchResults = await searchAcrossQueries(provider, normalizedClaim.queries);
  const ranked = rankSources(searchResults).slice(0, 8);
  const enriched = await enrichSources(provider, ranked);
  const aiSummaryAudit = provider.auditAiSummary
    ? await provider.auditAiSummary(normalizedClaim)
    : {
        status: "not_configured" as const,
        note: "AI summary audit is not configured for this environment."
      };

  return buildVerificationResult({
    input,
    normalizedClaim,
    sources: enriched,
    aiSummaryAudit
  });
}

async function searchAcrossQueries(provider: EvidenceProvider, queries: string[]): Promise<SearchResult[]> {
  const results = await Promise.allSettled(queries.map((query) => provider.search(query)));
  return results.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
}

async function enrichSources(provider: EvidenceProvider, sources: EvidenceSource[]): Promise<EvidenceSource[]> {
  const settled = await Promise.allSettled(
    sources.slice(0, 5).map(async (source) => {
      const page = await provider.fetchPage(source.url);
      if (!page) {
        return source;
      }
      return {
        ...source,
        title: page.title ?? source.title,
        ...(page.publishedAt ? { publishedAt: page.publishedAt } : {}),
        extractedText: page.text.slice(0, 1500)
      };
    })
  );

  const enriched = settled.flatMap((result, index) => {
    if (result.status === "fulfilled") {
      return [result.value];
    }
    const fallback = sources[index];
    return fallback ? [fallback] : [];
  });
  return [...enriched, ...sources.slice(enriched.length)];
}

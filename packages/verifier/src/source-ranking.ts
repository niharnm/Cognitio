import type { EvidenceSource, SearchResult } from "./types";

const highAuthorityDomains = [
  ".gov",
  ".edu",
  "apnews.com",
  "reuters.com",
  "bbc.com",
  "bbc.co.uk",
  "npr.org",
  "factcheck.org",
  "politifact.com",
  "snopes.com",
  "who.int",
  "cdc.gov",
  "sec.gov",
  "justice.gov",
  "congress.gov",
  "whitehouse.gov"
];

const lowAuthoritySignals = [
  "blogspot.",
  "substack.com",
  "medium.com",
  "facebook.com",
  "x.com",
  "twitter.com",
  "tiktok.com",
  "instagram.com",
  "youtube.com"
];

export function rankSources(results: SearchResult[]): EvidenceSource[] {
  const seen = new Set<string>();

  return results
    .filter((result) => {
      if (!result.url || seen.has(canonicalUrl(result.url))) {
        return false;
      }
      seen.add(canonicalUrl(result.url));
      return true;
    })
    .map((result) => ({
      ...result,
      stance: inferStance(result),
      authorityScore: scoreAuthority(result.url),
      freshnessScore: scoreFreshness(result.publishedAt),
      independenceKey: independenceKey(result.url),
      whyItMatters: explainSource(result)
    }))
    .sort((a, b) => b.authorityScore + b.freshnessScore - (a.authorityScore + a.freshnessScore));
}

export function scoreAuthority(url: string): number {
  const host = hostname(url);
  if (highAuthorityDomains.some((domain) => host.endsWith(domain) || host.includes(domain))) {
    return 4;
  }
  if (lowAuthoritySignals.some((signal) => host.includes(signal))) {
    return 1;
  }
  return 2;
}

export function independenceKey(url: string): string {
  const host = hostname(url).replace(/^www\./, "");
  const parts = host.split(".");
  return parts.length > 2 ? parts.slice(-2).join(".") : host;
}

function inferStance(result: SearchResult): EvidenceSource["stance"] {
  const text = `${result.title} ${result.snippet ?? ""}`.toLowerCase();
  if (/\b(false|fake|hoax|debunked|misleading|no evidence|unfounded)\b/.test(text)) {
    return "disputes";
  }
  if (/\b(context|old video|old photo|resurfaced|missing context)\b/.test(text)) {
    return "context";
  }
  if (/\b(confirms|confirmed|announced|official|according to|reported)\b/.test(text)) {
    return "supports";
  }
  return "unknown";
}

function scoreFreshness(publishedAt?: string): number {
  if (!publishedAt) {
    return 0;
  }

  const published = new Date(publishedAt).getTime();
  if (Number.isNaN(published)) {
    return 0;
  }

  const ageDays = (Date.now() - published) / 86_400_000;
  if (ageDays < 14) {
    return 2;
  }
  if (ageDays < 180) {
    return 1;
  }
  return 0;
}

function explainSource(result: SearchResult): string {
  const host = hostname(result.url).replace(/^www\./, "");
  const authority = scoreAuthority(result.url);
  if (authority >= 4) {
    return `${host} is treated as a higher-authority source for this check.`;
  }
  if (authority <= 1) {
    return `${host} is useful context but not strong independent confirmation.`;
  }
  return `${host} provides corroborating context that needs comparison with other sources.`;
}

function canonicalUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    parsed.search = "";
    return parsed.toString();
  } catch {
    return url;
  }
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

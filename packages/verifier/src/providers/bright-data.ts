import type { AiSummaryAudit, EvidenceProvider, NormalizedClaim, SearchResult } from "../types";

export interface BrightDataConfig {
  apiKey: string;
  serpZone: string;
  unlockerZone: string;
  timeoutMs?: number;
}

interface BrightDataRequest {
  zone: string;
  url: string;
  format: "json" | "raw" | "markdown";
}

export class BrightDataProvider implements EvidenceProvider {
  private readonly config: Required<BrightDataConfig>;

  constructor(config: BrightDataConfig) {
    this.config = {
      ...config,
      timeoutMs: config.timeoutMs ?? 12_000
    };
  }

  async search(query: string): Promise<SearchResult[]> {
    const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
    const payload = await this.request({ zone: this.config.serpZone, url, format: "json" });
    return parseSerpResults(payload);
  }

  async fetchPage(url: string): Promise<{ text: string; title?: string; publishedAt?: string } | null> {
    const payload = await this.request({ zone: this.config.unlockerZone, url, format: "markdown" });
    if (typeof payload !== "string") {
      return null;
    }

    const page = {
      text: payload.replace(/\s+/g, " ").trim(),
      ...optionalField("title", extractMarkdownTitle(payload)),
      ...optionalField("publishedAt", extractDate(payload))
    };

    return page;
  }

  async auditAiSummary(_claim: NormalizedClaim): Promise<AiSummaryAudit> {
    return {
      status: "not_configured",
      note: "Bright Data AI summary scraping is intentionally left behind a separate provider flag for MVP review."
    };
  }

  private async request(body: BrightDataRequest): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch("https://api.brightdata.com/request", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`Bright Data request failed with ${response.status}`);
      }

      const contentType = response.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        return response.json();
      }
      return response.text();
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function createBrightDataProviderFromEnv(env: NodeJS.ProcessEnv): BrightDataProvider | null {
  const apiKey = env.BRIGHT_DATA_API_KEY;
  const serpZone = env.BRIGHT_DATA_SERP_ZONE;
  const unlockerZone = env.BRIGHT_DATA_UNLOCKER_ZONE;

  if (!apiKey || !serpZone || !unlockerZone) {
    return null;
  }

  const config: BrightDataConfig = {
    apiKey,
    serpZone,
    unlockerZone
  };

  if (env.BRIGHT_DATA_TIMEOUT_MS) {
    config.timeoutMs = Number(env.BRIGHT_DATA_TIMEOUT_MS);
  }

  return new BrightDataProvider(config);
}

function parseSerpResults(payload: unknown): SearchResult[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const root = payload as Record<string, unknown>;
  const candidates = [
    root.organic,
    root.organic_results,
    root.results,
    root.items
  ].find(Array.isArray);

  if (!Array.isArray(candidates)) {
    return [];
  }

  return candidates
    .map((item) => parseSerpItem(item))
    .filter((item): item is SearchResult => Boolean(item?.title && item.url));
}

function parseSerpItem(item: unknown): SearchResult | null {
  if (!item || typeof item !== "object") {
    return null;
  }
  const record = item as Record<string, unknown>;
  const title = stringValue(record.title);
  const url = stringValue(record.link) ?? stringValue(record.url);

  if (!title || !url) {
    return null;
  }

  return {
    title,
    url,
    ...optionalField("snippet", stringValue(record.description) ?? stringValue(record.snippet)),
    ...optionalField("publishedAt", stringValue(record.date)),
    ...optionalField("source", stringValue(record.source))
  };
}

function extractMarkdownTitle(markdown: string): string | undefined {
  return markdown.match(/^#\s+(.+)$/m)?.[1]?.trim();
}

function extractDate(text: string): string | undefined {
  return text.match(/\b(20\d{2}-\d{2}-\d{2}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},\s+20\d{2})\b/i)?.[1];
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function optionalField<Key extends string, Value>(key: Key, value: Value | undefined): { [K in Key]: Value } | object {
  return value === undefined ? {} : { [key]: value };
}

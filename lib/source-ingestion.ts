/* global clearTimeout */
import type { SourceDocument } from "./schemas";

const maxSourceChars = 12000;
const fetchTimeoutMs = 10000;

function decodeEntities(value: string) {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function htmlToText(value: string) {
  return decodeEntities(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeText(value: string, contentType: string | null) {
  const rawText = contentType?.includes("text/html") ? htmlToText(value) : value.replace(/\s+/g, " ").trim();
  return rawText.slice(0, maxSourceChars);
}

function sourceQuality(wordCount: number): SourceDocument["sourceQuality"] {
  if (wordCount >= 250) return "strong";
  if (wordCount >= 40) return "limited";
  return "none";
}

function failedSource(input: FetchSourceInput, fetchedAt: string, reason: string): SourceDocument {
  return {
    id: input.id,
    title: input.title,
    url: input.url,
    sourceType: input.sourceType,
    extractedText: `Source fetch failed: ${reason}`,
    fetchedAt,
    fetchStatus: "failed",
    wordCount: 0,
    sourceQuality: "none",
    failureReason: reason
  };
}

export type FetchSourceInput = {
  id: string;
  title: string;
  url: string;
  sourceType: SourceDocument["sourceType"];
};

export function isLikelyUrl(value: string) {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export async function fetchSourceDocument(input: FetchSourceInput, fetchedAt: string): Promise<SourceDocument> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), fetchTimeoutMs);

  try {
    const response = await fetch(input.url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "OKX-Content-Engineer/0.1 (+source-verification)",
        Accept: "text/html,text/plain,application/json;q=0.8,*/*;q=0.5"
      }
    });

    if (!response.ok) {
      return failedSource(input, fetchedAt, `HTTP ${response.status}`);
    }

    const contentType = response.headers.get("content-type");
    const body = await response.text();
    const extractedText = normalizeText(body, contentType);
    const wordCount = extractedText ? extractedText.split(/\s+/).length : 0;

    if (!wordCount) {
      return failedSource(input, fetchedAt, "No readable text extracted");
    }

    return {
      id: input.id,
      title: input.title,
      url: input.url,
      sourceType: input.sourceType,
      extractedText,
      fetchedAt,
      fetchStatus: "fetched",
      wordCount,
      sourceQuality: sourceQuality(wordCount)
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unknown fetch error";
    return failedSource(input, fetchedAt, reason);
  } finally {
    clearTimeout(timeout);
  }
}

export function noteSource(
  id: string,
  title: string,
  sourceType: SourceDocument["sourceType"],
  extractedText: string,
  fetchedAt: string,
  qualityOverride?: SourceDocument["sourceQuality"]
): SourceDocument {
  const wordCount = extractedText ? extractedText.split(/\s+/).length : 0;
  return {
    id,
    title,
    sourceType,
    extractedText,
    fetchedAt,
    fetchStatus: "fetched",
    wordCount,
    sourceQuality: qualityOverride ?? sourceQuality(wordCount)
  };
}

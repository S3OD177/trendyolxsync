import { sallaClient } from "@/lib/salla/client";
import type { SallaMatchOutcome, SallaProductRecord } from "@/lib/salla/types";

const MIN_CONFIDENCE_SCORE = 0.6;
const STOPWORDS = new Set([
  "with",
  "and",
  "for",
  "the",
  "a",
  "an",
  "of",
  "to",
  "from",
  "in",
  "on",
  "by"
]);

export function normalizeMatchText(input: string) {
  return input
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[_-]+/g, " ")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(input: string) {
  const normalized = normalizeMatchText(input);
  if (!normalized) {
    return [] as string[];
  }

  return normalized.split(" ").filter((token) => token.length > 1);
}

function tokenOverlapScore(left: string[], right: string[]) {
  if (!left.length || !right.length) {
    return 0;
  }

  const rightSet = new Set(right);
  const overlap = left.filter((token) => rightSet.has(token)).length;
  return overlap / left.length;
}

function buildKeywordQuery(name: string) {
  const normalized = normalizeMatchText(name);
  if (!normalized) {
    return "";
  }

  const tokens = normalized.split(" ").filter((token) => token.length > 1);
  const seen = new Set<string>();
  const unique = tokens.filter((token) => {
    if (seen.has(token)) {
      return false;
    }
    seen.add(token);
    return true;
  });

  const alphaNumericTokens = unique.filter((token) => /[a-z]/.test(token) && /\d/.test(token));
  if (alphaNumericTokens.length > 0) {
    return alphaNumericTokens[0];
  }

  const longNumericTokens = unique.filter((token) => /^\d+$/.test(token) && token.length >= 4);
  if (longNumericTokens.length > 0) {
    return longNumericTokens[0];
  }

  const strongTokens = unique.filter((token) => token.length >= 4 && !STOPWORDS.has(token));
  if (strongTokens.length >= 2) {
    return strongTokens.slice(0, 2).join(" ");
  }
  if (strongTokens.length === 1) {
    return strongTokens[0];
  }

  return unique.slice(0, 3).join(" ");
}

export function scoreNameSimilarity(query: string, candidate: string) {
  const normalizedQuery = normalizeMatchText(query);
  const normalizedCandidate = normalizeMatchText(candidate);

  if (!normalizedQuery || !normalizedCandidate) {
    return 0;
  }

  if (normalizedQuery === normalizedCandidate) {
    return 1;
  }

  const queryTokens = tokenize(normalizedQuery);
  const candidateTokens = tokenize(normalizedCandidate);
  const overlap = tokenOverlapScore(queryTokens, candidateTokens);

  const contains =
    normalizedCandidate.includes(normalizedQuery) || normalizedQuery.includes(normalizedCandidate)
      ? 1
      : 0;
  const startsWith =
    normalizedCandidate.startsWith(normalizedQuery) || normalizedQuery.startsWith(normalizedCandidate)
      ? 1
      : 0;

  const score = overlap * 0.65 + contains * 0.25 + startsWith * 0.1;
  return Number(score.toFixed(4));
}

export function pickBestNameMatch(products: SallaProductRecord[], query: string, threshold = MIN_CONFIDENCE_SCORE) {
  const scored = products
    .map((product) => ({
      product,
      score: scoreNameSimilarity(query, product.name)
    }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best || best.score < threshold) {
    return null;
  }

  return best;
}

export async function matchSallaProduct(input: {
  sku?: string | null;
  name?: string | null;
  threshold?: number;
}): Promise<SallaMatchOutcome> {
  const threshold = input.threshold ?? MIN_CONFIDENCE_SCORE;
  const sku = input.sku?.trim();
  const name = input.name?.trim();

  if (sku) {
    const exact = await sallaClient.fetchProductBySku(sku);
    if (exact) {
      return {
        matched: true,
        method: "SKU",
        score: 1,
        reason: "MATCHED",
        product: exact,
        candidates: [
          {
            id: exact.id,
            sku: exact.sku,
            name: exact.name,
            score: 1
          }
        ]
      };
    }
  }

  if (!name) {
    return {
      matched: false,
      method: null,
      score: null,
      reason: "NO_CANDIDATES",
      product: null,
      candidates: []
    };
  }

  const keyword = buildKeywordQuery(name) || name;
  const candidates = await sallaClient.searchProductsByKeyword(keyword, 1, 25);
  if (!candidates.length) {
    return {
      matched: false,
      method: null,
      score: null,
      reason: "NO_CANDIDATES",
      product: null,
      candidates: []
    };
  }

  const scoredCandidates = candidates
    .map((candidate) => ({
      product: candidate,
      score: scoreNameSimilarity(name, candidate.name)
    }))
    .sort((a, b) => b.score - a.score);

  const preview = scoredCandidates.slice(0, 5).map(({ product, score }) => ({
    id: product.id,
    sku: product.sku,
    name: product.name,
    score
  }));

  const best = scoredCandidates[0];
  if (!best || best.score < threshold) {
    return {
      matched: false,
      method: null,
      score: best?.score ?? null,
      reason: "NO_CONFIDENT_MATCH",
      product: null,
      candidates: preview
    };
  }

  return {
    matched: true,
    method: "NAME",
    score: best.score,
    reason: "MATCHED",
    product: best.product,
    candidates: preview
  };
}

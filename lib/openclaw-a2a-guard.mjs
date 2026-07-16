const MONEY_PATTERN = /(?:\b(?:USDT|USD)\s*(\d+(?:\.\d+)?)|\b(\d+(?:\.\d+)?)\s*(?:USDT|USD)\b)/gi;
const COMMERCIAL_LANGUAGE = /\b(?:accept|campaign|deliver|engagement|offer|package|pilot|proceed|provide|quote|scope|service)\b/i;
const NEGATING_LANGUAGE = /\b(?:below|cannot|can't|cant|decline|declining|floor|minimum|refuse|unable|won't|wont)\b/i;
const EXPLICIT_OFFER = /(?:\b(?:at|for)\s+(?:USDT\s*)?\d+(?:\.\d+)?\s*(?:USDT|USD)?[^.!?\n]{0,100}\b(?:i|we)\s+can\s+(?:deliver|offer|provide)|\b(?:i|we)\s+can\s+(?:deliver|offer|provide)[^.!?\n]{0,100}\b(?:at|for)\s+(?:USDT\s*)?\d+(?:\.\d+)?\s*(?:USDT|USD)?)/i;

function segments(text) {
  return text
    .split(/(?<=[.!?])\s+|\n{2,}/)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

export function findSubfloorOffer(text, floor) {
  if (!text || !Number.isFinite(floor) || floor <= 0) return null;

  for (const segment of segments(text)) {
    MONEY_PATTERN.lastIndex = 0;
    for (const match of segment.matchAll(MONEY_PATTERN)) {
      const amount = Number(match[1] ?? match[2]);
      if (!Number.isFinite(amount) || amount >= floor) continue;

      const explicitOffer = EXPLICIT_OFFER.test(segment);
      const positiveCommercialStatement = COMMERCIAL_LANGUAGE.test(segment);
      if ((explicitOffer || positiveCommercialStatement) && !NEGATING_LANGUAGE.test(segment)) {
        return { amount, excerpt: segment.slice(0, 280) };
      }
    }
  }

  return null;
}

export function parseNegotiationRound(prompt) {
  const match = String(prompt ?? "").match(/(?:negotiation\s+)?round\s*(?:=|:|-)?\s*(\d+)/i);
  return match ? Math.max(1, Math.min(Number(match[1]), 2)) : 1;
}

export function isFlussoA2ATurn({ agentId, sessionKey, prompt }) {
  const input = String(prompt ?? "");
  const flussoAgent = String(agentId ?? "").toLowerCase() === "flusso";
  const groupSession = String(sessionKey ?? "").includes(":group:");
  const explicitCapability = /Flusso Content Engineering capability|a2a-agent-chat|OKX\.AI A2A|job_accepted|okxJobId|XMTP/i.test(input);
  const negotiation = /\b(?:budget|negotiat|quote|USDT)\b/i.test(input);
  return explicitCapability || (flussoAgent && (groupSession || negotiation));
}

export function canUseFlussoPrivateTool({ agentId, sessionKey }) {
  const normalizedAgentId = String(agentId ?? "").toLowerCase();
  if (normalizedAgentId === "flusso") return true;

  return normalizedAgentId === "main"
    && String(sessionKey ?? "").includes(":okx-a2a:group:");
}

export function floorFallback(floor, round) {
  if (round >= 2) {
    return `I cannot accept this engagement below ${floor} USDT. Flusso's minimum engagement is ${floor} USDT, so I must decline unless the budget changes.`;
  }

  return `Flusso's minimum engagement is ${floor} USDT. I can offer a reduced, credible scope at ${floor} USDT, but I cannot offer work below that price.`;
}

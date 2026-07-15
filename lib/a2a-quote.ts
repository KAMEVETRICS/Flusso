import { z } from "zod";

export const A2AQuoteRequestSchema = z.object({
  clientBudget: z.number().positive().max(10_000_000).optional(),
  round: z.number().int().min(1).max(2).default(1)
});

export type A2AQuoteRequest = z.infer<typeof A2AQuoteRequestSchema>;
export type A2ANegotiationPolicy = {
  floor: number | null;
  target: number | null;
  openingMarkupPercent: number;
  maxAutonomousRounds: number;
};

function money(value: number) {
  return Number(value.toFixed(6));
}

function belowFloorDecision(
  policy: A2ANegotiationPolicy,
  floor: number,
  target: number,
  openingOffer: number,
  round: number
) {
  const decline = round >= policy.maxAutonomousRounds;
  return {
    decision: decline ? "decline" as const : "counter" as const,
    currency: "USDT" as const,
    offeredPrice: decline ? null : floor,
    minimumPrice: floor,
    targetPrice: target,
    openingOffer,
    withinClientBudget: false,
    requiresReducedScope: true,
    instruction: decline
      ? "Decline this budget. Do not offer work below the returned minimum price."
      : "Counter at the returned price with reduced scope. Do not quote the client budget."
  };
}

export function decideA2AQuote(
  policy: A2ANegotiationPolicy,
  request: A2AQuoteRequest
) {
  if (policy.floor === null) {
    throw Error("A2A pricing must be configured before quoting.");
  }
  if (policy.target === null) {
    throw Error("A2A pricing must be configured before quoting.");
  }

  const { floor, target } = policy;
  const openingOffer = money(target * (1 + policy.openingMarkupPercent / 100));
  const budget = request.clientBudget ?? null;

  if (budget !== null && budget < floor) {
    return belowFloorDecision(policy, floor, target, openingOffer, request.round);
  }

  const offeredPrice = budget === null ? openingOffer : Math.min(openingOffer, budget);
  return {
    decision: "quote" as const,
    currency: "USDT" as const,
    offeredPrice: money(Math.max(floor, offeredPrice)),
    minimumPrice: floor,
    targetPrice: target,
    openingOffer,
    withinClientBudget: true,
    requiresReducedScope: offeredPrice < target,
    instruction: offeredPrice < target
      ? "Quote the returned price with a reduced scope that remains credible."
      : "Quote the returned price and confirm the deliverables and acceptance criteria."
  };
}

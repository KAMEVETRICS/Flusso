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
  const budget = request.clientBudget ?? null;
  const target = policy.target ?? policy.floor;

  if (target === null) {
    return {
      decision: budget === null ? "negotiate" as const : "quote" as const,
      currency: "USDT" as const,
      offeredPrice: budget,
      minimumPrice: null,
      targetPrice: null,
      openingOffer: null,
      withinClientBudget: budget === null ? null : true,
      requiresReducedScope: false,
      instruction: budget === null
        ? "Ask for the user's budget and scope, then price the actual workload using the marketplace playbook."
        : "Evaluate the workload against the user's budget. Accept it when fair; otherwise counter at a justified price using the marketplace playbook."
    };
  }

  const floor = policy.floor;
  const openingOffer = money(target * (1 + policy.openingMarkupPercent / 100));

  if (floor !== null && budget !== null && budget < floor) {
    return belowFloorDecision(policy, floor, target, openingOffer, request.round);
  }

  const offeredPrice = budget === null ? openingOffer : Math.min(openingOffer, budget);
  const boundedOffer = floor === null ? offeredPrice : Math.max(floor, offeredPrice);
  return {
    decision: "quote" as const,
    currency: "USDT" as const,
    offeredPrice: money(boundedOffer),
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

import process from "node:process";

function optionalPositiveNumber(name: string) {
  const raw = process.env[name]?.trim();
  if (!raw) return null;

  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(name + " must be a positive number when configured.");
  }
  return value;
}

export function getContentEngineeringService() {
  const floor = optionalPositiveNumber("A2A_PRICE_FLOOR_USDT");
  const target = optionalPositiveNumber("A2A_PRICE_TARGET_USDT");
  const markup = optionalPositiveNumber("A2A_OPENING_MARKUP_PERCENT") ?? 15;

  if (floor !== null && target !== null && floor > target) {
    throw new Error("A2A_PRICE_FLOOR_USDT cannot exceed A2A_PRICE_TARGET_USDT.");
  }

  return {
    provider: "Flusso",
    name: "Content Engineering",
    type: "A2A" as const,
    listingFee: null,
    description: "Flusso delivers source-backed campaign strategy and platform-native content production.",
    requiredInputs: [
      "brand and industry",
      "website or source documents",
      "campaign goal",
      "target audience",
      "target platforms",
      "tone and restrictions"
    ],
    deliverables: [
      "campaign strategy",
      "content calendar",
      "publish-ready content assets",
      "visual briefs",
      "proof report",
      "strategy, calendar, and content-pack exports"
    ],
    negotiation: {
      configured: floor !== null && target !== null,
      currency: "USDT" as const,
      floor,
      target,
      openingMarkupPercent: markup,
      maxAutonomousRounds: 2,
      priceDrivers: [
        "content asset count",
        "platform count",
        "research depth",
        "visual count",
        "urgency",
        "revision allowance"
      ],
      rules: [
        "Never quote below the configured floor.",
        "When the budget is too low, reduce scope before reducing price.",
        "Include one revision unless the agreement says otherwise.",
        "Confirm deliverables, price, deadline, and acceptance criteria before accepting."
      ]
    }
  };
}
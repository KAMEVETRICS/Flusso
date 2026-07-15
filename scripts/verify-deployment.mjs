/* global AbortSignal, console, fetch */
import process from "node:process";
import { URL } from "node:url";

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(name + " is required.");
  return value;
}

function expectedNumber(name) {
  const value = Number(required(name));
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(name + " must be a positive number.");
  }
  return value;
}

const baseUrl = required("CONTENT_ENGINE_URL");
const apiKey = required("A2A_INTERNAL_API_KEY");
const expectedFloor = expectedNumber("A2A_PRICE_FLOOR_USDT");
const expectedTarget = expectedNumber("A2A_PRICE_TARGET_USDT");
const expectedMarkup = process.env.A2A_OPENING_MARKUP_PERCENT?.trim()
  ? expectedNumber("A2A_OPENING_MARKUP_PERCENT")
  : 15;
const endpoint = new URL("/api/internal/a2a/service", baseUrl);
const quoteEndpoint = new URL("/api/internal/a2a/quote", baseUrl);

async function requestQuote(round) {
  const quoteResponse = await fetch(quoteEndpoint, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + apiKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ clientBudget: expectedFloor - 1, round }),
    signal: AbortSignal.timeout(10_000)
  });
  const quotePayload = await quoteResponse.json();
  if (!quoteResponse.ok) {
    throw new Error("The quote endpoint returned HTTP " + quoteResponse.status + ".");
  }
  return quotePayload.quote;
}

const response = await fetch(endpoint, {
  headers: { Authorization: "Bearer " + apiKey },
  signal: AbortSignal.timeout(10_000)
});

const responseText = await response.text();
let payload;
try {
  payload = JSON.parse(responseText);
} catch {
  throw new Error("The service endpoint did not return JSON (HTTP " + response.status + ").");
}

if (!response.ok) {
  throw new Error(
    "The service endpoint returned HTTP " +
      response.status +
      ": " +
      (payload.error ?? "unknown error")
  );
}

const service = payload.service;
const negotiation = service?.negotiation;
if (!service || !negotiation) {
  throw new Error("The service response is missing negotiation policy.");
}

const assertions = [
  ["provider", service.provider, "Flusso"],
  ["service type", service.type, "A2A"],
  ["currency", negotiation.currency, "USDT"],
  ["configured", negotiation.configured, true],
  ["floor", negotiation.floor, expectedFloor],
  ["target", negotiation.target, expectedTarget],
  ["opening markup", negotiation.openingMarkupPercent, expectedMarkup]
];

for (const [label, actual, expected] of assertions) {
  if (actual !== expected) {
    throw new Error(
      "Deployment mismatch for " + label + ": expected " + expected + ", received " + actual + "."
    );
  }
}

const firstRound = await requestQuote(1);
if (firstRound.decision !== "counter" || firstRound.offeredPrice !== expectedFloor) {
  throw new Error("Below-floor round one did not counter at the configured floor.");
}

const secondRound = await requestQuote(2);
if (secondRound.decision !== "decline" || secondRound.offeredPrice !== null) {
  throw new Error("Below-floor round two did not decline the negotiation.");
}

const openingOffer = Number((expectedTarget * (1 + expectedMarkup / 100)).toFixed(6));
console.log(
  JSON.stringify(
    {
      status: "ready",
      agent: service.provider,
      service: service.name,
      type: service.type,
      engine: endpoint.origin,
      pricing: {
        currency: negotiation.currency,
        floor: negotiation.floor,
        target: negotiation.target,
        openingOffer,
        floorEnforced: true
      }
    },
    null,
    2
  )
);

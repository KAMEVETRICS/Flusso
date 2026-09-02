import assert from "node:assert/strict";
import test from "node:test";
import {
  canUseFlussoPrivateTool,
  findSubfloorOffer,
  floorFallback,
  isFlussoA2ATurn,
  parseNegotiationRound,
  samplingToolBlock
} from "../lib/openclaw-a2a-guard.mjs";

test("detects the below-floor pilot shown in the failed negotiation", () => {
  const violation = findSubfloorOffer(
    "At 20 USDT, I can offer a focused pilot: 2 publish-ready cross-platform assets and one revision.",
    30
  );
  assert.equal(violation?.amount, 20);
});

test("allows a below-floor budget to be rejected and countered at the floor", () => {
  const response = "A full campaign cannot be delivered within 20 USDT. Flusso's minimum is 30 USDT, and I can offer a reduced scope at 30 USDT.";
  assert.equal(findSubfloorOffer(response, 30), null);
});

test("allows a rejection and floor counter in the same sentence", () => {
  const response = "I cannot accept 20 USDT, but I can offer a reduced package for 30 USDT.";
  assert.equal(findSubfloorOffer(response, 30), null);
});

test("does not flag a normal quote above the floor", () => {
  assert.equal(findSubfloorOffer("I can offer the campaign for 100 USDT.", 30), null);
});

test("uses a counter in round one and a decline in round two", () => {
  assert.match(floorFallback(30, 1), /reduced, credible scope at 30 USDT/);
  assert.match(floorFallback(30, 2), /must decline/);
  assert.equal(parseNegotiationRound("Treat this as negotiation round 2."), 2);
});

test("recognizes only the main OKX A2A runtime", () => {
  assert.equal(isFlussoA2ATurn({
    agentId: "main",
    sessionKey: "agent:main:okx-a2a:group:okx-xmtp:my=5782&to=6245&job=123",
    prompt: "hello"
  }), true);
  assert.equal(isFlussoA2ATurn({ agentId: "flusso", sessionKey: "agent:flusso:group:123", prompt: "hello" }), false);
  assert.equal(isFlussoA2ATurn({ agentId: "main", sessionKey: "agent:main:main", prompt: "Use the Flusso Content Engineering capability." }), false);
  assert.equal(isFlussoA2ATurn({ agentId: "crestodian", sessionKey: "agent:crestodian:group:123", prompt: "hello" }), false);
});
test("blocks every tool except sampling peer_send", () => {
  assert.equal(samplingToolBlock("flusso_marketplace", { action: "peer_send" }, true), null);
  assert.match(
    samplingToolBlock("flusso_marketplace", { action: "apply" }, true),
    /peer_send/
  );
  assert.match(
    samplingToolBlock("flusso_content_engine", { action: "quote" }, true),
    /peer_send/
  );
  assert.match(samplingToolBlock("exec", {}, true), /peer_send/);
  assert.equal(samplingToolBlock("flusso_content_engine", { action: "quote" }, false), null);
});

test("restricts the private engine to the main A2A runtime", () => {
  assert.equal(canUseFlussoPrivateTool({ agentId: "flusso", sessionKey: "tui:1" }), false);
  assert.equal(canUseFlussoPrivateTool({
    agentId: "main",
    sessionKey: "agent:main:okx-a2a:group:okx-xmtp:my=5782&to=6245&job=123"
  }), true);
  assert.equal(canUseFlussoPrivateTool({ agentId: "main", sessionKey: "agent:main:main" }), false);
  assert.equal(canUseFlussoPrivateTool({
    agentId: "crestodian",
    sessionKey: "agent:crestodian:okx-a2a:group:123"
  }), false);
});

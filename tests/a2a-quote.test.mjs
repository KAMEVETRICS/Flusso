import assert from 'node:assert/strict';
import test from 'node:test';
import { decideA2AQuote } from '../lib/a2a-quote.ts';

const policy = {
  floor: 30,
  target: 100,
  openingMarkupPercent: 15,
  maxAutonomousRounds: 2
};

test('first below-floor round counters at the floor', () => {
  const quote = decideA2AQuote(policy, { clientBudget: 20, round: 1 });
  assert.equal(quote.decision, 'counter');
  assert.equal(quote.offeredPrice, 30);
  assert.equal(quote.withinClientBudget, false);
});

test('second below-floor round declines', () => {
  const quote = decideA2AQuote(policy, { clientBudget: 20, round: 2 });
  assert.equal(quote.decision, 'decline');
  assert.equal(quote.offeredPrice, null);
});

test('budget above the floor quotes reduced scope', () => {
  const quote = decideA2AQuote(policy, { clientBudget: 50, round: 1 });
  assert.equal(quote.offeredPrice, 50);
  assert.equal(quote.requiresReducedScope, true);
});

test('uncapped quote opens above target', () => {
  const quote = decideA2AQuote(policy, { round: 1 });
  assert.equal(quote.offeredPrice, 115);
  assert.equal(quote.requiresReducedScope, false);
});

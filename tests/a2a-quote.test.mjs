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

test('unconfigured pricing stays negotiable and respects the supplied budget', () => {
  const quote = decideA2AQuote(
    {
      floor: null,
      target: null,
      openingMarkupPercent: 15,
      maxAutonomousRounds: 2
    },
    { clientBudget: 0.1, round: 1 }
  );
  assert.equal(quote.decision, 'quote');
  assert.equal(quote.offeredPrice, 0.1);
  assert.equal(quote.minimumPrice, null);
  assert.equal(quote.withinClientBudget, true);
});

test('an optional target can guide a quote without imposing a floor', () => {
  const quote = decideA2AQuote(
    {
      floor: null,
      target: 1,
      openingMarkupPercent: 15,
      maxAutonomousRounds: 2
    },
    { clientBudget: 0.5, round: 1 }
  );
  assert.equal(quote.offeredPrice, 0.5);
  assert.equal(quote.minimumPrice, null);
  assert.equal(quote.requiresReducedScope, true);
});

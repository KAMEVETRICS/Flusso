import assert from "node:assert/strict";
import test from "node:test";
import { campaignProductionScope } from "../lib/campaign-scope.ts";

test("produces one asset per day for a daily 21-day editorial series", () => {
  assert.deepEqual(
    campaignProductionScope({ durationDays: 21, postsPerWeek: 7 }),
    { campaignDays: 21, assetTarget: 21 }
  );
});

test("uses cadence to calculate the publishable asset count", () => {
  assert.deepEqual(
    campaignProductionScope({ durationDays: 30, postsPerWeek: 3 }),
    { campaignDays: 30, assetTarget: 13 }
  );
});

test("keeps a useful minimum without exceeding campaign days", () => {
  assert.deepEqual(
    campaignProductionScope({ durationDays: 7, postsPerWeek: 1 }),
    { campaignDays: 7, assetTarget: 5 }
  );
});

test("caps generation at the supported 30-day horizon", () => {
  assert.deepEqual(
    campaignProductionScope({ durationDays: 90, postsPerWeek: 20 }),
    { campaignDays: 30, assetTarget: 30 }
  );
});

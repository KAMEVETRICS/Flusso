import assert from "node:assert/strict";
import test from "node:test";
import { isRetiredBindingError } from "../lib/a2a-recovery-policy.ts";

test("retries only the exact retired Codex binding failure", () => {
  assert.equal(
    isRetiredBindingError("Codex binding generation was retired: session-key:flusso:abc"),
    true
  );
  assert.equal(isRetiredBindingError("The model timed out after a tool call."), false);
  assert.equal(isRetiredBindingError(null), false);
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  containsExactToken,
  parseCliJson,
  requireActiveClient,
  requireReadyResult
} from "../lib/a2a-runtime-readiness.mjs";

test("accepts ready setup and an active agent client", () => {
  assert.equal(requireReadyResult({ ok: true, state: "ready" }, "setup").ok, true);
  assert.deepEqual(
    requireActiveClient({ ok: true, payload: { agentCount: 1, activeClients: 1 } }),
    { agentCount: 1, activeClients: 1 }
  );
});

test("rejects a refresh without an active client", () => {
  assert.throws(
    () => requireActiveClient({ ok: true, payload: { agentCount: 1, activeClients: 0 } }),
    /no active communication clients/
  );
});

test("parses strict CLI JSON and finds the response probe token", () => {
  const payload = parseCliJson('{"result":{"text":"FLUSSO_A2A_READY"}}', "probe");
  assert.equal(containsExactToken(payload, "FLUSSO_A2A_READY"), true);
  assert.throws(() => parseCliJson("banner\n{}", "probe"), /invalid JSON/);
});

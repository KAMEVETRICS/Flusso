import assert from "node:assert/strict";
import test from "node:test";
import { buildEngineRequest } from "../lib/openclaw-engine-tool.mjs";

test("maps quote calls to the private quote endpoint", () => {
  assert.deepEqual(
    buildEngineRequest({
      action: "quote",
      payloadJson: '{"clientBudget":47.381,"round":1}'
    }),
    {
      method: "POST",
      path: "/api/internal/a2a/quote",
      body: { clientBudget: 47.381, round: 1 }
    }
  );
});

test("maps accepted jobs without exposing arbitrary paths", () => {
  assert.deepEqual(
    buildEngineRequest({
      action: "accept_job",
      jobId: "job/123",
      payloadJson: '{"event":"job_accepted","okxJobId":"okx-123"}'
    }),
    {
      method: "POST",
      path: "/api/internal/a2a/jobs/job%2F123/accepted",
      body: { event: "job_accepted", okxJobId: "okx-123" }
    }
  );
});

test("rejects unsupported exports", () => {
  assert.throws(
    () => buildEngineRequest({ action: "get_export", jobId: "job-1", format: "html" }),
    /supported export format/
  );
});

const actions = new Set([
  "service_policy",
  "quote",
  "create_job",
  "accept_job",
  "get_job",
  "get_result",
  "get_export"
]);
const exportFormats = new Set(["strategy", "calendar", "content-pack"]);

function payload(payloadJson) {
  if (!payloadJson) return undefined;
  const value = JSON.parse(payloadJson);
  if (!value || Array.isArray(value) || typeof value !== "object") {
    throw new Error("payloadJson must encode a JSON object.");
  }
  return value;
}

function requiredJobId(jobId) {
  const value = String(jobId ?? "").trim();
  if (!value) throw new Error("jobId is required for this action.");
  return encodeURIComponent(value);
}

export function buildEngineRequest(input) {
  if (!actions.has(input.action)) throw new Error("Unsupported Flusso engine action.");

  switch (input.action) {
    case "service_policy":
      return { method: "GET", path: "/api/internal/a2a/service" };
    case "quote":
      return { method: "POST", path: "/api/internal/a2a/quote", body: payload(input.payloadJson) };
    case "create_job":
      return { method: "POST", path: "/api/internal/a2a/jobs", body: payload(input.payloadJson) };
    case "accept_job":
      return {
        method: "POST",
        path: `/api/internal/a2a/jobs/${requiredJobId(input.jobId)}/accepted`,
        body: payload(input.payloadJson)
      };
    case "get_job":
      return { method: "GET", path: `/api/internal/a2a/jobs/${requiredJobId(input.jobId)}` };
    case "get_result":
      return { method: "GET", path: `/api/internal/a2a/jobs/${requiredJobId(input.jobId)}/result` };
    case "get_export": {
      if (!exportFormats.has(input.format)) throw new Error("A supported export format is required.");
      return {
        method: "GET",
        path: `/api/internal/a2a/jobs/${requiredJobId(input.jobId)}/result?format=${input.format}`
      };
    }
  }
}

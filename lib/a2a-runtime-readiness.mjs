export function parseCliJson(output, label) {
  const text = String(output ?? "").trim();
  if (!text) throw new Error(`${label} returned no JSON.`);

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label} returned invalid JSON.`);
  }
}

export function requireReadyResult(payload, label) {
  if (payload?.ok === true && (!payload.state || payload.state === "ready")) return payload;

  const detail = payload?.userMessage ?? payload?.detail ?? payload?.reason ?? "unknown failure";
  throw new Error(`${label} is not ready: ${detail}`);
}

export function requireActiveClient(payload) {
  requireReadyResult(payload, "OKX agent refresh");
  const agentCount = Number(payload?.payload?.agentCount);
  const activeClients = Number(payload?.payload?.activeClients);

  if (!Number.isInteger(agentCount) || agentCount < 1) {
    throw new Error("OKX agent refresh found no communication identities.");
  }
  if (!Number.isInteger(activeClients) || activeClients < 1) {
    throw new Error("OKX agent refresh found no active communication clients.");
  }

  return { agentCount, activeClients };
}

export function containsExactToken(value, token) {
  if (typeof value === "string") return value.trim() === token;
  if (Array.isArray(value)) return value.some((item) => containsExactToken(item, token));
  if (value && typeof value === "object") {
    return Object.values(value).some((item) => containsExactToken(item, token));
  }
  return false;
}

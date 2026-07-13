import { Buffer } from "node:buffer";
import { timingSafeEqual } from "node:crypto";
import process from "node:process";

function secureEqual(left: string, right: string) {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

export function authorizeInternalRequest(request: Request) {
  const configuredKey = process.env.A2A_INTERNAL_API_KEY?.trim();
  if (!configuredKey) {
    return Response.json(
      { error: "A2A_INTERNAL_API_KEY is not configured." },
      { status: 503 }
    );
  }

  const authorization = request.headers.get("authorization") ?? "";
  const presentedKey = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";

  if (!presentedKey || !secureEqual(presentedKey, configuredKey)) {
    return Response.json(
      { error: "Unauthorized." },
      {
        status: 401,
        headers: { "WWW-Authenticate": "Bearer" }
      }
    );
  }

  return null;
}
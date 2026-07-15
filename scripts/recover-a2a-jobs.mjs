/* global AbortSignal, console, fetch */
import process from "node:process";
import { URL } from "node:url";

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw Error(name + " is required.");
  return value;
}

const endpoint = new URL("/api/internal/a2a/jobs/recover", required("CONTENT_ENGINE_URL"));
const response = await fetch(endpoint, {
  method: "POST",
  headers: { Authorization: "Bearer " + required("A2A_INTERNAL_API_KEY") },
  signal: AbortSignal.timeout(10_000)
});
const payload = await response.json();

if (!response.ok) {
  throw Error("A2A recovery returned HTTP " + response.status + ": " + (payload.error ?? "unknown error"));
}

console.log(JSON.stringify(payload));

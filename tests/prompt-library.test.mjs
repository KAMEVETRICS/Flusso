import assert from "node:assert/strict";
import test from "node:test";
import { loadPromptLibrary, routePromptLibrary } from "../lib/prompt-library.ts";

const brief = {
  brand: "Arc House",
  industry: "stablecoin infrastructure",
  website: "",
  docs: "",
  goal: "Create a source-backed editorial campaign",
  audience: "financial application builders",
  competitors: [],
  platforms: ["Medium"],
  editorialProfile: "technical-authority",
  tone: "clear and analytical",
  durationDays: 21,
  postsPerWeek: 7,
  teamSize: 1,
  hoursPerWeek: 20,
  restrictions: ""
};

test("uses the bundled prompt library when no CSV is deployed", () => {
  const prompts = loadPromptLibrary();
  assert.ok(prompts.length >= 13);
  assert.equal(prompts[0].sourceFile, "builtin:flusso-core-v1");
});

test("routes every pipeline stage from the bundled prompt library", () => {
  const result = routePromptLibrary(brief);
  assert.equal(result.routes.length, 13);
  assert.equal(result.selections.length, 13);
  assert.equal(result.summary.loaded, true);
  assert.equal(result.summary.sourceFile, "builtin:flusso-core-v1");
});

import assert from "node:assert/strict";
import test from "node:test";

import { buildStrategyMarkdown, sourceLinksForAsset } from "../lib/exports.ts";

const asset = {
  id: "asset-1",
  type: "article",
  platform: "Medium",
  title: "A sourced article",
  copy: "",
  cta: "Read more",
  linkedClaims: [],
  calendarItemId: "calendar-1",
  seriesId: "",
  segment: "",
  territory: "",
  hookId: "",
  editorialMode: "technical-explainer",
  contentFormat: "article",
  threadPosts: [],
  article: {
    subtitle: "A practical subtitle",
    introduction: "Introduction.",
    sections: [{ heading: "Section", body: "Body." }],
    conclusion: "Conclusion.",
    tags: ["source-backed"]
  },
  visualBriefId: ""
};

const pack = {
  brief: {
    brand: "Arc House",
    industry: "Web3",
    goal: "Publish a sourced campaign",
    audience: "Builders",
    platforms: ["Medium"],
    tone: "Clear",
    editorialProfile: "technical-authority",
    durationDays: 21,
    postsPerWeek: 7
  },
  performanceContext: {
    recordCount: 0
  },
  brandContext: {
    positioning: "Independent builder education",
    voice: [],
    contentGoals: []
  },
  contentLandscape: {
    summary: "",
    opportunityGaps: []
  },
  audienceSegments: [],
  territories: [],
  hooks: [],
  contentSeries: [],
  platformAdaptations: [],
  editorialReport: {
    score: 90,
    passed: true,
    rewriteSummary: ""
  },
  editorialMix: [],
  assets: [asset],
  calendar: [{
    id: "calendar-1",
    day: 1,
    platform: "Medium",
    format: "article",
    audienceSegment: "Builders",
    hook: "Hook",
    sourcePack: ["source-1", "source-without-url"],
    goal: "Educate",
    territory: "Infrastructure",
    series: "",
    episode: "",
    hookId: "",
    platformFitReason: "",
    cta: "Read more",
    productionTaskId: ""
  }],
  sources: [{
    id: "source-1",
    title: "Primary documentation",
    url: "https://example.com/docs",
    sourceType: "primary-doc",
    extractedText: "Documentation",
    fetchedAt: "2026-07-19T00:00:00.000Z",
    fetchStatus: "fetched",
    wordCount: 1,
    sourceQuality: "strong"
  }, {
    id: "source-without-url",
    title: "Internal note",
    sourceType: "user-note",
    extractedText: "Note",
    fetchedAt: "2026-07-19T00:00:00.000Z",
    fetchStatus: "fetched",
    wordCount: 1,
    sourceQuality: "limited"
  }],
  visualBriefs: [],
  proofReport: {
    checkedClaims: 0,
    supported: 0,
    unsupported: 0,
    conflicts: 0,
    timeSensitive: 0,
    claims: []
  },
  productionPlan: {
    totalHours: "4 hours",
    overloadRisk: "low",
    capacitySummary: "Within capacity",
    steps: []
  },
  generation: {
    generatedAt: "2026-07-19T00:00:00.000Z",
    provider: "openai",
    model: "test"
  },
  generationStages: [],
  promptRoutes: []
};

test("resolves public source links for an asset from its calendar entry", () => {
  assert.deepEqual(sourceLinksForAsset(pack, asset), [{
    id: "source-1",
    title: "Primary documentation",
    url: "https://example.com/docs"
  }]);
});

test("adds human-visible source links to each publish-ready asset", () => {
  const markdown = buildStrategyMarkdown(pack);
  assert.match(markdown, /#### Sources/);
  assert.match(markdown, /\[Primary documentation\]\(https:\/\/example\.com\/docs\)/);
  assert.doesNotMatch(markdown, /Internal note/);
});

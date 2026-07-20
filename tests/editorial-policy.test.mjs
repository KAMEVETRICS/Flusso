import assert from "node:assert/strict";
import test from "node:test";
import { inspectEditorialAssets } from "../lib/editorial-policy.ts";

const brief = {
  platforms: ["Medium"]
};

function articleAsset(wordsPerSection) {
  const body = Array.from({ length: wordsPerSection }, (_, index) => `word${index}`).join(" ");
  return {
    id: "asset-1",
    type: "article",
    platform: "Medium",
    title: "A specific technical article",
    copy: "A concise summary.",
    cta: "Review the implementation.",
    linkedClaims: [],
    calendarItemId: "cal-1",
    seriesId: "series-1",
    segment: "builders",
    territory: "infrastructure",
    hookId: "hook-1",
    editorialMode: "technical-explainer",
    contentFormat: "article",
    threadPosts: [],
    article: {
      subtitle: "A practical architecture review",
      introduction: body,
      sections: [
        { heading: "Mechanism", body },
        { heading: "Tradeoffs", body },
        { heading: "Operations", body }
      ],
      conclusion: body,
      tags: ["architecture"]
    },
    visualBriefId: ""
  };
}

test("rejects structurally complete but shallow articles", () => {
  const issues = inspectEditorialAssets([articleAsset(20)], brief);
  assert.ok(issues.some((issue) => issue.code === "article-depth"));
});

test("accepts developed articles of at least 300 words", () => {
  const issues = inspectEditorialAssets([articleAsset(70)], brief);
  assert.equal(issues.some((issue) => issue.code === "article-depth"), false);
});

import {
  PerformanceContextSchema,
  type PerformanceContext,
  type PerformancePattern,
  type PerformanceRecord
} from "./schemas";

function rate(numerator: number, denominator: number) {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 10000) / 100;
}

function total(records: PerformanceRecord[], key: "impressions" | "views" | "engagements" | "clicks" | "conversions" | "watchTimeSeconds") {
  return records.reduce((sum, record) => sum + record[key], 0);
}

function patternsFor(
  records: PerformanceRecord[],
  keyFor: (record: PerformanceRecord) => string,
  labelFor: (record: PerformanceRecord) => string
): PerformancePattern[] {
  const groups = new Map<string, { label: string; records: PerformanceRecord[] }>();

  for (const record of records) {
    const key = keyFor(record).trim();
    if (!key) continue;
    const current = groups.get(key) ?? { label: labelFor(record), records: [] };
    current.records.push(record);
    groups.set(key, current);
  }

  return Array.from(groups, ([key, group]) => {
    const impressions = total(group.records, "impressions");
    const engagements = total(group.records, "engagements");
    const clicks = total(group.records, "clicks");
    const conversions = total(group.records, "conversions");
    return {
      key,
      label: group.label,
      records: group.records.length,
      impressions,
      engagements,
      clicks,
      conversions,
      engagementRate: rate(engagements, impressions),
      clickThroughRate: rate(clicks, impressions),
      conversionRate: rate(conversions, clicks)
    };
  }).sort(
    (left, right) =>
      right.engagementRate - left.engagementRate ||
      right.clickThroughRate - left.clickThroughRate ||
      right.conversions - left.conversions ||
      right.impressions - left.impressions
  );
}

export function emptyPerformanceContext(brand: string): PerformanceContext {
  return {
    brand,
    recordCount: 0,
    campaignCount: 0,
    totals: {
      impressions: 0,
      views: 0,
      engagements: 0,
      clicks: 0,
      conversions: 0,
      watchTimeSeconds: 0
    },
    rates: {
      viewRate: 0,
      engagementRate: 0,
      clickThroughRate: 0,
      conversionRate: 0,
      averageWatchTimeSeconds: 0
    },
    topAssets: [],
    platformPatterns: [],
    hookPatterns: [],
    territoryPatterns: [],
    learnings: []
  };
}

export function summarizePerformance(records: PerformanceRecord[], brand: string): PerformanceContext {
  if (!records.length) return emptyPerformanceContext(brand);

  const impressions = total(records, "impressions");
  const views = total(records, "views");
  const engagements = total(records, "engagements");
  const clicks = total(records, "clicks");
  const conversions = total(records, "conversions");
  const watchTimeSeconds = total(records, "watchTimeSeconds");
  const platformPatterns = patternsFor(records, (record) => record.platform, (record) => record.platform);
  const hookPatterns = patternsFor(records, (record) => record.hookId, (record) => record.hookId);
  const territoryPatterns = patternsFor(records, (record) => record.territory, (record) => record.territory);
  const topAssets = records
    .map((record) => ({
      assetId: record.assetId,
      title: record.assetTitle,
      platform: record.platform,
      hookId: record.hookId,
      territory: record.territory,
      impressions: record.impressions,
      engagementRate: rate(record.engagements, record.impressions),
      clickThroughRate: rate(record.clicks, record.impressions),
      conversions: record.conversions
    }))
    .sort(
      (left, right) =>
        right.engagementRate - left.engagementRate ||
        right.clickThroughRate - left.clickThroughRate ||
        right.conversions - left.conversions ||
        right.impressions - left.impressions
    )
    .slice(0, 5);

  const learnings: string[] = [];
  const topPlatform = platformPatterns[0];
  const topHook = hookPatterns[0];
  const topTerritory = territoryPatterns[0];
  if (topPlatform) {
    learnings.push(
      topPlatform.label + " has the strongest observed engagement rate at " +
      topPlatform.engagementRate.toFixed(2) + "% across " + topPlatform.records + " recorded asset(s)."
    );
  }
  if (topHook) {
    learnings.push(
      topHook.label + " is the strongest observed hook at " +
      topHook.engagementRate.toFixed(2) + "% engagement."
    );
  }
  if (topTerritory) {
    learnings.push(
      topTerritory.label + " is the strongest observed territory at " +
      topTerritory.clickThroughRate.toFixed(2) + "% click-through."
    );
  }

  return PerformanceContextSchema.parse({
    brand,
    recordCount: records.length,
    campaignCount: new Set(records.map((record) => record.campaignId)).size,
    totals: { impressions, views, engagements, clicks, conversions, watchTimeSeconds },
    rates: {
      viewRate: rate(views, impressions),
      engagementRate: rate(engagements, impressions),
      clickThroughRate: rate(clicks, impressions),
      conversionRate: rate(conversions, clicks),
      averageWatchTimeSeconds: views ? Math.round((watchTimeSeconds / views) * 100) / 100 : 0
    },
    topAssets,
    platformPatterns,
    hookPatterns,
    territoryPatterns,
    learnings
  });
}
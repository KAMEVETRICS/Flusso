import type { ProjectBrief } from "./schemas";

const MAX_GENERATION_DAYS = 30;
const MIN_PUBLISHABLE_ASSETS = 5;

export type CampaignProductionScope = {
  campaignDays: number;
  assetTarget: number;
};

export function campaignProductionScope(
  brief: Pick<ProjectBrief, "durationDays" | "postsPerWeek">
): CampaignProductionScope {
  const campaignDays = Math.min(brief.durationDays, MAX_GENERATION_DAYS);
  const cadenceTarget = Math.ceil((campaignDays * brief.postsPerWeek) / 7);

  return {
    campaignDays,
    assetTarget: Math.min(
      campaignDays,
      Math.max(MIN_PUBLISHABLE_ASSETS, cadenceTarget)
    )
  };
}

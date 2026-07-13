import {
  claimAcceptedA2AJob,
  completeA2AJob,
  failA2AJob,
  recordA2AJobStage
} from "./a2a-jobs";
import { saveCampaign } from "./campaign-store";
import { getPerformanceContextForBrand } from "./performance-store";
import { createContentGenerationProvider } from "./provider";
import { routePromptLibrary } from "./prompt-library";

const activeJobs = new Set<string>();

async function runA2AJob(id: string) {
  try {
    const job = await claimAcceptedA2AJob(id);
    if (!job) return;

    const promptRouting = routePromptLibrary(job.brief);
    const performanceContext = await getPerformanceContextForBrand(job.brief.brand);
    const provider = createContentGenerationProvider();
    const pack = await provider.generateCampaignPack(
      job.brief,
      promptRouting,
      performanceContext,
      (stage) => recordA2AJobStage(id, stage)
    );
    const campaign = await saveCampaign(pack);
    await completeA2AJob(id, campaign.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "A2A content generation failed.";
    try {
      await failA2AJob(id, message);
    } catch {
      // The job remains recoverable in its last persisted state if the database is unavailable.
    }
  }
}

export function enqueueA2AJob(id: string) {
  if (activeJobs.has(id)) return false;
  activeJobs.add(id);
  void runA2AJob(id).finally(() => activeJobs.delete(id));
  return true;
}
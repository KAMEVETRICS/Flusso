import { getA2AJob } from "@/lib/a2a-jobs";
import { getCampaign } from "@/lib/campaign-store";
import {
  buildCampaignExport,
  type CampaignExportFormat
} from "@/lib/exports";
import { authorizeInternalRequest } from "@/lib/internal-auth";

const formats = new Set<CampaignExportFormat>(["strategy", "calendar", "content-pack"]);

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const unauthorized = authorizeInternalRequest(request);
  if (unauthorized) return unauthorized;

  try {
    const { id } = await context.params;
    const job = await getA2AJob(id);
    if (!job) return Response.json({ error: "A2A job not found." }, { status: 404 });
    if (job.status !== "completed" || !job.campaignId) {
      return Response.json(
        { error: "A2A result is not ready.", status: job.status },
        { status: 409 }
      );
    }

    const campaign = await getCampaign(job.campaignId);
    if (!campaign) return Response.json({ error: "Campaign result not found." }, { status: 404 });

    const requestedFormat = new URL(request.url).searchParams.get("format");
    if (requestedFormat) {
      if (!formats.has(requestedFormat as CampaignExportFormat)) {
        return Response.json({ error: "Unsupported result format." }, { status: 404 });
      }
      const artifact = buildCampaignExport(
        campaign.pack,
        requestedFormat as CampaignExportFormat
      );
      return new Response(artifact.content, {
        headers: {
          "Content-Type": artifact.contentType,
          "Content-Disposition": 'attachment; filename="' + artifact.filename + '"',
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff"
        }
      });
    }

    const basePath = "/api/internal/a2a/jobs/" + id + "/result?format=";
    return Response.json({
      job,
      campaign: campaign.summary,
      quality: campaign.pack.editorialReport,
      proof: {
        checkedClaims: campaign.pack.proofReport.checkedClaims,
        supported: campaign.pack.proofReport.supported,
        unsupported: campaign.pack.proofReport.unsupported,
        conflicts: campaign.pack.proofReport.conflicts,
        timeSensitive: campaign.pack.proofReport.timeSensitive
      },
      deliverables: [
        { format: "strategy", path: basePath + "strategy" },
        { format: "calendar", path: basePath + "calendar" },
        { format: "content-pack", path: basePath + "content-pack" }
      ]
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load A2A result.";
    return Response.json({ error: message }, { status: 503 });
  }
}
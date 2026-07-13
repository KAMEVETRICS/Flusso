import { NextResponse } from "next/server";
import { getCampaign } from "@/lib/campaign-store";
import {
  buildCampaignExport,
  type CampaignExportFormat
} from "@/lib/exports";

const supportedFormats = new Set<CampaignExportFormat>([
  "strategy",
  "calendar",
  "content-pack"
]);

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; format: string }> }
) {
  try {
    const { id, format } = await context.params;
    if (!supportedFormats.has(format as CampaignExportFormat)) {
      return NextResponse.json({ error: "Unsupported export format." }, { status: 404 });
    }

    const campaign = await getCampaign(id);
    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
    }

    const artifact = buildCampaignExport(
      campaign.pack,
      format as CampaignExportFormat
    );

    return new Response(artifact.content, {
      headers: {
        "Content-Type": artifact.contentType,
        "Content-Disposition": 'attachment; filename="' + artifact.filename + '"',
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to export campaign.";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
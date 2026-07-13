import { NextResponse } from "next/server";
import { getCampaign } from "@/lib/campaign-store";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const campaign = await getCampaign(id);
    if (!campaign) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
    return NextResponse.json(campaign);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load campaign.";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}

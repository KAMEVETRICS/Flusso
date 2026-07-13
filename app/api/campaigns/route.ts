import { NextResponse } from "next/server";
import { listCampaigns } from "@/lib/campaign-store";

export async function GET() {
  try {
    const campaigns = await listCampaigns();
    return NextResponse.json({ campaigns });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load campaign history.";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}

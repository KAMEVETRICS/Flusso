import { ensureCampaignSchema, getDatabase } from "./db";

type VisualRow = {
  campaign_id: string;
  visual_brief_id: string;
  asset_id: string;
  mime_type: string;
  image_base64: string;
  model: string;
  created_at: string | Date;
  updated_at: string | Date;
};

export type PersistedVisual = {
  campaignId: string;
  visualBriefId: string;
  assetId: string;
  mimeType: string;
  imageBase64: string;
  model: string;
  createdAt: string;
  updatedAt: string;
};

function toVisual(row: VisualRow): PersistedVisual {
  return {
    campaignId: row.campaign_id,
    visualBriefId: row.visual_brief_id,
    assetId: row.asset_id,
    mimeType: row.mime_type,
    imageBase64: row.image_base64,
    model: row.model,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString()
  };
}

export async function getCampaignVisual(campaignId: string, visualBriefId: string) {
  await ensureCampaignSchema();
  const sql = getDatabase();
  const rows = await sql`
    SELECT campaign_id, visual_brief_id, asset_id, mime_type, image_base64, model, created_at, updated_at
    FROM campaign_visual_assets
    WHERE campaign_id = ${campaignId} AND visual_brief_id = ${visualBriefId}
    LIMIT 1
  ` as VisualRow[];
  return rows[0] ? toVisual(rows[0]) : null;
}

export async function saveCampaignVisual(input: {
  campaignId: string;
  visualBriefId: string;
  assetId: string;
  mimeType: string;
  imageBase64: string;
  model: string;
}) {
  await ensureCampaignSchema();
  const sql = getDatabase();
  const rows = await sql`
    INSERT INTO campaign_visual_assets (
      campaign_id, visual_brief_id, asset_id, mime_type, image_base64, model
    ) VALUES (
      ${input.campaignId}, ${input.visualBriefId}, ${input.assetId},
      ${input.mimeType}, ${input.imageBase64}, ${input.model}
    )
    ON CONFLICT (campaign_id, visual_brief_id) DO UPDATE SET
      asset_id = EXCLUDED.asset_id,
      mime_type = EXCLUDED.mime_type,
      image_base64 = EXCLUDED.image_base64,
      model = EXCLUDED.model,
      updated_at = now()
    RETURNING campaign_id, visual_brief_id, asset_id, mime_type, image_base64, model, created_at, updated_at
  ` as VisualRow[];
  if (!rows[0]) throw new Error("Visual save returned no database row.");
  return toVisual(rows[0]);
}
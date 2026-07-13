import { normalizeBrief } from "@/lib/brief";
import { saveCampaign } from "@/lib/campaign-store";
import { ensureCampaignSchema } from "@/lib/db";
import { createContentGenerationProvider } from "@/lib/provider";
import { getPerformanceContextForBrand } from "@/lib/performance-store";
import { routePromptLibrary } from "@/lib/prompt-library";

export const maxDuration = 300;

function encodeEvent(event: string, data: unknown) {
  return new TextEncoder().encode("event: " + event + "\ndata: " + JSON.stringify(data) + "\n\n");
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const brief = normalizeBrief(body);
    const promptRouting = routePromptLibrary(brief);
    const provider = createContentGenerationProvider();
    let cancelled = false;

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const send = (event: string, data: unknown) => {
          if (cancelled) return;
          try {
            controller.enqueue(encodeEvent(event, data));
          } catch {
            cancelled = true;
          }
        };

        send("ready", { stages: ["foundation", "architecture", "execution", "editorial", "governance"] });

        void (async () => {
          try {
            await ensureCampaignSchema();
            const performanceContext = await getPerformanceContextForBrand(brief.brand);
            const pack = await provider.generateCampaignPack(
              brief,
              promptRouting,
              performanceContext,
              (stage) => send("stage", stage)
            );
            const campaign = await saveCampaign(pack);
            send("complete", { pack, campaignId: campaign.id });
          } catch (error) {
            const message = error instanceof Error ? error.message : "Unable to generate campaign pack.";
            send("error", { message });
          } finally {
            if (!cancelled) controller.close();
          }
        })();
      },
      cancel() {
        cancelled = true;
      }
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no"
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to generate campaign pack.";
    return Response.json({ error: message }, { status: 500 });
  }
}
import { CreateA2AJobSchema, createA2AJob } from "@/lib/a2a-jobs";
import { getContentEngineeringService } from "@/lib/a2a-service";
import { authorizeInternalRequest } from "@/lib/internal-auth";

export async function POST(request: Request) {
  const unauthorized = authorizeInternalRequest(request);
  if (unauthorized) return unauthorized;

  try {
    const parsed = CreateA2AJobSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid negotiated job.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const service = getContentEngineeringService();
    const floor = service.negotiation.floor;
    if (floor !== null && parsed.data.agreement.price < floor) {
      return Response.json(
        { error: "Agreed price is below the configured Content Engineering floor." },
        { status: 409 }
      );
    }

    const result = await createA2AJob(parsed.data);
    if (
      !result.created &&
      (
        result.job.requesterAgentId !== parsed.data.requesterAgentId ||
        JSON.stringify(result.job.brief) !== JSON.stringify(parsed.data.brief) ||
        JSON.stringify(result.job.agreement) !== JSON.stringify(parsed.data.agreement)
      )
    ) {
      return Response.json(
        { error: "This OKX job ID already exists with different negotiated terms." },
        { status: 409 }
      );
    }

    return Response.json(result, { status: result.created ? 201 : 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create A2A job.";
    return Response.json({ error: message }, { status: 503 });
  }
}
import { A2AQuoteRequestSchema, decideA2AQuote } from "@/lib/a2a-quote";
import { getContentEngineeringService } from "@/lib/a2a-service";
import { authorizeInternalRequest } from "@/lib/internal-auth";

export async function POST(request: Request) {
  const unauthorized = authorizeInternalRequest(request);
  if (unauthorized) return unauthorized;

  try {
    const parsed = A2AQuoteRequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid quote request.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const service = getContentEngineeringService();
    return Response.json({ quote: decideA2AQuote(service.negotiation, parsed.data) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to prepare an A2A quote.";
    return Response.json({ error: message }, { status: 503 });
  }
}

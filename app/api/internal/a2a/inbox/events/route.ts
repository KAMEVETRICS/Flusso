import {
  A2AInboxEventSchema,
  A2AInboxRecoveryReportSchema,
  claimRecoverableA2AInboxTurns,
  recordA2AInboxEvent,
  reportA2AInboxRecovery
} from "@/lib/a2a-inbox";
import { authorizeInternalRequest } from "@/lib/internal-auth";

export async function POST(request: Request) {
  const unauthorized = authorizeInternalRequest(request);
  if (unauthorized) return unauthorized;

  try {
    const input = A2AInboxEventSchema.parse(await request.json());
    await recordA2AInboxEvent(input);
    return Response.json({ recorded: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to persist the A2A turn.";
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const unauthorized = authorizeInternalRequest(request);
  if (unauthorized) return unauthorized;

  try {
    const input = A2AInboxRecoveryReportSchema.parse(await request.json());
    await reportA2AInboxRecovery(input);
    return Response.json({ recorded: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to record the A2A replay result.";
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function PUT(request: Request) {
  const unauthorized = authorizeInternalRequest(request);
  if (unauthorized) return unauthorized;

  try {
    return Response.json({ turns: await claimRecoverableA2AInboxTurns() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to claim recoverable A2A turns.";
    return Response.json({ error: message }, { status: 503 });
  }
}

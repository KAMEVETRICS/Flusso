import { getContentEngineeringService } from "@/lib/a2a-service";
import { authorizeInternalRequest } from "@/lib/internal-auth";

export function GET(request: Request) {
  const unauthorized = authorizeInternalRequest(request);
  if (unauthorized) return unauthorized;

  try {
    return Response.json({ service: getContentEngineeringService() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load A2A service policy.";
    return Response.json({ error: message }, { status: 503 });
  }
}
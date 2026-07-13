import { getA2AJob } from "@/lib/a2a-jobs";
import { authorizeInternalRequest } from "@/lib/internal-auth";

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
    return Response.json({ job });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load A2A job.";
    return Response.json({ error: message }, { status: 503 });
  }
}
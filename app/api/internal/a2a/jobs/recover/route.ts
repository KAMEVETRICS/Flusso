import { recoverA2AJobs } from "@/lib/a2a-job-runner";
import { authorizeInternalRequest } from "@/lib/internal-auth";

export async function POST(request: Request) {
  const unauthorized = authorizeInternalRequest(request);
  if (unauthorized) return unauthorized;

  try {
    return Response.json({ recovery: await recoverA2AJobs() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to recover A2A jobs.";
    return Response.json({ error: message }, { status: 503 });
  }
}

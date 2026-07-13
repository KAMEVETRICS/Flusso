import { enqueueA2AJob } from "@/lib/a2a-job-runner";
import { AcceptA2AJobSchema, acceptA2AJob, getA2AJob } from "@/lib/a2a-jobs";
import { authorizeInternalRequest } from "@/lib/internal-auth";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const unauthorized = authorizeInternalRequest(request);
  if (unauthorized) return unauthorized;

  try {
    const parsed = AcceptA2AJobSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json(
        { error: "A matching job_accepted event is required.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { id } = await context.params;
    const job = await acceptA2AJob(id, parsed.data.okxJobId);
    if (!job || job.okxJobId !== parsed.data.okxJobId) {
      return Response.json({ error: "A2A job not found." }, { status: 404 });
    }
    if (job.status === "failed") {
      return Response.json({ error: "Failed jobs require an explicit retry decision." }, { status: 409 });
    }

    const enqueued = job.status === "accepted" ? enqueueA2AJob(id) : false;
    const current = await getA2AJob(id);
    return Response.json({ job: current ?? job, enqueued });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to accept A2A job.";
    return Response.json({ error: message }, { status: 503 });
  }
}
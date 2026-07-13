import { ProjectBriefSchema, type ProjectBrief } from "./schemas";

export const emptyBrief: ProjectBrief = {
  brand: "",
  industry: "",
  website: "",
  docs: "",
  goal: "",
  audience: "",
  competitors: [],
  platforms: ["X", "LinkedIn"],
  tone: "",
  editorialProfile: "balanced",
  durationDays: 30,
  postsPerWeek: 5,
  teamSize: 1,
  hoursPerWeek: 8,
  restrictions: ""
};

export function normalizeBrief(input: unknown): ProjectBrief {
  const record = typeof input === "object" && input ? { ...(input as Record<string, unknown>) } : {};

  if (typeof record.competitors === "string") {
    record.competitors = record.competitors.split(",").map((item) => item.trim()).filter(Boolean);
  }
  if (typeof record.platforms === "string") {
    record.platforms = record.platforms.split(",").map((item) => item.trim()).filter(Boolean);
  }

  return ProjectBriefSchema.parse(record);
}

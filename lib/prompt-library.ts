import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import type { ProjectBrief, PromptModule } from "./schemas";

export type PromptLibraryItem = {
  id: string;
  name: string;
  libraryStage: string;
  useCase: string;
  prompt: string;
  tags: string[];
  sourceFile: string;
};

export type PromptRoute = {
  pipelineStage: string;
  selectedPromptId: string;
  selectedPromptName: string;
  libraryStage: string;
  matchScore: number;
  reason: string;
  tags: string[];
  promptPreview: string;
};

export type PromptLibrarySummary = {
  loaded: boolean;
  sourceFile: string;
  totalPrompts: number;
  routedStages: number;
  routerVersion: string;
};

export type PromptSelection = {
  route: PromptRoute;
  prompt: PromptLibraryItem;
};

export type PromptRoutingResult = {
  summary: PromptLibrarySummary;
  routes: PromptRoute[];
  selections: PromptSelection[];
};

type RouteProfile = {
  stage: string;
  preferredLibraryStages: string[];
  keywords: string[];
  preferredNames?: string[];
};

const routerVersion = "csv-keyword-router-v1";
const builtinSource = "builtin:flusso-core-v1";

const builtinPromptRows = [
  [
    "Competitive Content Analysis & Mood Board Creator",
    "IDEATION",
    "Map the current content landscape and identify defensible gaps.",
    "Separate repeated market narratives from under-served audience questions. Ground every observation in supplied evidence, name the consequence for the campaign, and turn useful gaps into concrete editorial territories."
  ],
  [
    "Audience Micro-Segment Content Mapper",
    "IDEATION",
    "Turn a broad audience into operational messaging segments.",
    "Define segments by decision context, awareness, needs, objections, proof requirements, taboo topics, preferred formats, cadence, and platform. Avoid demographic invention; use the brief and evidence only."
  ],
  [
    "Content Series Architecture Builder",
    "IDEATION",
    "Design a connected campaign without repetitive posts.",
    "Build series around distinct reader questions and progressive episodes. Give every episode a unique job, source basis, hook, audience, and CTA while preserving a coherent campaign thesis."
  ],
  [
    "Multi-Variant Hook Generator",
    "IDEATION",
    "Create specific hooks tied to evidence and reader intent.",
    "Generate materially different hooks using mechanisms, consequences, constraints, comparisons, or practical decisions. Reject generic hype, unsupported certainty, and cosmetic punctuation variants."
  ],
  [
    "Trend-Responsive Content Ideator",
    "IDEATION",
    "Connect timely source material to durable brand relevance.",
    "Use supplied dates and evidence to distinguish current facts, emerging signals, and durable principles. Flag anything likely to change and never manufacture cultural relevance."
  ],
  [
    "Competitive Intelligence Integration System",
    "OPTIMIZATION",
    "Use competitor evidence to sharpen positioning.",
    "Describe observable competitor patterns without guessing intent. Identify saturated claims, proof gaps, format gaps, and opportunities the brand can credibly own."
  ],
  [
    "Multi-Channel Campaign Orchestrator",
    "DISTRIBUTION",
    "Convert campaign architecture into a capacity-aware calendar.",
    "Assign each calendar item a distinct purpose, audience, source pack, platform-fit reason, CTA, and production dependency. Match the requested cadence and do not confuse scheduled ideas with completed assets."
  ],
  [
    "Platform-Specific Content Optimizer",
    "DISTRIBUTION",
    "Adapt assets to selected platforms without diluting substance.",
    "Preserve the factual thesis while changing structure, pacing, depth, CTA, and formatting for the selected platform. Never add a platform that is absent from the brief."
  ],
  [
    "Multi-Format Content Atomization Engine",
    "CREATION",
    "Produce complete platform-native assets from approved calendar items.",
    "Write every requested deliverable in full. Preserve calendar and evidence lineage, keep each asset materially distinct, and use the appropriate complete structure for posts, threads, newsletters, community posts, and articles."
  ],
  [
    "AI-to-Human Content Refinement System",
    "CREATION",
    "Rewrite drafts into specific, natural, publish-ready editorial work.",
    "Remove generic openings, repetitive contrasts, empty hype, summary-only conclusions, and artificial profundity. Add concrete mechanisms, constraints, transitions, rhythm, and a proportionate CTA without inventing facts."
  ],
  [
    "Product-Accurate Visual Brief Generator",
    "CREATION",
    "Plan visuals that improve comprehension without adding claims.",
    "Choose a visual only when it clarifies a mechanism, workflow, comparison, or verified dataset. Tie every factual visual element to supplied source IDs and avoid dense generated text."
  ],
  [
    "Performance Pattern Recognition Analyzer",
    "OPTIMIZATION",
    "Extract reusable mechanisms from measured performance.",
    "Treat historical metrics as observational. Identify the mechanism, format, platform, audience, and territory associated with performance, but do not claim causation or guarantee a repeat."
  ],
  [
    "Content Iteration Engine",
    "OPTIMIZATION",
    "Turn measured learnings into controlled editorial variations.",
    "Preserve the winning mechanism while producing materially new language, structure, evidence, and angle. Define what changes, what remains controlled, and what result should be measured."
  ]
] as const;

const routeProfiles: RouteProfile[] = [
  {
    stage: "Context Ingestion",
    preferredLibraryStages: ["IDEATION"],
    keywords: ["research", "brand", "context", "mood board", "market", "foundation"],
    preferredNames: ["Competitive Content Analysis & Mood Board Creator"]
  },
  {
    stage: "Competitive Gap Analysis",
    preferredLibraryStages: ["IDEATION", "OPTIMIZATION"],
    keywords: ["competitive", "competitor", "market", "gap", "intelligence", "opportunities"],
    preferredNames: ["Competitive Intelligence Integration System", "Competitive Content Analysis & Mood Board Creator"]
  },
  {
    stage: "Audience Segmentation",
    preferredLibraryStages: ["IDEATION"],
    keywords: ["audience", "segment", "micro", "targeted", "personalized", "messaging"],
    preferredNames: ["Audience Micro-Segment Content Mapper"]
  },
  {
    stage: "Content Territories",
    preferredLibraryStages: ["IDEATION"],
    keywords: ["content pillars", "theme", "themes", "series", "campaign", "narrative", "territory"],
    preferredNames: ["Content Series Architecture Builder", "Trend-Responsive Content Ideator"]
  },
  {
    stage: "Hook Engineering",
    preferredLibraryStages: ["IDEATION"],
    keywords: ["hook", "hooks", "angle", "variations", "emotional", "trigger", "scroll-stopper"],
    preferredNames: ["Multi-Variant Hook Generator"]
  },
  {
    stage: "Campaign Architecture",
    preferredLibraryStages: ["IDEATION", "DISTRIBUTION"],
    keywords: ["series", "campaign", "orchestrator", "multi-channel", "narrative", "touchpoints"],
    preferredNames: ["Content Series Architecture Builder", "Multi-Channel Campaign Orchestrator"]
  },
  {
    stage: "Calendar Engineering",
    preferredLibraryStages: ["DISTRIBUTION"],
    keywords: ["distribution", "platform", "calendar", "cadence", "multi-channel", "timing", "optimize"],
    preferredNames: ["Multi-Channel Campaign Orchestrator", "Platform-Specific Content Optimizer"]
  },
  {
    stage: "Content Production",
    preferredLibraryStages: ["CREATION"],
    keywords: ["draft", "content", "atomization", "format", "copy", "visual", "refinement", "human"],
    preferredNames: ["Multi-Format Content Atomization Engine", "AI-to-Human Content Refinement System"]
  },
  {
    stage: "Editorial Quality",
    preferredLibraryStages: ["CREATION", "OPTIMIZATION"],
    keywords: ["refinement", "human", "specific", "voice", "rewrite", "editorial", "quality"],
    preferredNames: ["AI-to-Human Content Refinement System"]
  },
  {
    stage: "Visual Planning",
    preferredLibraryStages: ["CREATION"],
    keywords: ["visual", "brief", "accurate", "product", "diagram", "illustration"],
    preferredNames: ["Product-Accurate Visual Brief Generator"]
  },
  {
    stage: "Fact Verification",
    preferredLibraryStages: ["CREATION", "OPTIMIZATION"],
    keywords: ["accurate", "accuracy", "brand consistency", "proof", "claims", "risk", "quality"],
    preferredNames: ["Product-Accurate Visual Brief Generator", "AI-to-Human Content Refinement System"]
  },
  {
    stage: "Performance Optimization",
    preferredLibraryStages: ["OPTIMIZATION"],
    keywords: ["performance", "pattern", "iteration", "winning", "underperforming", "metrics", "learning"],
    preferredNames: ["Performance Pattern Recognition Analyzer", "Content Iteration Engine"]
  },
  {
    stage: "Delivery Pack",
    preferredLibraryStages: ["DISTRIBUTION", "OPTIMIZATION"],
    keywords: ["platform", "optimizer", "multi-format", "performance", "package", "business outcomes", "distribution"],
    preferredNames: ["Platform-Specific Content Optimizer", "Multi-Format Content Atomization Engine"]
  }
];


function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "prompt";
}

function parseCsv(value: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    const next = value[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function promptTags(prompt: Pick<PromptLibraryItem, "name" | "libraryStage" | "useCase" | "prompt">) {
  const haystack = `${prompt.name} ${prompt.libraryStage} ${prompt.useCase} ${prompt.prompt.slice(0, 1800)}`.toLowerCase();
  const tags = new Set<string>([prompt.libraryStage.toLowerCase()]);
  const keywordGroups: Array<[string, string[]]> = [
    ["competitive", ["competitive", "competitor", "market", "intelligence"]],
    ["audience", ["audience", "segment", "demographic", "psychographic"]],
    ["hooks", ["hook", "angle", "trigger", "scroll-stopper"]],
    ["campaign", ["campaign", "series", "narrative", "orchestrator"]],
    ["calendar", ["calendar", "cadence", "timing", "distribution"]],
    ["production", ["creation", "draft", "copy", "visual", "atomization"]],
    ["proof", ["accurate", "accuracy", "risk", "consistency", "quality"]],
    ["optimization", ["performance", "roi", "pattern", "iteration", "optimize"]],
    ["platform", ["platform", "channel", "tiktok", "instagram", "facebook", "linkedin", "x"]]
  ];

  for (const [tag, keywords] of keywordGroups) {
    if (keywords.some((keyword) => haystack.includes(keyword))) tags.add(tag);
  }

  return Array.from(tags).slice(0, 6);
}

function builtinPromptLibrary(): PromptLibraryItem[] {
  return builtinPromptRows.map(([name, libraryStage, useCase, prompt], index) => {
    const base = {
      id: `${slugify(libraryStage)}-${slugify(name)}-${index + 1}`,
      name,
      libraryStage,
      useCase,
      prompt,
      tags: [] as string[],
      sourceFile: builtinSource
    };
    return { ...base, tags: promptTags(base) };
  });
}

function findPromptCsv() {
  try {
    const files = fs.readdirSync(process.cwd());
    const csvFiles = files.filter((file) => file.toLowerCase().endsWith(".csv"));
    return csvFiles.find((file) => file.toLowerCase().includes("prompt")) ?? csvFiles[0];
  } catch {
    return undefined;
  }
}

export function loadPromptLibrary(): PromptLibraryItem[] {
  const csvFile = findPromptCsv();
  if (!csvFile) return builtinPromptLibrary();

  try {
    const fullPath = path.join(process.cwd(), csvFile);
    const text = fs.readFileSync(fullPath, "utf8").replace(/^\uFEFF/, "");
    const rows = parseCsv(text);
    const headerIndex = rows.findIndex(
      (row) => row[0] === "Name" && row[1] === "Stage" && row[2] === "Use Case" && row[3] === "Prompt"
    );

    if (headerIndex < 0) throw new Error("Prompt library CSV is missing the Name, Stage, Use Case, Prompt header.");

    const prompts = rows
      .slice(headerIndex + 1)
      .filter((row) => row[0]?.trim() && row[1]?.trim() && row[3]?.trim())
      .map((row, index) => {
        const base = {
          id: `${slugify(row[1])}-${slugify(row[0])}-${index + 1}`,
          name: row[0].trim(),
          libraryStage: row[1].trim().toUpperCase(),
          useCase: row[2]?.trim() ?? "",
          prompt: row[3].trim(),
          tags: [] as string[],
          sourceFile: csvFile
        };
        return { ...base, tags: promptTags(base) };
      });

    if (!prompts.length) throw new Error("Prompt library CSV contains no usable prompts.");
    return prompts;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Prompt library could not be loaded.";
    throw new Error(message);
  }
}

type PromptModuleProfile = Pick<PromptModule, "capability" | "outputArtifact" | "dependsOn" | "usedInMvp">;

const defaultModuleProfile: PromptModuleProfile = {
  capability: "Support content strategy workflow",
  outputArtifact: "Supporting strategy artifact",
  dependsOn: ["brand context"],
  usedInMvp: false
};

const promptModuleProfiles: Record<string, PromptModuleProfile> = {
  "Competitive Content Analysis & Mood Board Creator": {
    capability: "Map competitor patterns, content gaps, mood board cues, and creative territories",
    outputArtifact: "contentLandscape",
    dependsOn: ["project brief", "competitor inputs"],
    usedInMvp: true
  },
  "Trend-Responsive Content Ideator": {
    capability: "Connect current trends and cultural moments to brand-safe content concepts",
    outputArtifact: "trendOpportunities",
    dependsOn: ["brand context", "contentLandscape"],
    usedInMvp: false
  },
  "Multi-Variant Hook Generator": {
    capability: "Generate hook variants by psychological trigger, segment, and platform",
    outputArtifact: "hooks",
    dependsOn: ["audienceSegments", "territories"],
    usedInMvp: true
  },
  "Audience Micro-Segment Content Mapper": {
    capability: "Turn broad audience inputs into message, proof, format, and distribution blueprints",
    outputArtifact: "audienceSegments",
    dependsOn: ["brand context", "contentLandscape"],
    usedInMvp: true
  },
  "Content Series Architecture Builder": {
    capability: "Design serialized narratives, episode hierarchy, and repurposing structure",
    outputArtifact: "contentSeries",
    dependsOn: ["territories", "hooks"],
    usedInMvp: true
  },
  "Product-Accurate Visual Brief Generator": {
    capability: "Create product-safe visual briefs and accuracy checklists",
    outputArtifact: "visualBriefs",
    dependsOn: ["brand context", "source evidence"],
    usedInMvp: true
  },
  "AI-to-Human Content Refinement System": {
    capability: "Remove generic AI patterns and add human-feeling editorial texture",
    outputArtifact: "refinedAssets",
    dependsOn: ["contentAssets", "brand voice"],
    usedInMvp: true
  },
  "Multi-Format Content Atomization Engine": {
    capability: "Turn one idea into platform-native posts, threads, emails, and articles",
    outputArtifact: "contentAssets",
    dependsOn: ["contentSeries", "calendar"],
    usedInMvp: true
  },
  "Lifestyle Scene Composition Director": {
    capability: "Design authentic lifestyle scenes around product use contexts",
    outputArtifact: "sceneBriefs",
    dependsOn: ["visualBriefs", "audienceSegments"],
    usedInMvp: false
  },
  "Copy-Visual Synchronization Framework": {
    capability: "Pair copy, visuals, pacing, and emotional emphasis into integrated packages",
    outputArtifact: "copyVisualPackages",
    dependsOn: ["contentAssets", "visualBriefs"],
    usedInMvp: false
  },
  "Platform-Specific Content Optimizer": {
    capability: "Adapt content to platform algorithms, behavior patterns, CTAs, and formats",
    outputArtifact: "platformAdaptations",
    dependsOn: ["hooks", "contentAssets"],
    usedInMvp: true
  },
  "Influencer Collaboration Brief Builder": {
    capability: "Create creator briefs that balance brand requirements with authentic interpretation",
    outputArtifact: "creatorBriefs",
    dependsOn: ["campaign architecture", "brand context"],
    usedInMvp: false
  },
  "Multi-Channel Campaign Orchestrator": {
    capability: "Coordinate owned, earned, and paid channel rollout across launch phases",
    outputArtifact: "calendar",
    dependsOn: ["contentSeries", "platformAdaptations"],
    usedInMvp: true
  },
  "Community Activation Playbook": {
    capability: "Turn passive followers into community contributors and distribution partners",
    outputArtifact: "communityPlaybook",
    dependsOn: ["audienceSegments", "calendar"],
    usedInMvp: false
  },
  "Real-Time Response Protocol System": {
    capability: "Define trend monitoring, response thresholds, risk checks, and speed templates",
    outputArtifact: "responseProtocol",
    dependsOn: ["brand restrictions", "team capacity"],
    usedInMvp: false
  },
  "Performance Pattern Recognition Analyzer": {
    capability: "Translate performance data into winning patterns and underperforming elements",
    outputArtifact: "performancePatterns",
    dependsOn: ["historical metrics", "published assets"],
    usedInMvp: true
  },
  "Content Iteration Engine": {
    capability: "Scale winning content into testable variations and documented learnings",
    outputArtifact: "iterationBacklog",
    dependsOn: ["performancePatterns"],
    usedInMvp: true
  },
  "ROI Maximization Calculator": {
    capability: "Connect content cost and output to business value instead of vanity metrics",
    outputArtifact: "roiModel",
    dependsOn: ["business metrics", "production costs"],
    usedInMvp: false
  },
  "Predictive Performance Modeler": {
    capability: "Score content before production for engagement, conversion, and risk potential",
    outputArtifact: "preflightScores",
    dependsOn: ["historical metrics", "content drafts"],
    usedInMvp: false
  },
  "Competitive Intelligence Integration System": {
    capability: "Maintain competitor monitoring and strategic response playbooks",
    outputArtifact: "competitiveIntel",
    dependsOn: ["competitor inputs", "contentLandscape"],
    usedInMvp: false
  }
};

export function buildPromptModules(prompts = loadPromptLibrary()): PromptModule[] {
  return prompts.map((prompt) => {
    const profile = promptModuleProfiles[prompt.name] ?? defaultModuleProfile;
    return {
      id: prompt.id,
      name: prompt.name,
      libraryStage: prompt.libraryStage,
      useCase: prompt.useCase,
      tags: prompt.tags,
      ...profile
    };
  });
}

function scorePrompt(prompt: PromptLibraryItem, profile: RouteProfile, brief: ProjectBrief) {
  const haystack = `${prompt.name} ${prompt.libraryStage} ${prompt.useCase} ${prompt.prompt.slice(0, 2200)}`.toLowerCase();
  const briefTerms = [brief.industry, brief.goal, brief.audience, brief.tone, brief.platforms.join(" ")].join(" ").toLowerCase();
  let score = 0;

  if (profile.preferredLibraryStages.includes(prompt.libraryStage)) score += 24;
  if (profile.preferredNames?.some((name) => prompt.name.toLowerCase() === name.toLowerCase())) score += 40;

  for (const keyword of profile.keywords) {
    if (haystack.includes(keyword.toLowerCase())) score += 10;
  }

  for (const platform of brief.platforms) {
    if (haystack.includes(platform.toLowerCase())) score += 3;
  }

  for (const term of ["developer", "technical", "proof", "campaign", "content", "marketplace", "brand"]) {
    if (briefTerms.includes(term) && haystack.includes(term)) score += 2;
  }

  return score;
}

function promptPreview(prompt: string) {
  return prompt
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
}

export function routePromptLibrary(brief: ProjectBrief, prompts = loadPromptLibrary()): PromptRoutingResult {
  if (!prompts.length) throw new Error("Prompt library contains no prompts to route.");
  const sourceFile = prompts[0].sourceFile;
  const selections = routeProfiles.map((profile) => {
    const ranked = prompts
      .map((prompt) => ({ prompt, score: scorePrompt(prompt, profile, brief) }))
      .sort((left, right) => right.score - left.score || left.prompt.name.localeCompare(right.prompt.name));
    const selected = ranked[0]?.prompt;
    if (!selected) throw new Error(`No prompt could be selected for ${profile.stage}.`);
    const matchScore = ranked[0]?.score ?? 0;
    const matchedKeywords = profile.keywords.filter((keyword) =>
      `${selected.name} ${selected.useCase} ${selected.prompt}`.toLowerCase().includes(keyword.toLowerCase())
    );
    const route: PromptRoute = {
      pipelineStage: profile.stage,
      selectedPromptId: selected.id,
      selectedPromptName: selected.name,
      libraryStage: selected.libraryStage,
      matchScore,
      reason: `Matched ${selected.libraryStage} prompt using ${matchedKeywords.slice(0, 3).join(", ") || "stage fit"}.`,
      tags: selected.tags,
      promptPreview: promptPreview(selected.prompt)
    };

    return { route, prompt: selected };
  });
  const routes = selections.map((selection) => selection.route);

  return {
    summary: {
      loaded: true,
      sourceFile,
      totalPrompts: prompts.length,
      routedStages: routes.length,
      routerVersion
    },
    routes,
    selections
  };
}

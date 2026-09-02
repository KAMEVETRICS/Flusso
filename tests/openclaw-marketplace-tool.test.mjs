import assert from "node:assert/strict";
import test from "node:test";
import {
  allowedMarketplaceActions,
  buildPreAcceptanceCapabilityContext,
  buildMarketplaceCommand,
  extractSamplingBrief,
  isDirectPeerChatMessage,
  isNonfatalUserNotificationFailure,
  isSamplingCall,
  marketplaceSessionForContext,
  parseMarketplaceSession,
  samplingPeerSendProblem,
  SAMPLING_DELIVERABLE_SECTIONS
} from "../lib/openclaw-marketplace-tool.mjs";

const jobId = "0x" + "ab".repeat(32);
const sessionKey = "agent:main:okx-a2a:group:okx-xmtp:my=5782&to=6245&job=" + jobId;
const session = parseMarketplaceSession(sessionKey);

test("states the capability boundary reviewers see before acceptance", () => {
  const context = buildPreAcceptanceCapabilityContext();
  assert.match(context, /concrete scope confirmation/);
  assert.match(context, /delivery window and acceptance criteria/);
  assert.match(context, /not final campaign production/);
  assert.match(context, /official job_accepted event/);
  assert.match(context, /private content engine/);
});

test("states the free capability-complete exception for OKX sampling", () => {
  const context = buildPreAcceptanceCapabilityContext({ sampling: true });
  assert.match(context, /OKX Sampling Call/);
  assert.match(context, /free capability-complete campaign sample/);
  assert.match(context, /without waiting for job_accepted/);
  assert.match(context, /quote, negotiate/);
  assert.match(context, /ordinary user work still requires/);
  for (const section of SAMPLING_DELIVERABLE_SECTIONS) {
    assert.match(context, new RegExp(section));
  }
  assert.match(context, /peer_send/);
  assert.match(context, /full publishable posts/);
});

test("parses and authorizes only a trusted provider marketplace session", () => {
  assert.deepEqual(session, {
    providerAgentId: "5782",
    counterpartyAgentId: "6245",
    jobId
  });
  assert.deepEqual(
    marketplaceSessionForContext({ agentId: "main", sessionKey, expectedProviderAgentId: "5782" }),
    session
  );
  assert.equal(marketplaceSessionForContext({ agentId: "flusso", sessionKey }), null);
  assert.equal(marketplaceSessionForContext({ agentId: "crestodian", sessionKey }), null);
  assert.equal(marketplaceSessionForContext({ agentId: "main", sessionKey, expectedProviderAgentId: "9999" }), null);
});

test("builds next-action without passing event data through a shell", () => {
  const event = { source: "system", event: "job_asp_selected", jobId, providerAgentId: "5782" };
  const command = buildMarketplaceCommand({ action: "next_action", messageJson: JSON.stringify(event) }, session);
  assert.equal(command.binary, "onchainos");
  assert.deepEqual(command.args.slice(0, 7), [
    "agent", "next-action", "--role", "auto", "--agentId", "5782", "--message"
  ]);
  assert.deepEqual(JSON.parse(command.args.at(-1)), event);
});

test("unwraps the full A2A system envelope before calling next-action", () => {
  const event = { source: "system", event: "job_asp_selected", jobId, providerAgentId: "5782" };
  const command = buildMarketplaceCommand({
    action: "next_action",
    messageJson: JSON.stringify({ agentId: "5782", message: event })
  }, session);

  assert.equal(command.event, "job_asp_selected");
  assert.deepEqual(JSON.parse(command.args.at(-1)), event);
});

test("binds writes to the session provider, counterparty, and job", () => {
  assert.deepEqual(
    buildMarketplaceCommand({ action: "apply", tokenAmount: "0.1", tokenSymbol: "usdt" }, session).args,
    ["agent", "apply", jobId, "--agent-id", "5782", "--token-amount", "0.1", "--token-symbol", "USDT"]
  );
  assert.deepEqual(
    buildMarketplaceCommand({ action: "peer_send", content: "ready" }, session).args,
    [
      "xmtp-send",
      "--job-id", jobId,
      "--to-agent-id", "6245",
      "--message", "ready",
      "--payload", "{\"taskMinVersion\":1}"
    ]
  );
});

test("recognizes only a session-bound direct peer chat message", () => {
  const message = {
    msgType: "a2a-agent-chat",
    jobId,
    receiverAgentId: "5782",
    sender: { agentId: "6245" },
    payload: { source: "okx-agent-task" }
  };
  assert.equal(isDirectPeerChatMessage(JSON.stringify(message), session), true);
  assert.equal(
    isDirectPeerChatMessage({ ...message, payload: { taskMinVersion: 1 } }, session),
    true
  );
  assert.equal(
    isDirectPeerChatMessage({ ...message, receiverAgentId: "9999" }, session),
    false
  );
  assert.equal(
    isDirectPeerChatMessage({ ...message, payload: { source: "untrusted" } }, session),
    false
  );
  assert.equal(
    isDirectPeerChatMessage({ ...message, msgType: "system", event: "job_accepted" }, session),
    false
  );
});

test("recognizes OKX sampling markers in tips, flags, content, or listing-test preamble", () => {
  const baseMessage = {
    msgType: "a2a-agent-chat",
    jobId,
    receiverAgentId: "5782",
    sender: { agentId: "6245" },
    payload: null
  };
  const officialTip =
    "We are test agents, and we need your cooperation to complete the testing. Below are our test questions.";
  const listingPreamble =
    "A task has been created for your service through okx.ai task market. Job Title: \"Web3 NFT Launch Strategy Plan\". Please provide a campaign strategy, content calendar, visual briefs, platform-native posts, and a proof report.";

  assert.equal(
    isSamplingCall({ ...baseMessage, settlementResponse: { sampling: true } }, session),
    true
  );
  assert.equal(
    isSamplingCall({ ...baseMessage, tips: { "task-skill": officialTip } }, session),
    true
  );
  assert.equal(
    isSamplingCall({
      ...baseMessage,
      content: officialTip,
      tips: { "task-skill": "Read okx-ai/SKILL.md" }
    }, session),
    true
  );
  assert.equal(
    isSamplingCall({
      ...baseMessage,
      content: listingPreamble,
      tips: { "task-skill": "Read okx-ai/SKILL.md" }
    }, session),
    true
  );
  assert.equal(isSamplingCall(listingPreamble, session), true);
  assert.equal(isSamplingCall(officialTip, session), true);
  assert.equal(
    isSamplingCall({ ...baseMessage, receiverAgentId: "9999", tips: { "task-skill": officialTip } }, session),
    false
  );
  assert.equal(
    isSamplingCall({
      ...baseMessage,
      content: "Please quote a 4-week campaign and wait for acceptance.",
      tips: { "task-skill": "Read okx-ai/SKILL.md" }
    }, session),
    false
  );
});

test("extracts the listing-test brief and rejects incomplete sampling replies", () => {
  const labeled = [
    "Brand: CryptoEdge",
    "Industry: Web3/Cryptocurrency",
    "Campaign goal: Drive awareness and sign-ups",
    "Audience: Crypto enthusiasts",
    "Platforms: Twitter, Discord, LinkedIn",
    "Tone: Informative yet approachable",
    "Duration: 4 weeks",
    "Cadence: Daily posts on Twitter and Discord",
    "Restrictions: Avoid technical jargon"
  ].join("\n");
  const brief = extractSamplingBrief(labeled);
  assert.equal(brief.brand, "CryptoEdge");
  assert.equal(brief.platforms, "Twitter, Discord, LinkedIn");
  assert.match(
    buildPreAcceptanceCapabilityContext({ sampling: true, prompt: labeled }),
    /Brand: CryptoEdge/
  );

  const narrative = "A task has been created for your service through okx.ai task market. Our brand is 'CryptoArtX', operating in the digital art NFT sector.";
  assert.equal(extractSamplingBrief(narrative).brand, "CryptoArtX");

  assert.match(
    samplingPeerSendProblem("Thanks — scope is clear. Proposed deliverables: a strategy and calendar. Please share the budget."),
    /not a scope confirmation/
  );
  assert.match(
    samplingPeerSendProblem("## Campaign strategy\nPositioning for CryptoEdge.\n## Content calendar\nDay 1 X post."),
    /must include/
  );

  const complete = [
    "## Campaign strategy",
    "Position CryptoEdge as the clear onboarding path.",
    "## Content calendar",
    "Day 1 X, Day 1 Discord, Day 2 LinkedIn.",
    "## Platform-native posts",
    "X: CryptoEdge is the shortest path from curiosity to a first safe action.",
    "## Visual briefs",
    "1:1 explainer card, key message: start smaller.",
    "## Proof report",
    "Claim: onboarding can be beginner-safe. Source: not supplied. Needs verification."
  ].join("\n");
  assert.equal(samplingPeerSendProblem(complete), null);
});

test("keeps pricing negotiable by default and enforces an optional configured floor", () => {
  assert.doesNotThrow(
    () => buildMarketplaceCommand({ action: "apply", tokenAmount: "0.1", tokenSymbol: "USDT" }, session)
  );
  assert.throws(
    () => buildMarketplaceCommand({ action: "apply", tokenAmount: "29.99", tokenSymbol: "USDT" }, session, 30),
    /configured 30 USDT floor/
  );
  assert.throws(
    () => buildMarketplaceCommand({ action: "deliver", jobId: "0x" + "cd".repeat(32), content: "no" }, session),
    /does not match/
  );
});

test("derives the only actions permitted by the official playbook", () => {
  const actions = allowedMarketplaceActions(
    "onchainos agent apply " + jobId + " --agent-id 5782 --token-amount 30 --token-symbol USDT\n"
    + "onchainos agent user-notify --content \"failed\""
  );
  assert.deepEqual([...actions], ["apply", "user_notify"]);
  assert.equal(actions.has("deliver"), false);
});

test("rejects malformed or mismatched event envelopes", () => {
  assert.throws(
    () => buildMarketplaceCommand({
      action: "next_action",
      messageJson: JSON.stringify({ source: "peer", event: "job_asp_selected", jobId })
    }, session),
    /system events/
  );
  assert.throws(
    () => buildMarketplaceCommand({
      action: "next_action",
      messageJson: JSON.stringify({ source: "system", event: "job_asp_selected", jobId, providerAgentId: "9999" })
    }, session),
    /provider does not match/
  );
  assert.throws(
    () => buildMarketplaceCommand({
      action: "next_action",
      messageJson: JSON.stringify({
        agentId: "9999",
        message: { source: "system", event: "job_asp_selected", jobId, providerAgentId: "5782" }
      })
    }, session),
    /envelope agent does not match/
  );
});

test("classifies only the missing interactive-session notification failure as nonfatal", () => {
  assert.equal(
    isNonfatalUserNotificationFailure(
      new Error("okx-a2a.dispatch_user did not deliver to any OpenClaw user session (dispatched=0 failed=0)")
    ),
    true
  );
  assert.equal(
    isNonfatalUserNotificationFailure(new Error("code=NO_DELIVERABLE_USER_SESSION")),
    true
  );
  assert.equal(
    isNonfatalUserNotificationFailure(new Error("wallet signature failed")),
    false
  );
});

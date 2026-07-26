import assert from "node:assert/strict";
import test from "node:test";
import {
  allowedMarketplaceActions,
  buildPreAcceptanceCapabilityContext,
  buildMarketplaceCommand,
  isDirectPeerChatMessage,
  isNonfatalUserNotificationFailure,
  marketplaceSessionForContext,
  parseMarketplaceSession
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

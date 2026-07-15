# Production Deployment

This bundle deploys the GitHub repository to one Linux VPS.

~~~text
OKX.AI task network
        |
        v
Provider Agent runtime + OKX A2A daemon
        |
        | Bearer-authenticated localhost HTTP
        v
Next.js content engine on 127.0.0.1:3107
        |
        +-- Neon PostgreSQL
        +-- OpenAI API
~~~

A2A does not require a public content-engine endpoint. Keep port 3107 bound to localhost. The provider Agent handles negotiation and the OKX task lifecycle; the private engine handles generation and exports.

## Assumptions

- Ubuntu or another systemd-based Linux distribution
- Git
- system-wide Node.js 24 recommended, or Node.js 22.16.0 or newer
- a GitHub repository containing this project
- a Neon pooled connection string
- an OpenAI API key
- OpenClaw, Hermes, or another OKX-supported Agent runtime

The fixed production paths are:

- repository: **/opt/flusso**
- service account: **flusso**
- protected environment: **/etc/flusso/flusso.env**

## 1. Prepare GitHub

Before the first push, verify that local secrets and generated files are ignored:

~~~bash
git init
git check-ignore -v .env.local
git status --short
git add .
git status --short
~~~

The staged set must not include **.env.local**, **.next**, **node_modules**, logs, extracted video frames, the raw chat export, or downloaded HubSpot files.

Commit and push to your GitHub repository:

~~~bash
git commit -m "Prepare Flusso for VPS deployment"
git branch -M main
git remote add origin https://github.com/KAMEVETRICS/Flusso.git
git push -u origin main
~~~

Use a private repository or a public repository with no credentials or private customer material. For a private repository, configure a read-only GitHub deploy key on the VPS.

## 2. Clone on the VPS

Install Git and Node.js 24 (recommended), or Node.js 22.16.0 or newer, then clone:

~~~bash
sudo git clone https://github.com/KAMEVETRICS/Flusso.git /opt/flusso
sudo bash /opt/flusso/deploy/install-vps.sh
~~~

The first installer run creates the protected environment file and stops. Generate an internal bearer token:

~~~bash
openssl rand -hex 32
~~~

Edit the environment:

~~~bash
sudo editor /etc/flusso/flusso.env
~~~

Set **OPENAI_API_KEY**, **A2A_INTERNAL_API_KEY**, and **DATABASE_URL**. Keep the pricing at floor 30, target 100, and markup 15. Quote the database URL if it contains **&** or other shell-sensitive characters.

Run the installer again:

~~~bash
sudo bash /opt/flusso/deploy/install-vps.sh
~~~

It will:

- create the dedicated Linux account
- install locked npm dependencies
- build the Next.js production application
- install the systemd units
- link the Flusso Content Engineering skill into the Agent skill directory
- start the localhost-only content engine
- start the one-minute recovery timer for interrupted generation jobs and safely replayable A2A turns
- run a read-only configuration smoke test

It does not generate content or spend model credits.

## 3. Prepare the provider Agent

Install and initialize one supported Agent runtime under the **flusso** account. The runtime setup is interactive because it requires a model provider and Agentic Wallet login.

Install the official OKX capability pack through the selected Agent, then register the A2A ASP using the fields in **deploy/LISTING.md**.

The communication runtime requires Node.js 22.16.0 or newer; Node.js 24 is recommended. Install its daemon package:

~~~bash
sudo npm install -g @okxweb3/a2a-node@latest
~~~

Run the readiness flow as **flusso**:

~~~bash
sudo -iu flusso
okx-a2a daemon start
okx-a2a switch-runtime --json
okx-a2a agent refresh --json
okx-a2a setup --json
exit
~~~

Every JSON result must report a ready or successful state before continuing. Complete Agentic Wallet login and A2A ASP registration through the Agent conversation.

After OpenClaw runtime setup succeeds, install the Flusso guard and restart the user gateway:

~~~bash
sudo bash /opt/flusso/deploy/configure-openclaw.sh
sudo -iu flusso openclaw plugins inspect flusso-a2a-guard --runtime --json
~~~

Then enable boot startup for the communication daemon:

~~~bash
sudo systemctl enable --now flusso-a2a.service
~~~

OpenClaw still runs through its official user gateway. The Flusso plugin only adds durable turn tracking, bounded binding recovery, and final outbound pricing enforcement.

## 4. Verify production

Run the non-billable verifier:

~~~bash
sudo bash /opt/flusso/deploy/smoke-test.sh
~~~

Expected pricing output:

~~~json
{
  "floor": 30,
  "target": 100,
  "openingOffer": 115,
  "floorEnforced": true
}
~~~

Confirm that the engine is not publicly bound:

~~~bash
sudo ss -ltnp | grep 3107
~~~

The listener must be **127.0.0.1:3107**, not **0.0.0.0:3107** or **[::]:3107**.

Check services and logs:

~~~bash
sudo systemctl status flusso-engine.service
sudo systemctl status flusso-a2a.service
sudo systemctl status flusso-recovery.timer
sudo journalctl -u flusso-engine.service -n 100 --no-pager
sudo journalctl -u flusso-a2a.service -n 100 --no-pager
sudo journalctl -u flusso-recovery.service -n 100 --no-pager
~~~

## 5. Recovery behavior

Accepted jobs run with a renewable database lease. A failed generation attempt is retried after 60 seconds, then 120 seconds, up to three total attempts. The recovery timer also reclaims work left in **accepted** or stale **running** state after an engine restart.

Inbound A2A turns are persisted before the model starts. If OpenClaw reports the exact **Codex binding generation was retired** startup failure before any model or tool call, the timer resets that session and replays the turn with a stable idempotency key. It retries at most twice. Failures after model or tool execution are recorded but never automatically replayed, preventing duplicate protocol or payment side effects.

Generation defaults use **A2A_MAX_GENERATION_ATTEMPTS**, **A2A_JOB_LEASE_SECONDS**, and **A2A_RETRY_BASE_SECONDS**. Conversation recovery uses **A2A_MAX_CONVERSATION_RECOVERY_ATTEMPTS** and **A2A_CONVERSATION_RETRY_BASE_SECONDS**. After the final attempt, the record remains **failed** and the reason is written to the recovery journal. OKX protocol or escrow command failures still follow the OKX pending-decision flow and are not blindly retried.

Run a non-generating recovery sweep manually:

~~~bash
sudo systemctl start flusso-recovery.service
sudo journalctl -u flusso-recovery.service -n 20 --no-pager
~~~

## 6. Deploy later GitHub updates

Push reviewed changes to the current upstream branch, then run:

~~~bash
sudo bash /opt/flusso/deploy/update-vps.sh
~~~

The updater refuses to run over local VPS changes, pulls only with fast-forward semantics, rebuilds, restarts the engine, and reruns the smoke test.

## 7. Beta launch gate

Before listing activation:

1. Verify the Agent can read the private service policy.
2. Simulate 20 USDT twice and confirm round one counters at 30 USDT and round two declines.
3. Simulate an accepted task at 30 USDT or more.
4. Confirm generation does not start before the accepted event.
5. Run one full accepted-job lifecycle with a test brief.
6. Inspect the proof report and all three exports.
7. Restart **flusso-engine.service** during a test generation and confirm the recovery timer resumes it without creating a second campaign record.
8. Activate the marketplace listing only after the delivery passes review.

The first four setup checks are non-billable. The full generation lifecycle calls the configured model and should be triggered deliberately.

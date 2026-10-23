# RakshaSutra

*Raksha* means protection and *sutra* means thread: a thread of care between a family and a child who is out in the world.

RakshaSutra is an AI safety companion for families, built on a **Bee wearable** for the Amazon "Build, Ship, Shape" Developer Hackathon (Bee track, with the AWS Builder and Open Source mini-challenges). It started from a student's school-project idea for child safety that relied on passive RFID tags, and turns it into something proactive: it listens for the *plan*, watches for what is *unexpected*, and tells the parent early, with the reasons.

**The idea.** A guardian wears Bee (an Apple Watch running the Bee software, or a Bee device). Bee hears the plan: "Ayaan has CTE class today, I'll pick him up from the school at 5 p.m." RakshaSutra turns that into a *proposed* plan, the guardian confirms it, and the safety engine then judges the child's location reports against the plan. An alert fires only when something is actually unexpected, and it always says what was expected, what is known and **what is not known**. A late arrival is a "worth a look", never a claim of danger.

- **Bee supplies context.** Schedules and changes from the guardian's spoken notes, read live through the official Bee CLI library (`@beeai/cli`), and a reminder written back to the guardian's Bee todos once a plan is confirmed.
- **A separate, labelled feed supplies the child's location.** Bee is not a child GPS tracker and is rated for adults, so the child's position comes from his own iPhone (OwnTracks) or from the built-in simulator. The app always says which source it is showing.
- **Beera**, the friendly bee mascot (the name means courage and strength), says what is going on in plain words.

## Quick start (demo, no accounts needed)

Requirements: Node.js 20 or newer.

```bash
npm install
npm test                  # 60 unit tests
npm run build -w @rakshasutra/web
npm run start -w @rakshasutra/server   # the whole app on http://localhost:8787
```

Open http://localhost:8787, open **Demo controls**, choose **The unexpected delay**, and press **Start scenario**. Without a connected Bee the story plays scripted notes (the app labels them). For development with hot reload, run `npm run dev:server` and `npm run dev:web` (http://localhost:5173).

## Try the real thing, without a child walking outside

The **simulator** plays a child's iPhone into a private real-mode copy of the app, along real roads and footpaths, and reads your live Bee when the Bee CLI is installed:

```bash
npm run setup:real -- --name Ayaan --age 13     # once: creates the private data/ folder and the family code
npm run sim:serve                               # starts the private simulator server on :8788
npm run sim -- school-run                       # in another window; also: pickup, late, arrive, wrong-place, sudden-stop, no-movement, signal-lost
```

See [docs/REAL_USE.md](docs/REAL_USE.md) for the scenarios, for following a real iPhone (OwnTracks over a Cloudflare tunnel), and for the privacy notes.

## Connecting your Bee

1. In the Bee phone app, enable Developer Mode (tap the app version 5 times in Settings).
2. Install the Bee CLI. On Windows the npm package has no binary: download `bee-windows-x64.zip` from the bee-cli GitHub releases, unzip it into `tools/bee-cli/` (git-ignored) and set `BEE_CLI_BINARY` to the `bee.exe` path. See [docs/FRICTION_LOG.md](docs/FRICTION_LOG.md).
3. `bee login`, then `bee status`.
4. Start the server with `BEE_NOTES=1`. When the chip shows "Bee: live", say a schedule note aloud and a proposed plan appears. (`npm run sim:serve` does this automatically when the CLI is in `tools/bee-cli/`.)

| Variable | Effect |
|---|---|
| `BEE_NOTES=1` | Start the Bee bridge: stream the guardian's utterances, write reminders |
| `BEE_CLI_BINARY` | Path to the `bee` binary (default: `bee` on PATH) |
| `BEE_RAW_LOG=1` | Log raw Bee stream events. This writes everything the Bee hears to the log; keep it off unless debugging |
| `BEE_ALERTS=1` | Also send critical alerts to the guardian's Bee as reminders |
| `NTFY_TOPIC` | Push alerts to the parent through ntfy.sh. Messages contain no location and no name |
| `SNS_TO_PHONE` | Text critical alerts to the parent's own phone through Amazon SNS (needs `@aws-sdk/client-sns`) |
| `BEDROCK_MODEL_ID` | Reports and answers are written by Amazon Bedrock; otherwise a template is used |
| `AWS_REGION` | Bedrock region (default `us-east-1`) |
| `PARENT_TOKEN` | Demo parent credential (default `demo-parent`, demo mode only) |
| `FORCE_DEMO=1` | Run the demo even if a private `data/` folder exists (otherwise the server follows the real family) |
| `PORT`, `HOST` | Listen port (default 8787) and address (default `127.0.0.1`: this computer only) |
| `DATA_DIR` | Where the private family data lives (default `data/`) |

## How it is organised

| Folder | What is in it |
|---|---|
| `packages/core` | Types, geo maths, the anomaly engine, plan parser, SOS and report builders, OwnTracks translation, the demo simulator. No I/O, fully unit tested |
| `apps/server` | Hono API, the Bee bridge, real-mode setup and intake, alert channels, demo runner, Bedrock narrator |
| `apps/web` | React + Leaflet parent app (Catppuccin colours, expanding sheets, hash routes) |
| `scripts` | `e2e.mjs` (demo API), `e2e-real.mjs` (real mode), `sim.mjs` (phone and road simulator) |
| `docs` | `requirements.md`, `design.md`, `REAL_USE.md`, `DEMO_SCRIPT.md`, `FRICTION_LOG.md` |
| `infra` | Reserved for the AWS CDK stack (not built yet) |

## What Bee gives us, and what it does not

| Capability | Status |
|---|---|
| Guardian's spoken notes | `bee stream` utterances, read live and used |
| Write a reminder back | `bee todos create --alarm-at`, used after a plan is confirmed |
| Location of the Bee wearer | The `update-location` event exists; accuracy and frequency are not documented, so the child's feed does not depend on it |
| Heart rate, motion, battery | Not documented for Bee. Simulated in the demo and labelled; an iPhone has no heart rate |

## Safety engine

Watch is 1 point, warning 3, critical 6. The tier is the sum. Alerts fire at warning and above, with a cooldown and escalation, and follow-ups for the same emergency are grouped into one incident.

| Signal | Points | Notes |
|---|---|---|
| Expected check-in missed | 3, then 6 | Needs a confirmed plan. Says what was expected and what is unknown. Place enter and leave events from the phone count as truth |
| Walking to vehicle speed | 6 | Skipped at known pick-up points |
| Phone or band silent | 3, then 6 | Slower inside a safe place |
| Sudden stop | 3 | 8+ m/s to under 1 m/s |
| Heart rate over 180 or under 30 | 6 (3 if running) | Only when a source supplies it |
| In a flagged area | 3 (6 if high) | Advisory only |
| Not moving for 3 hours | 3 | Suppressed in safe places |
| Left a safe place at night | 3 | Quiet hours |
| Battery 10% or less | 1 | |

In real mode with a plain iPhone the rules that cry wolf on a real child (school-bus speed, a friend's house, GPS jitter, no heart rate) are off by default and can be changed in the private `family.json`. Missing data is never presented as confirmed danger.

## When something goes wrong

The parent is messaged without opening the app: a new message, updates as things change, and reminders until acknowledged. Each message carries the reason, a plain-language place, a 3-hour timeline, speed and heading, battery, **what is not known**, nearest help, backup contacts and a short brief to read to a dispatcher. A read-only 2-hour link can be created for a responder (position and movement only).

**Emergency numbers are display-only.** The app never dials them or messages them, in tests or demos. Every channel refuses them as a destination, and they cannot be saved as family contacts.

## Privacy and security

- **Parent-only.** Everything is behind a long family code, compared in constant time, with failures rate-limited (10 a minute, then a one-minute block). The phone has its own separate, send-only login.
- **Local first.** The server listens on this computer only. The phone and any visitor reach it through your own tunnel. The family profile, access codes, child's photo and saved day live in the git-ignored `data/` folder with restricted permissions.
- **Hardened intake.** The OwnTracks endpoint validates and trims every field, limits size, and drops anything unknown. The web app is served with a strict Content-Security-Policy, no framing, no sniffing and `no-store`.
- **Minimal alerts.** Push messages contain no location and no name by default. The Bee bridge keeps only schedule proposals, not other speech, and never shows what is not about the child.
- **No secrets in the repository.** Never commit `data/`, `data-sim/`, `tools/` or any login link. `.gitignore` covers them.
- **Consent.** Tell the child it is on and what it sees. The simulator and the demo video use a fictional or blurred map.

## Not built, on purpose

Alerting nearby strangers who own a Bee: there is no supported API for it, and it would expose a child's identity and location. The roadmap is a parent-curated trusted circle and a handoff packet to emergency services.

## Honest status

Built and tested: the engine, plan parsing from real Bee transcripts, the live Bee bridge, real-mode intake and setup, the simulator, the parent app, three test suites (60 unit, 37 demo API checks, 28 real-mode checks; run `npm test`, `npm run e2e` against a demo-mode server, and `npm run e2e:real`).
Not yet verified: a run with a real iPhone moving through OwnTracks, and the Bedrock narrator against a real AWS account.
Next: a CDK stack (API Gateway, Lambda, DynamoDB, SNS, Bedrock), and a native iPhone app.

## Licence

MIT. See [LICENSE](LICENSE).

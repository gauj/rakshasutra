# Devpost submission text

Copy each block into the matching Devpost field. Character limits are noted. Replace the three `TODO` links before submitting.

## General info

**Project name** (60 characters)

```
RakshaSutra: proactive child safety on Bee
```

**Elevator pitch** (200 characters)

```
A guardian's Bee hears the plan. RakshaSutra watches for what is unexpected and warns the parent early, saying what was expected, what is known and what is not. Never a false claim of danger.
```

**Built with** (tags)

```
typescript, nodejs, react, vite, hono, leaflet, openstreetmap, bee, bee-cli, owntracks, amazon-bedrock, amazon-sns, aws-cdk, vitest
```

**Try it out links**

- Code: https://github.com/gauj/rakshasutra
- Video: TODO (YouTube or Vimeo link, under 3 minutes)

---

## About the project

### Inspiration

It began with a school project. A student, Ayaan, designed a child-safety idea around passive RFID tags read at gates. It is a good idea with one big weakness: it only works where a reader happens to be, and it never knows what was *supposed* to happen. A parent does not worry because a tag was missed. A parent worries because the child did not arrive when expected.

Bee gave us the missing piece: the plan. A parent already says the plan out loud ("Ayaan has class today, I'll pick him up from school at 5"). RakshaSutra listens for that sentence and turns it into something a safety system can check.

*Raksha* means protection and *sutra* means thread: a thread of care between a family and a child.

### What it does

1. **Bee hears the plan.** The guardian wears Bee (an Apple Watch running the Bee software). A spoken note becomes a *proposed* plan: who, where, and when.
2. **The guardian confirms.** Nothing happens until they tap confirm. A reminder is then written back to their Bee todos.
3. **The safety engine judges against the plan.** The child's location reports are compared with what was expected. A late arrival, a walk into a flagged area, a vehicle-speed jump away from a pick-up point, a sudden stop, hours without moving or a silent phone each raise a graded alert.
4. **Alerts explain themselves.** Every alert says what was expected, what is known and **what is not known**. A late arrival is a calm "worth a look", never a claim of danger. A 3-hour timeline, speed and heading, battery, nearest help, backup contacts and a short brief for a dispatcher come with it.
5. **Beera, a friendly bee, narrates** in plain words, and the parent can ask "Where is Ayaan now?".

Emergency numbers are display-only. The app never dials or messages them, in tests or demos, and refuses them as a destination or a saved contact.

### How Bee is used (track requirement)

- The guardian's **live speech** is read from an Apple Watch running the Bee software through the official **`@beeai/cli`** library (`sse.streamJson`), in `apps/server/src/bee-bridge.ts`.
- A spoken note becomes a proposed plan (`packages/core/src/schedule.ts`), the guardian confirms it, and a **reminder is written back** to Bee todos (`api.todos.create`).
- The plan then drives the safety engine: a late-arrival alert fires only when a Bee-created plan says the child should be somewhere.
- In the demo video the note is spoken to the Watch on camera, and the alert that follows is judged against that plan.

### The child's location is a separate, labelled feed

Bee is not a child GPS tracker, and its app is rated for adults, so a child cannot wear it. The child's position therefore comes from a different source, and the app always says which:

- a **simulator** that replays a child's iPhone along **real roads and footpaths** (seven scenarios), and
- a **real-iPhone path** through the free OwnTracks app, over HTTPS, in low-battery mode with place enter and leave events.

We have not yet verified a run with a real iPhone moving. The demo child's feed is simulated, and the app says so.

### How we built it

- **Monorepo, TypeScript throughout.** `packages/core` holds the pure, unit-tested engine; `apps/server` is a Hono API with the Bee bridge and alert channels; `apps/web` is a React and Leaflet parent app.
- **Plans, not guesses.** A deterministic, offline plan parser reads real Bee transcripts (no language model needed to be correct), and a scored engine (watch 1, warning 3, critical 6) turns signals into tiers with cooldowns and incidents.
- **Real mode with private data.** A family code, a separate send-only phone login, rate limiting, strict validation of everything the phone sends, a Content-Security-Policy, local-only binding, and all family data in a git-ignored folder.
- **A simulator you can trust.** It plays the phone through the same login-protected intake as a real iPhone, along routes fetched once from public routing services.
- **AWS.** Amazon Bedrock (Converse) can write the reports and answer questions, and Amazon SNS can text the parent's own phone. Both are optional and fall back safely. An AWS CDK stack defines the DynamoDB table, SNS topic, Bedrock narrator Lambda and API. See `docs/AWS.md`.
- **Tested.** 75 unit tests, 13 AWS mock tests, 9 CDK stack tests, 37 demo API checks and 28 real-mode checks.

### Challenges

- **Live Bee speech is messy.** Utterances arrive out of order, a time can be split ("at 5." then "30."), a name is misheard ("Ayaan" becomes "Ayan" or "Ian"), and the same utterance can arrive twice. Parsing each piece as it arrived froze our plan at 5:00 PM. We now buffer, order by when it was spoken, de-duplicate, wait for a pause, rejoin split times and accept name aliases. We extracted that into a small open-source library (below).
- **No sensors on a plain phone.** An iPhone has no heart rate and reports every few minutes. We switched off the rules that cry wolf on a real child (bus speed, a friend's house, GPS jitter), trusted the phone's own place events and made plans the main signal.
- **Privacy.** A child's location is sensitive. Push messages carry no location or name, the Bee bridge keeps only schedule proposals, and the publish script refuses to release anything that looks personal.

### Accomplishments

- A real, working loop: spoken plan → proposed plan → confirmation → reminder in Bee → judged alert → resolved.
- Alerts that are honest about what they do not know.
- An app that looks and feels friendly (Beera, Catppuccin colours, expanding sheets) while saying serious things plainly.
- A one-command simulator for repeatable demos of every scenario.

### What we learned

Context beats sensors. A child 30 minutes late to a plan is more informative than any amount of passive tracking, and a wearable that hears the plan is the cheapest way to get it.

### What's next

A native iPhone app, a verified run with a real phone, a deployed AWS stack, and a parent-curated trusted circle and handoff packet for emergency services. We deliberately did **not** build alerts to nearby strangers who own a Bee: there is no supported API, and it would expose a child's identity and location.

---

## What was built during the submission period

The repository's first commit is 15 Oct 2026, inside the submission period (31 Aug to 23 Oct). The only earlier work was a school presentation with no code. Everything in the repository was written during the period: the engine, plan parser, Bee bridge, parent app, real mode, simulator, security hardening, documentation, the AWS CDK stack and the open-source library.

## Tracks and mini challenges

- **Primary track:** Bee (Wearable AI).
- **Mini challenge, AWS Builder:** see `docs/AWS.md`. Services: Amazon Bedrock (Converse), Amazon SNS, and an AWS CDK stack (DynamoDB, SNS, Lambda, API Gateway). Honest status: tested with mocks and synthesised; **not deployed** to a live account.
- **Mini challenge, Open Source:**
  - Contribution URL: TODO (https://github.com/gauj/bee-utterance-assembler)
  - Project repository URL: https://github.com/gauj/rakshasutra
  - GitHub username: gauj
  - What I did, how it works, why it matters: I extracted the part of RakshaSutra that makes Bee's live transcripts usable into a standalone, zero-dependency, MIT-licensed TypeScript library, `bee-utterance-assembler`. It de-duplicates utterances, orders them by when they were spoken, rejoins times Bee's speech-to-text splits ("at 5." + "30."), normalises spelled numbers and "p. m.", extracts utterances from the undocumented stream envelope, handles the three `spoken_at` formats and matches misheard names. It has 20+ tests built from real transcripts. It matters because every Bee developer who parses live speech hits these quirks, and today each of them has to rediscover the fixes.

## Testing instructions for judges

1. `git clone https://github.com/gauj/rakshasutra && cd rakshasutra && npm install`
2. `npm test` (75 tests).
3. `npm run build -w @rakshasutra/web` then `npm run start -w @rakshasutra/server`, open http://localhost:8787, open **Demo controls**, choose **The unexpected delay**, and press **Start scenario**. No account or key is needed; the story plays scripted notes and the app labels them.
4. To see live Bee data you need your own Bee login (README, "Connect your own Bee"). The demo video shows our live run.

## Product feedback

Full details with steps, severity and workarounds are in `docs/FRICTION_LOG.md` (eight entries).

**Which developer tools, APIs and SDKs did you use, and for what?**
Bee CLI (v0.7.3 binary) and the `@beeai/cli` Node library: streaming the guardian's live utterances and writing todos back. Amazon Bedrock Runtime SDK (Converse) for narration, Amazon SNS SDK for parent-only texts, and AWS CDK for infrastructure. OwnTracks (free iOS app) for the child's phone, OpenStreetMap tiles with Leaflet for the map, ntfy for push.

**What worked well?**
The Node library is a good abstraction: typed, with `sse.streamJson` and `api.todos.create` covering the read and write paths. `bee login --no-wait` is a thoughtful touch for agents. Developer Mode and the live stream worked reliably on an Apple Watch once logged in.

**What needs work?**
(1) The npm package ships no Windows binary, so `createBeeClient()` fails on Windows until you download the release zip and set `BEE_CLI_BINARY`. (2) The `bee stream --json` envelope and event shapes are not documented. (3) Live utterances arrive out of order, split mid-number and with misheard names, with no per-conversation sequence number or "segment complete" signal. (4) `spoken_at` is an integer in `bee now` and an ISO string in `bee stream`. (5) `bee status` stays "Not logged in" after a `--no-wait` login is approved until `bee login` is re-run. (6) There is no documented heart rate, motion or battery, and location frequency and accuracy are unspecified. (7) A documented "guardian" pattern for family apps would help.

**Onboarding experience (zero to hello world)?**
On Windows most of the effort went into the missing binary and the undocumented stream shape. Once those were solved, live utterances reached the app within seconds.

**Would you build with these devices and services again?**
Yes. A wearable that hears the plan is exactly the context a safety app is missing. With a documented stream envelope, ordering guarantees and a Windows binary in the package, it would be a short path.

**AWS Builder: which services and how?**
Amazon Bedrock (Converse API) writes the parent report and answers free-form questions strictly from supplied facts, falling back to a template. Amazon SNS texts the parent's own phone (opt-in), and refuses emergency numbers. An AWS CDK stack defines a DynamoDB alert-history table, an encrypted SNS topic, a least-privilege Bedrock narrator Lambda and an API Gateway endpoint. Unit tests mock the SDKs and the stack synthesises offline. It has not been deployed. A live Bedrock call was attempted with a new account and a least-privilege IAM user (scripts/bedrock-check.mjs), but AWS answered "Operation not allowed" while the account was still being activated, so the template fallback ran. Details: `docs/AWS.md`.

**Optional feature requests**

- Document the stream envelope and add a sequence number per conversation (Important).
- Publish the Windows binary in the npm package (Important).
- Expose device battery and wear state (Nice-to-have).
- Custom vocabulary for names in speech-to-text (Nice-to-have).

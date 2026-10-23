# Devpost "Additional info" form: answers

Paste each answer into the matching field. The three age, jurisdiction and employee checkboxes are statements about you, so tick them yourself after reading each one.

## Short fields

| Field | Answer |
|---|---|
| Upload a file | Skip (optional). The repository has everything. |
| Submitter Type | **Individual** (Gaurav Johari, the adult entrant). Ayaan is credited in the text, but a minor cannot be an entrant or team member under the rules. |
| Organization Name | `N/A` |
| Submitter Country of Residence | Your own country of residence |
| Province (Canada) | `N/A` |
| Primary Track | **Bee** |
| Code repository URL | `https://github.com/gauj/rakshasutra` |
| New or existing before 31 Aug 2026 | **New** (first commit 15 Oct 2026; the only earlier work was a school presentation with no code) |
| AWS Builder Mini Challenge? | **Yes** |
| Open Source Mini Challenge? | **Yes** |
| Contribution URL | `https://github.com/gauj/bee-utterance-assembler` |
| Project Repository URL | `https://github.com/gauj/bee-utterance-assembler` |
| GitHub Username | `gauj` |
| Project Testing Link | `https://github.com/gauj/rakshasutra#-quick-start` |
| Level of learning | **Significant** (your honest choice) |
| Gained AI value for your career? | **Yes** (your honest choice) |

## If you chose "Existing" instead of "New", explain the update

Not needed when you choose New. If you prefer Existing: the idea began as a school presentation about passive RFID child safety (no code). Everything in the repository was built between 15 and 23 October 2026: the safety engine, Bee bridge, plan parser, parent app, real-mode intake, simulator, security hardening, AWS stack and an open-source library.

## AWS Builder: which services did you incorporate and how?

```
Amazon Bedrock (Converse API) writes the parent's wellbeing summary and answers free-form questions ("Is there anything I need to do right now?") strictly from supplied JSON facts, at low temperature, and falls back to a built-in template if Bedrock is off or errors (apps/server/src/narrator.ts). Amazon SNS can text the PARENT's own phone for critical alerts, opt-in, and refuses emergency numbers as a destination (apps/server/src/channels.ts). An AWS CDK (TypeScript) stack in infra/ defines a DynamoDB alert-history table (point-in-time recovery, AWS-managed encryption), an encrypted SNS topic, a least-privilege narrator Lambda that calls Bedrock (only bedrock:InvokeModel on one model ARN) and an HTTP API with IAM (SigV4) auth. Integration is documented in docs/AWS.md, with architecture, IAM notes and costs. Honest status: 13 offline tests mock the Bedrock and SNS SDKs and 9 tests check the stack with aws-cdk-lib assertions; "cdk synth" succeeds. The stack has not been deployed. [UPDATE THIS SENTENCE if you run scripts/bedrock-check.mjs successfully: "One live Bedrock call (Amazon Nova Lite, us-east-1) was run with scripts/bedrock-check.mjs and returned both answers."] Kiro Crew was not used.
```

## Open Source: description of what you did, how it works, why it matters

```
I created and published bee-utterance-assembler, a new standalone, zero-dependency, MIT-licensed TypeScript library, extracted from the Bee-powered RakshaSutra app (https://github.com/gauj/rakshasutra). Bee streams live speech-to-text in small utterances that, in real use, arrive out of order, split a time across two utterances ("at 5." then "30."), repeat, carry mis-heard names ("Ayaan" heard as "Ayan"), and wrap the text in an undocumented envelope whose spoken_at is an integer in "bee now" but an ISO string in "bee stream". The library de-duplicates by utterance id, orders by when each piece was spoken, waits for a pause (settle timer), rejoins split times, normalises spelled numbers and "p. m.", extracts utterances from any envelope shape, converts all spoken_at formats and matches names with aliases. It has 38 tests built from real transcripts, CI on GitHub Actions (passing) and a README with before and after examples and a usage example for @beeai/cli. It matters because every developer who reads Bee's live stream hits these quirks today and has to rediscover the same fixes; this gives them a tested drop-in, and the findings are also in my friction log for the Bee team.
```

## Optional: feature requests

```
1. (Important) Document the "bee stream --json" event envelope and add a per-conversation sequence number or a "segment complete" event, because utterances arrive out of order and times are split across utterances. Without it every integrator must buffer and guess when a note is finished.
2. (Important) Publish the Windows x64 binary inside the @beeai/cli npm package so createBeeClient() works on Windows without a manual download and BEE_CLI_BINARY.
3. (Nice-to-have) Expose device battery and wear state, and document the accuracy and frequency of location events, so family and safety apps can reason about "no signal".
4. (Nice-to-have) Allow custom vocabulary for names in speech-to-text so schedule notes about a child's name are transcribed correctly.
```

## Optional: friction log

The full log with steps, severity and workarounds is in `docs/FRICTION_LOG.md` (https://github.com/gauj/rakshasutra/blob/main/docs/FRICTION_LOG.md). If the box needs the text itself, paste this condensed version:

```
1. Windows: @beeai/cli ships no Windows binary (high). Task: install on Windows 11 and run bee status. Steps: npm install @beeai/cli (0.8.0), run bin/bee.js version. Expected: it runs. Actual: "Bee CLI binary not found for windows-x64"; the package only has linux and mac binaries, while GitHub release v0.7.3 has bee-windows-x64.zip. Workaround: unzip the release and set BEE_CLI_BINARY. Suggestion: ship the Windows binary in the npm package.
2. bee stream --json envelope is undocumented (medium). Expected a documented envelope; actual: sse.streamJson yields { data, raw } with no documented event shape. Workaround: search the payload for utterance.text; log raw events. Suggestion: document the envelope with JSON examples.
3. Live transcripts arrive out of order, split mid-number, with misheard names (high for time-sensitive apps). Real events: the opening sentence arrived last; "5:30" became "...at 5." + "30.from his school."; "Aarav" became "Arab". Parsing each utterance as it arrived froze a plan at 5:00 PM. Workaround: buffer, order by spoken_at, de-duplicate by id, wait 4 s of silence, rejoin split times, accept name aliases (now the open-source bee-utterance-assembler). Suggestion: sequence numbers or a segment-complete event; custom vocabulary.
4. spoken_at is an integer in bee now --json and an ISO string in bee stream (low). Suggestion: document types and units.
5. bee status stays "Not logged in" after a --no-wait login is approved until bee login is re-run (medium). Suggestion: complete the approved session or say "approval pending".
6. No sensor or health data (heart rate, motion, battery) in the developer surface; location frequency and accuracy are unspecified (feature gap). Workaround: the child's location comes from a separate labelled feed.
7. Docs gap for guardian use: the Bee app is 18+, so a child cannot wear it. A documented guardian pattern (adult's Bee reads plans, writes reminders) would help family-safety builders.
```

## Project testing instructions

```
No account or key is needed to see the app. 
1. git clone https://github.com/gauj/rakshasutra && cd rakshasutra && npm install
2. npm test   (75 unit tests)
3. npm run build -w @rakshasutra/web && npm run start -w @rakshasutra/server
4. Open http://localhost:8787, open "Demo controls", choose "The unexpected delay", press "Start scenario". The story plays scripted notes, labelled as such.
Live Bee data needs the judge's own Bee login (README, "Connect your own Bee"); the demo video shows our live run on an Apple Watch running Bee. The child's location in the demo is a labelled simulator along real roads; a real-iPhone path through OwnTracks is built but not yet verified. See docs/REAL_USE.md.
```

## Feedback Question 1: which developer tools, APIs and SDKs, and for what?

```
Bee: the Bee CLI (v0.7.3 Windows binary) and the @beeai/cli Node library, to stream the guardian's live utterances (sse.streamJson) and write reminders back (api.todos.create); the Bee app on an Apple Watch with Developer Mode as the live data source.
AWS: Amazon Bedrock Runtime SDK (Converse) for narration and Q&A, Amazon SNS SDK for parent-only text alerts, AWS CDK for the infrastructure stack.
Other: OwnTracks (free iOS app) for a child's real phone location, OpenStreetMap tiles with Leaflet for the map, OSRM and routing.openstreetmap.de for simulator routes, ntfy for push, Hono, React, Vite and Vitest.
```

## Feedback Question 2: what worked well?

```
Bee CLI and @beeai/cli: the Node library is a good abstraction (typed; sse.streamJson and api.todos.create cover the read and write paths); bee login --no-wait is a thoughtful touch for agents; once logged in, live utterances from the Apple Watch reached the app within seconds and the todo write-back worked.
AWS (Bedrock, SNS, CDK): the Converse API is a single consistent call across models; CDK assertions made it possible to test the stack offline and cdk synth works without credentials.
OwnTracks: a config link and QR code set up the phone in one step, and its place enter/leave events suit a "did he arrive" check.
```

## Feedback Question 3: what needs work?

```
Bee: (1) no Windows binary in the npm package, so createBeeClient() fails on Windows until BEE_CLI_BINARY is set; (2) the stream --json envelope and event shapes are undocumented; (3) live utterances arrive out of order, split mid-number, with misheard names and no sequence number or segment-complete signal; (4) spoken_at is an integer in "bee now" and an ISO string in "bee stream"; (5) bee status stays "Not logged in" after an approved --no-wait login until bee login is re-run; (6) no documented heart rate, motion or battery, and location frequency and accuracy are unspecified; (7) no documented guardian pattern for family apps.
AWS: no live account was used for deployment, so I cannot assess runtime behaviour; the nodejs20.x Lambda runtime is being deprecated, so a new project should target a newer runtime.
OwnTracks: place regions in the config link are not verified by me on a real device; iOS significant-change mode is silent when the phone is still.
```

## Feedback Question 4: onboarding experience

```
Bee: on Windows most of the effort went into the missing binary and the undocumented stream shape; after that a live utterance reached the app within seconds. Developer Mode (tap the app version 5 times) was easy once I knew it. Login approval needed a re-run of bee login. 
AWS: CDK and the SDK clients were quick to set up and test offline; I had no AWS credentials on the build machine, so deployment onboarding was not tested.
OwnTracks: quick, one QR scan, though real-device behaviour was not tested by me.
```

## Feedback Question 5: would you build with these again?

```
Yes. A wearable that hears the plan ("pick him up at 5") is exactly the context a child-safety app is missing, and it is far cheaper than any passive tracking. With a documented stream envelope, ordering guarantees and a Windows binary in the npm package, building on Bee would be a short path. I would also use Bedrock and CDK again for the narration and infrastructure pieces.
```

## Which AI tools have you leveraged?

```
Claude Code (Anthropic Claude models) for pair-programming, code review, test writing, documentation and sub-agent tasks (comment pass, CDK stack, standalone library). All code was reviewed, run and tested by me; live Bee behaviour was verified against my own Apple Watch.
```

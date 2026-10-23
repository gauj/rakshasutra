# Bee developer friction log

Kept during the build for the hackathon's product feedback and friction-log bonus. Dates are 2026.

## 1. Windows: `@beeai/cli` ships no Windows binary (severity: high)

- **Task:** install the CLI on Windows 11 and run `bee status`.
- **Steps:** `npm install @beeai/cli` (v0.8.0), then `node node_modules/@beeai/cli/bin/bee.js version`.
- **Expected:** the CLI runs.
- **Actual:** `Bee CLI binary not found for windows-x64 at ...\dist\platforms\windows-x64\bee.exe`. The package contains only `linux-arm64`, `linux-x64`, `mac-arm64`, `mac-x64`.
- **Evidence it exists:** GitHub release v0.7.3 has `bee-windows-x64.zip`. The npm package (newer) lacks it.
- **Workaround:** download the release zip and point `BEE_CLI_BINARY` at `bee.exe` (the launcher honours this variable).
- **Suggestion:** publish the Windows binary in the npm package, and add `win32-arm64` (this machine reports `x64` under emulation on Windows on ARM).

## 2. `bee stream --json` output shape is not documented (severity: medium)

- **Task:** map stream events into an application.
- **Expected:** a documented envelope (event name, payload fields).
- **Actual:** the README documents payloads for a few event types and says `--json` exists, but not the exact envelope. `createBeeClient().sse.streamJson()` yields `{ data, raw }` with no event name field documented.
- **Workaround:** the bridge searches the payload for `utterance.text` instead of relying on a fixed envelope, and logs raw events with `BEE_RAW_LOG=1`.
- **Suggestion:** document the envelope and add JSON examples for `conversations`, `facts`, `locations` and `stream`.

## 3. No sensor or health data in the developer surface (severity: feature gap)

- **Task:** build a child-safety app that detects falls, abnormal heart rate or removal.
- **Actual:** the docs and CLI expose conversations, facts, todos, journals, locations, photos. No heart rate, motion or battery. `update-location` is documented but not described as continuous GPS.
- **Workaround:** the safety engine takes sensor input through a `SensorSource` interface; the demo uses a clearly labelled synthetic child feed.
- **Suggestion:** document the accuracy and frequency of location events, and consider exposing device battery and wear state.

## 4. Clarify which interfaces count for the hackathon (severity: low)

- The rules say projects use Bee's "CLI, MCP, or Agent Skills", while the docs also describe a REST API at `api.developer.bee.amazon.dev`. A one-line statement of whether direct REST use qualifies would help.

## 5. Docs gaps for minors and guardians (severity: medium)

- The Bee app is rated 18+, so a child cannot wear it. A documented "guardian" pattern (the adult's Bee reading schedules and writing reminders) would help family-safety builders.

## 6. `bee status` stays "Not logged in" until `bee login` is re-run (severity: medium)

- **Task:** log in with `bee login --no-wait`, approve in the Bee app, then check `bee status`.
- **Expected:** `bee status` reports the account once the link is approved.
- **Actual:** `bee status` kept saying "Not logged in" after approval. Re-running `bee login` finished the session ("connected to the Bee account of ...").
- **Suggestion:** have `bee status` complete an approved pending session, or say "approval pending, run `bee login` to finish".

## 7. Live transcripts arrive out of order, split, and with misheard names (severity: high for time-sensitive apps)

- **Task:** turn a spoken note ("Aarav has robotics practice. Practice ends at 5 and I'll pick him up at 5:30.") into a schedule.
- **Actual (real `new-utterance` events):** sentences arrived out of speaking order (the opening sentence came last); "5:30" was split into "...pick him up at 5." and "30.from his school."; "Aarav" was transcribed as "Arab". Another real run rendered "5: 30" with a space.
- **Impact:** parsing each utterance as it arrives froze the plan at 5:00 PM.
- **Workaround:** buffer pieces, order by `spoken_at`, de-duplicate by utterance id, wait for a 4-second pause, rejoin split times, and accept name aliases.
- **Suggestions:** document that utterances are not ordered; add a "segment complete" or per-conversation sequence number to stream events; allow custom vocabulary for names.

## 8. `spoken_at` type differs between interfaces (severity: low)

- `bee now --json` returns `spoken_at` as an integer; `bee stream` returns an ISO string. Documenting the types (and units) would save a debugging step.

## Worked well

- The Node library (`createBeeClient`) is a good abstraction: typed, with `sse.streamJson` and `api.todos.create` covering the read and write paths.
- `--no-wait` on `bee login` is a thoughtful addition for agents and automation.

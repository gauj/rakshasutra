# RakshaSutra: Design

## 1. Architecture

```
 Guardian's Bee ──(bee CLI: stream, todos)──► Bee bridge ──► note buffer ──► plan parser
                                                                                 │ proposal
 Child's feed (simulator today;                                                  ▼
 phone/tracker later) ──pings──►  Safety engine  ◄── guardian confirms ── Parent app (React)
                                       │  ▲                                      ▲
                          signals/tier │  │ plans                                │ polls /api/state
                                       ▼  │                                      │
                                  Alerts, SOS, reports ──► Hono API ─────────────┘
                                                              │
                                                              └─► Amazon Bedrock (optional narrator)
```

Everything runs on one machine today. Nothing is deployed.

## 2. Repository layout

| Path | Contents |
|---|---|
| `packages/core` | Pure TypeScript. Types, geo maths, `GuardianEngine`, plan parser, SOS and report builders, scenario simulator, tests. No I/O. |
| `apps/server` | Hono API, `BeeBridge`, demo runner with a virtual clock, Bedrock narrator |
| `apps/web` | React and Leaflet parent app (Vite, proxies `/api` to the server) |
| `docs` | Requirements, design, friction log, hand-off |

Core is deliberately I/O-free so the same engine can later run inside AWS Lambda.

## 3. Key design decisions

1. **Guardian wears Bee; the child does not.** Bee is rated 18+. The child's location, speed and heart rate come from a separate source behind a `SensorSource` interface. Today that is a labelled simulator.
2. **Plan-aware alerts.** The headline innovation is that Bee supplies context ("pick-up is at 6 now"), so the engine knows when a missing check-in is a problem and when it is explained.
3. **Propose, then confirm.** A spoken note creates only a proposal. The guardian confirms it. This guards against misheard or misparsed notes.
4. **Explain, never assume.** Alerts state expected vs actual vs unknown, and that they do not confirm an emergency. Missing data is distinct from danger.
5. **Deterministic parsing.** The note parser is offline regex logic, so the demo does not depend on an LLM. Bedrock is an optional upgrade for reports and Q&A.
6. **Use the official Bee CLI library.** The rules require CLI, MCP or Agent Skills. `@beeai/cli/lib` drives the `bee` binary for streaming and for writing todos.
7. **No crowd alerting.** Notifying nearby strangers is unsupported by Bee and unsafe for the child.
8. **Honest labelling.** Scripted and typed notes are marked as not from Bee; simulated feeds are labelled demo.

## 4. Data model (`packages/core/src/types.ts`)

| Type | Role |
|---|---|
| `Ping` | Location sample: lat, lon, accuracy, optional heart rate, battery, source |
| `ChildProfile` | Name, age, region, timezone, consent flags, quiet hours, zones, contacts |
| `Zone` | Circle, `safe` or `attention`; `allowPickup` marks expected pick-up points |
| `Plan` | "Child should be at zone X by time T"; status proposed, confirmed, superseded, rejected, completed |
| `Signal` | A rule firing: id, severity 1/3/6, title, detail |
| `Evaluation` | Tier, score, signals, snapshot, optional new alert |
| `Alert` | Incident id, tier, status, SOS payload |
| `SosPayload` | Everything a parent needs to act |

## 5. Safety engine

`GuardianEngine` keeps per-child state: pings (24 h), plans, flagged voice snippets, the open alert. Every ping, utterance and clock tick re-evaluates the rules; the sum of signal weights gives the tier.

| Signal | Points | Condition |
|---|---|---|
| LATE_ARRIVAL | 3, then 6 at 45 min overdue | Confirmed plan, 15 min grace passed, child not in the expected zone |
| MODE_SHIFT_VEHICLE | 6 | Walking to 6 m/s or more within 3 min, start not at a pick-up zone |
| VOICE_DISTRESS | 6 | Distress phrase, opt-in, held 10 min |
| SILENCE | 3 at 10 min, 6 at 30 min | No pings; thresholds are 6x and 3x inside a safe zone |
| ABRUPT_STOP | 3 | 8 m/s or more to under 1 m/s with at least 5 m/s^2 deceleration |
| HR_ABNORMAL | 6 (3 if running) | Over 180 or under 30 bpm, only if supplied |
| ATTENTION_ZONE | 3 (6 high) | Inside a flagged area (advisory) |
| STATIONARY_LONG | 3 | Within 75 m for 3 h outside safe zones |
| SAFE_ZONE_EXIT_QUIET_HOURS | 3 | Left a safe place during quiet hours |
| BATTERY_LOW | 1 | At or below 10% |

Alerting: raised at warning or above; a cooldown prevents repeats; escalation or a new serious signal creates a follow-up in the same incident carrying earlier evidence; the alert resolves after 10 quiet minutes. A plan completes when the child is inside the expected zone from 90 minutes before the expected time.

Plan parsing (`schedule.ts`): finds a pick-up phrase and a time, handles "X instead of Y", infers am/pm with a school-day heuristic, shifts the active plan on "running late", returns a plain-language interpretation and a confidence. Notes with no schedule intent return nothing.

## 6. Server

| Endpoint | Purpose |
|---|---|
| `GET /api/state` | Tier, signals, position, trail, alerts, plans, Bee status |
| `POST /api/plans/:id/confirm`, `/reject` | Guardian decision; confirm also writes a Bee reminder |
| `POST /api/notes` | Typed note (testing without a Bee) |
| `POST /api/alerts/:id/ack` | Acknowledge or mark false alarm |
| `GET /api/report?hours=N`, `POST /api/ask` | Report and Q&A (Bedrock if configured) |
| `POST /api/demo/start`, `/speed`, `/stop` | Scenario control |

All routes require the `x-parent-token` header. The demo runner uses a virtual clock so an hour of events plays in about a minute; the timeline of Bee notes and reminders is mapped onto the same clock.

`BeeBridge` starts only when `BEE_NOTES=1`. It checks authentication, streams `new-utterance` events, extracts utterance text from whatever envelope arrives, and passes it to a 45-second buffer so a note split across sentences still parses.

## 7. Parent app

Single page, mobile first. Order: SOS card (if open), then map, plan card, "right now", alert history, report. The SOS card turns into a green "conditions cleared" card when the tier returns to safe. The plan card is where the guardian confirms what Bee heard. A demo bar selects scenarios and shows a "Bee:" chip (live, or not connected with scripted notes).

## 8. Privacy and safety posture

- Location visible only to the parent account (demo token today; real auth planned).
- Consent flags per child; voice and heart rate off unless opted in.
- Utterances are matched in memory and discarded; only proposals are kept.
- Flagged areas are advisory and described as such.
- Alerts never claim an emergency that the data cannot support.

## 9. Planned AWS architecture (not built)

API Gateway and Lambda for the API; DynamoDB for pings, plans and alerts; EventBridge for the clock tick; SNS for SMS and push; Amazon Location Service for places and geofences; Bedrock (with Strands or AgentCore) for narration and note understanding; Cognito for auth; Secrets Manager for tokens; CDK for infrastructure. Kiro Crew can be used in development to qualify for the AWS Builder mini-challenge.

## 10. Testing

`npm test` runs 45 Vitest tests: scenario runs (normal day has no alerts; abduction raises one critical incident with all signals; delay scenario raises exactly one alert then completes), each rule, consent, plan parsing, Bee event mapping, incident grouping, real Bee transcript fragments, SOS detail, the dispatcher (reminders, acknowledgement, failing channels) and the emergency-number guard. API behaviour was checked with an end-to-end script and in the browser at desktop and phone width.

## 11. Known gaps and risks

| Gap | Impact |
|---|---|
| Never run against a real Bee; stream payload format unverified | Blocks the Bee track demo |
| Windows CLI binary not in the npm package | Needs manual download (documented) |
| Bedrock path never executed | Falls back to a template |
| No real auth, storage, delivery or deployment | Prototype only |
| Child feed is synthetic | Must stay labelled; real source is roadmap |
| Credit and ownership of Ayaan's original concept | Ask organizers; rules require sole ownership by the entrant |

## 12. Proactive SOS (added 2026-10-16)

```
Engine raises alert ──► AlertDispatcher.sync(alerts, now) ──► channels (in-app, Bee reminder, SMS)
                              │ new / update / reminder
                              └─ stops when the parent acknowledges
Parent taps "Create live link" ──► /s/<token> (read-only, 2 h, revocable) for a responder
```

- `sosdetail.ts` builds the content; `sos.ts` assembles the payload; `dispatcher.ts` decides who is told and when; `channels.ts` (server) talks to the outside world.
- Messages come in three sizes: SMS-length, a full-detail text, and a short brief a parent can read to a dispatcher.
- Safety rules: emergency numbers are never dialled or messaged (`isEmergencyNumber` guard on every channel); the responder link exposes only position, movement and the child's description; the SOS always lists what is not known.
- Honest labelling: when the feed is simulated, the SOS says so in "What we do not know".

## 13. Interface philosophy (redesigned 2026-10-17)

The first interface was a dark, map-first dashboard, which felt like a tracker. The app's promise is the opposite ("an armor that lets children be children"; understand whether a child may need help, not only where they are), so the interface was rebuilt around the *protective thread* (the "sutra").

- **Calm by default.** One warm sentence ("Aarav is at Smith Middle School.") and a plain line about the plan. The map stays closed unless the parent opens it or something needs attention, which respects the child.
- **The Day Thread.** The day is a vertical thread of knots (places, walks, rides), newest first. A dashed stretch means the signal was lost; a dotted hollow knot at the top is where the child is expected next.
- **Three moods, three tones.** Calm (sage), "Worth a look" (amber), "Needs you now" (restrained red). The headline changes ("Aarav has not checked in as expected." vs "Aarav may need help.") instead of shouting.
- **Explain, then act.** An alert shows what we noticed, then Expected / What we know / What we do not know, then three calm numbered steps. Emergency numbers are text only.
- **Your Bee has a voice.** What the Bee heard is quoted and confirmed by the guardian ("I understood: Expected back at Home by 5:30 PM").
- **Honest labels.** A chip says "Demo feed, not a real tracker" whenever the feed is simulated.
- **Demo controls live in a drawer**, out of the product's way.
- Files: `apps/web/src/` `Hero.tsx`, `DayThread.tsx`, `BeeVoice.tsx`, `SosCard.tsx`, `DemoDrawer.tsx`, `state.ts`, `styles.css`. Follows the system light or dark theme; respects reduced motion; no horizontal overflow at 375 px.

## 14. Interface v2: friendly and playful (2026-10-18)

The elegant "Day Thread" look was replaced with something warmer, built from a mock the owner drew.

- **First screen:** the map on the left and three big organic blobs on the right: coral "Ask About Aarav", orange "Aarav's Summary", yellow "Check-in" (dark text on yellow for contrast). The blobs gently morph and bounce on hover. If something needs attention, a banner rises over the map and the Check-in blob gets a "!".
- **Pages (hash routes):** `#/` landing, `#/checkin` (status sentence, explained alert, plan, how we reached you), `#/summary` (colorful numbers, short story, the day thread), `#/ask` (chat with instant local answers), `#/bee`.
- **The Bee page:** when the guardian talks to their Bee about the child, the screen jumps to a chat: "You said", Bee's reply (the understood plan with Yes / Not quite, an answer, or a gentle "I could not find a time"), and "Aarav right now". It appears while the guardian is still talking (dots), and closes itself after 40 s unless a plan is waiting for a yes.
- **Privacy rule for the Bee page:** a Bee hears everything nearby, so only speech that is about the child (his name or a spelling variant, a pick-up or schedule word, a question about him) ever reaches the server's `voice` state or the screen. Everything else is dropped from memory after the 45 s assembly window and is never shown or stored. Core: `isRelevantNote`, `isQuestionAboutChild`. Server: `voice` in `/api/state`, `POST /api/voice/dismiss`.
- **Look:** black canvas, coral / orange / yellow / mint, Nunito (rounded) font, big radii, bouncy motion that respects reduced-motion, a few emoji.
- This replaces the earlier "map closed by default" idea: the map is now the first thing the parent sees, by the owner's design.
- Files: `Landing.tsx`, `Page.tsx`, `CheckinPage.tsx`, `SummaryPage.tsx`, `AskPage.tsx`, `BeePage.tsx`, `App.tsx` (hash router, voice switching), `Hero.tsx` (shared status sentence), `MapView.tsx` (avatar pin, thread-yellow trail), `styles.css`.

## 15. Interface v3: Apple-style, Catppuccin, expanding (2026-10-19)

The blob look (section 14) was replaced at the owner's request: straight lines and squiggles instead of blobs, copy Apple's UI, make it dynamic with an expanding view, Catppuccin colors.

- **Colors:** Catppuccin Mocha in dark mode and Latte in light mode, following the system. Mapping: Ask = red, Summary = peach, Check-in = yellow, Bee = mauve, "you" bubbles and actions = blue, all-good = green. Text on accent fills uses `--on-accent` (crust in Mocha, base in Latte). The map reads these colors from the theme, and its dark tiles are filtered to sit well with Mocha.
- **Apple structure:** SF-style type (`-apple-system`, with Inter standing in elsewhere), large titles that shrink into a translucent blurred bar on scroll, inset grouped cards, hairline dividers, tinted buttons, a segmented control (Summary range), iMessage-style chat bubbles, iOS spring easing, and continuous ("squircle") corners where the browser supports `corner-shape`.
- **Straight lines and squiggles:** tiles are straight-edged rounded rectangles with an accent line on top; hairlines separate rows; a squiggle (`Squiggle.tsx`) underlines every large title and decorates tiles. In the Day Thread the line is straight where the day is known, wavy where the signal was lost, and dotted where he is expected next. A drifting squiggle is the "listening" and "thinking" indicator.
- **Expanding view:** each tile, and the status pill, grows from its own position into a full-screen sheet (`Sheet.tsx`, 520 ms spring) and shrinks back the same way, like an App Store card. Routes still work (`#/checkin`, `#/summary`, `#/ask`, `#/bee`); Escape, the back chevron or the scrim close it.
- **Dynamic:** tiles show live previews (status sentence, distance and stops, last signal). The pill at the top of the map changes with what is happening: calm, wider and yellow for "worth a look", red for urgent, and purple with a live squiggle while the guardian is talking to their Bee. The Bee conversation grows out of that pill.
- Files: `Landing.tsx` (map, pill, tiles, sheet host), `Sheet.tsx`, `Squiggle.tsx`, `Icons.tsx` (line icons in the spirit of SF Symbols), `Page.tsx`, `styles.css`.
- **Not verified:** the animation smoothness. The preview browser used in development renders about 2 frames per second when unfocused, so the transitions were checked for correctness (sizes, durations, states) but not judged by eye.

## 16. Interface v4: fun to see and to operate (2026-10-22)

Inspired by a screenshot of a playful, gamified learning site the owner shared. The structure from v3 (Catppuccin colors, expanding sheets, large titles, squiggles, chat bubbles) stays; a fun layer sits on top.

- **Chunky 3D:** buttons, chips, cards and tiles have a thick bottom "lip" and press down when tapped (`translateY` plus a shrinking shadow). Primary actions are green with uppercase labels; secondary ones are dark with a bright outline. Headlines and buttons use Baloo 2; body text uses Nunito.
- **Saturated tiles:** Ask (red), Summary (peach) and Check-in (yellow) are bright cards with an eyebrow label, an emoji, a bold title and a live preview, like the "Class 1 / 2 / 3" cards in the reference. In light mode (Latte) they are tinted instead, to keep the text readable.
- **Beera, the bee mascot** (`Beera.tsx`, original artwork): the face follows the situation. Smiling when all is well, curious for "worth a look", frowning and serious for an alert, an open mouth while you talk, and cheering when Aarav is home. Beera has a speech card at the top of the tile column, sits in the status card, and is the avatar of Bee's chat bubbles.
- **Celebrations for good news only** (`fx.ts`, `FxLayer.tsx`): confetti and a toast when a plan is saved, and a bigger burst when Aarav gets home as planned; a short vibration on phones. Alerts never get confetti, jokes or sound. Reduced-motion users get the toast without the confetti.
- **Alive:** numbers count up; page content bounces in one piece after another; a countdown chip shows "Home in 12 min" or "15 min overdue" (`planClock`); tiles wiggle on hover.
- Light and dark mode follow the system (Latte / Mocha). The Demo button is hidden while an expanded view is open.

## 17. Interface v5: refined (2026-10-22)

The v4 "fun" layer (chunky 3D buttons, saturated tiles, a large mascot, uppercase Baloo type, emoji) read as too cartoonish. The owner asked for something sleeker and more professional, closer to v3. The interface is now the v3 base (Catppuccin, Apple-style, expanding views, squiggles, Inter / San Francisco type, tinted tiles with a thin accent line, small line icons) plus a few quiet touches kept from v4:

- Beera is now a small face in a slim status row, on the status card and as the chat avatar, not a mascot card. Its expression still follows the situation.
- Soft translucent chips on the map ("Home in 12 min", "Last signal 2 min ago") with a thin tone ring.
- Numbers count up, and page content settles in with a short, gentle rise.
- A quieter celebration for good news only: a small confetti burst and a translucent toast ("Plan saved. I'll watch the clock."). Never for alerts.
- The status pill is dark in both color modes (it was unreadable in light mode); the Demo button sits at the bottom of the map and is hidden while an expanded view is open; decorative squiggles hide on short screens.

## 18. Real mode and the simulator (2026-10-22)

**Goal:** follow one real child without a native app, and demonstrate every scenario without anyone walking outside.

- **Location source.** The child's iPhone runs OwnTracks (free) in low-battery "significant changes" mode with place enter/leave events. It POSTs JSON over HTTPS to `/ingest/owntracks`; `ownTracksToPing` (core) validates and trims every field and drops anything unknown. The phone's own place events are trusted as truth for arrivals and departures.
- **Rules for sparse data.** A plain iPhone has no heart rate and reports every few minutes, so the vehicle-speed, sudden-stop, hours-still, heart-rate and voice rules are off by default in real mode (`rules.disabled` in `family.json`). Late arrival, flagged areas, silence and battery stay on. The simulator turns every rule on because it stands in for a continuous feed such as a Bee.
- **One address.** The server also serves the built web app, so a single Cloudflare quick tunnel carries the app, the API and the phone intake. It listens on `127.0.0.1` only; the tunnel connects locally, and forwarded-address headers are only believed from a local connection.
- **Private data.** `data/` (git-ignored, mode 0600) holds `family.json` (profile, places, contacts, child photo, family code, the phone's separate send-only login) and `state.json` (the saved day, restored after a restart).
- **Access.** The parent signs in with the family code. Wrong guesses are rate-limited per address. The phone's login can only send locations. The app is served with a strict Content-Security-Policy.
- **Setup screen.** Places are picked on the map, with the iPhone link and QR code, an ntfy push topic with a test button, trusted contacts (emergency numbers are refused), and the child's photo (shrunk to 128 px in the browser, shown only to the parent).
- **Simulator (`scripts/sim.mjs`).** Starts a private copy of real mode (port 8788, `data-sim/`) and replays a child's phone along real roads and footpaths, learned once from free public routing servers and cached. Scenarios: school run, pick-up, late and arrive (using the plan the guardian's Bee created), wrong place, sudden stop, no movement, signal lost. Long scenarios are back-dated and played instantly.
- **Bee in real mode.** With the Bee CLI installed, the simulator server reads the guardian's live Bee. Spoken notes become proposed plans, a confirmed plan writes a reminder back to Bee todos, and Bee's mis-hearings of the child's name are handled with name aliases.

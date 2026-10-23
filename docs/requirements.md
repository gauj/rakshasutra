# RakshaSutra: Requirements

Status as of 2026-10-15. "Built" means implemented and covered by tests or a run; "Not built" means planned.

## 1. Purpose

RakshaSutra is an AI safety companion for families. A guardian wears a Bee wearable. Bee hears the day's plan, RakshaSutra turns it into a proposed plan, the guardian confirms it, and a safety engine judges the child's check-ins against that plan. Alerts say what was expected, what is known, and what is not, and never present missing data as confirmed danger.

Origin: a student's LogIQids TechFest deck (passive RFID stickers read at FASTag toll gates). This version replaces passive RFID with an active wearable and a parent app.

Target: Amazon "Build, Ship, Shape" Developer Hackathon, Bee (Wearable AI) track, plus the AWS Builder and Open Source mini-challenges. Deadline: Friday 23 Oct 2026, 12:00 pm Pacific (2:00 pm Central).

## 2. Users

| User | Needs |
|---|---|
| Guardian (adult, wears Bee) | Speak plans naturally; confirm them; get an alert only when something is unexpected; know what to do next |
| Child (under 18) | Wears or carries a separate location source; must never be asked to use Bee |
| Trusted caregiver (roadmap) | Receives selected alerts when the guardian chooses |

## 3. Constraints that shape the design (verified)

| Constraint | Source | Consequence |
|---|---|---|
| Bee app is rated 18+, so a child cannot be the Bee user | App Store listing (Bee terms clause not directly verified) | Adult guardian wears Bee; child's feed comes from another source |
| Entrants must be of age of majority | Hackathon rules section 3 | Ayaan cannot be an entrant or team member; credit needs organizer guidance |
| Bee track needs data from a real Bee or an Apple Watch running Bee software | Rules, Bee track requirements | A simulated Bee does not qualify; the demo video must show live Bee data |
| Must use Bee's CLI, MCP, or Agent Skills at runtime | Rules | The server uses the official CLI library, not raw REST |
| No documented heart rate, motion, battery or continuous GPS from Bee | Bee docs, bee-cli README | Those signals are simulated and labelled |
| Repo public with a visible licence, or private and shared with testing@devpost.com and listed Amazon accounts | Rules | MIT licence added; repo currently private |

## 4. Functional requirements

Status key: B = built, P = partly, N = not built.

### 4.1 Bee context (guardian)

| ID | Requirement | Status |
|---|---|---|
| F1 | Stream the guardian's spoken utterances from Bee via the CLI library | P (code written, not yet run against a real Bee) |
| F2 | Parse a schedule note into a proposed plan: expected zone, time, title, plain-language reading, confidence | B (tested) |
| F3 | Handle "6 instead of 5:30" and "running late" (shift active plan), and ignore unrelated notes | B |
| F4 | A proposed plan has no effect until the guardian confirms; a newer proposal replaces older unconfirmed ones | B |
| F5 | Write a reminder back to Bee todos after confirmation | P (code written, not run) |
| F6 | Process utterances in memory; keep only schedule proposals | B (by design) |

### 4.2 Safety engine

| ID | Requirement | Status |
|---|---|---|
| F7 | Derive speed, heading and motion mode from location pings | B |
| F8 | Score signals (watch 1, warning 3, critical 6) into a tier: safe, watch, warning, critical | B |
| F9 | Rules: missed expected check-in, walking-to-vehicle, silence, sudden stop, heart rate over 180 or under 30, flagged area, 3 h stationary, leaving a safe place at night, low battery, distress phrase | B |
| F10 | Suppress rules inside safe zones and at known pick-up points | B |
| F11 | Cooldown, escalation, and follow-ups that group into one incident and carry earlier evidence | B |
| F12 | Late-arrival alert states what was expected, last confirmed place, data age, and "does not confirm an emergency" | B |
| F13 | Honour consent: no location consent means nothing stored; heart rate and voice only if opted in | B |

### 4.3 Alerts and reports

| ID | Requirement | Status |
|---|---|---|
| F14 | SOS payload: reason, position, speed, heading, predicted 10-minute path, 3 h trail, last movement, vitals, nearest help, emergency numbers, SMS text, recommended actions | B |
| F15 | Acknowledge an alert or mark it a false alarm | B |
| F16 | On-demand wellbeing report (distance, stays, incidents, coverage, narrative) | B |
| F17 | AI-written report and free-form questions through Amazon Bedrock | P (code written, not run; template fallback works) |
| F18 | Proactive delivery to the parent: new, update and bounded reminder messages on in-app, Bee reminder and SMS (Amazon SNS) channels | P (dispatcher tested; Bee and SNS channels opt-in, not verified live) |
| F25 | SOS detail: plain-language location, 3-hour timeline, distance, top speed, heart-rate summary, battery drain, unknowns, responder brief with description and medical notes, backup contacts | B |
| F26 | Acknowledgement holds the same situation quiet; reminders stop | B |
| F27 | Revocable, 2-hour, read-only live link for responders showing minimal data | B (local network only) |
| F28 | Emergency numbers are display-only: never dialled, never a message destination, in tests or demos | B (enforced in code) |
| F29 | First screen: map plus three blobs (Ask About, Summary, Check-in); attention banner when something needs a look | B |
| F30 | The screen switches to a Bee page when the guardian talks about the child: what they said, what Bee understood or answered, and what the child is doing | B (typed path tested; live speech path built, not yet rehearsed) |
| F31 | Only speech about the child is ever shown or kept; ordinary conversation near the Bee never reaches the screen | B (tested) |

### 4.4 Parent app

| ID | Requirement | Status |
|---|---|---|
| F19 | Live map: trail, safe and flagged zones, last position, predicted path | B |
| F20 | Plan card: confirm or reject proposals; show the active plan | B |
| F21 | SOS card first on screen, including on a phone; shows "conditions cleared" when back to normal | B |
| F22 | Alert history grouped by incident | B |
| F23 | Report and question box | B |
| F24 | Demo controls: scenario picker, speed, progress, Bee status chip | B |

### 4.5 Demo scenarios

| Scenario | Purpose |
|---|---|
| The unexpected delay (Bee notes) | Headline: plan from a note, missed check-in, changed plan, arrival |
| Walk home goes wrong | Escalation: vehicle pick-up, distress, sudden stop, silence |
| A normal school day | Proves no false alarms |

### 4.6 Not building (deliberate)

Alerting nearby strangers who own a Bee. No supported API exists, and it would expose a child's identity and location. Roadmap instead: a parent-curated trusted circle and a hand-off packet to emergency services.

## 5. Non-functional requirements

| ID | Requirement | Status |
|---|---|---|
| N1 | Privacy: location visible to the parent account only; consent flags; voice off by default in a real deployment | P (demo token only) |
| N2 | Explainability: every alert says why it fired and what is unknown | B |
| N3 | Honesty: simulated inputs are labelled; typed notes are marked "not from Bee" | B |
| N4 | Works at phone width; critical alert is the first thing visible | B |
| N5 | Real authentication, persistence, deployment on AWS | N |
| N6 | Clear setup and run instructions in the repo | B (README) |

## 6. Hackathon submission checklist

- [ ] Real Bee login and live-data run (blocking)
- [ ] Demo video under 3 minutes on YouTube or Vimeo, showing live Bee data and the app working; no third-party trademarks or copyrighted music
- [ ] Text description of features and functionality
- [ ] Repo link with setup instructions; public with MIT licence visible, or private and shared with the listed accounts
- [ ] Product feedback for each tool used (see `docs/FRICTION_LOG.md`); friction log scores up to a 10% bonus
- [ ] Track: Bee. Mini-challenges: AWS Builder (Bedrock, AgentCore, Strands or Kiro Crew with a documented integration) and Open Source (contribution URL, repo URL, GitHub username, description)
- [ ] Explain what was newly built during the submission period

## 7. Acceptance test for the headline demo

1. Guardian says a schedule note to a live Bee; a proposal appears with the correct time.
2. Guardian confirms; a reminder appears in Bee.
3. Child's feed goes silent; 15 minutes after the expected time an alert fires with the explanation text.
4. Guardian says a changed time; the alert clears after confirmation.
5. Child arrives home; the plan shows completed; exactly one alert in the history.

## 8. Real use and the simulator (added 2026-10-22)

| ID | Requirement | Status |
|---|---|---|
| R1 | Follow a real child's iPhone through OwnTracks over HTTPS, with place enter and leave events | B (tested with synthetic reports; not yet with a real phone) |
| R2 | Parent-only access: family code, constant-time compare, per-address rate limit; the phone has a separate send-only login | B (tested) |
| R3 | Validate, trim and size-limit everything the phone sends; unknown fields are dropped | B (tested) |
| R4 | Private data kept in a git-ignored folder with restricted permissions; the saved day survives a restart | B (tested) |
| R5 | Setup screen: places on a map, iPhone QR link, ntfy push with a test, contacts (no emergency numbers), child photo | B |
| R6 | Push messages contain no location and no name by default | B |
| R7 | Server listens on this computer only by default; strict Content-Security-Policy; no framing | B |
| R8 | Simulator plays the phone along real roads and footpaths for seven scenarios, without touching real data | B (tested) |
| R9 | Notes spoken as Bee really transcribes them ("from the school at 5 p. m.", a misheard name) become proposed plans | B (tested) |
| R10 | A real iPhone run, and the Bedrock narrator on a real AWS account | N |

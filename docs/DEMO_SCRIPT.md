# Demo video script (under 3 minutes)

Honest framing, said once at the start: **no Bee wearable was used. An iPhone feed, played by the simulator, stands in for the Bee**, and the guardian's spoken notes are typed into the app. Everything else is the real app: real intake, real rules, real roads.

## Before recording

1. `npm run sim:serve` (leave running), open http://localhost:8788, sign in with the code it printed.
2. **Privacy:** the map shows Ayaan's real Home and School. For a public video, either blur the map or change Home, School and CTE Center in `data-sim/family.json` to nearby public places. Do not show the family code or the Set up page.
3. Browser at 1280x720, dark theme, notifications off. Rehearse once with `--speed 60` so the playback takes a few seconds.

## Beats

| Time | Say | Do |
|---|---|---|
| 0:00 | "Child safety devices wait for a child to press a button. RakshaSutra does not wait." | Home screen, calm status |
| 0:15 | "Ayaan's phone stands in for a Bee. Every report goes through a login-protected intake, like the real thing." | `npm run sim -- school-run`: the trail follows the real road, Ayaan arrives at School, no concerns |
| 0:40 | "Pick-up is expected, so nothing fires." | `npm run sim -- pickup` (fast) |
| 0:55 | "Now the day goes wrong. A pick-up is planned for after CTE class." | `npm run sim -- late`: leaves CTE on foot, a plan is confirmed overdue |
| 1:20 | "The app explains why it is worried and what it does not know." | Open the alert: reasons, last confirmed place, "does not confirm an emergency", no emergency number is ever dialed |
| 1:40 | "The parent is told with no location in the push message." | Show the ntfy test push or the delivery list |
| 1:50 | "He walks back, you pick him up, it resolves itself." | `npm run sim -- arrive`: plan completed, concern clears |
| 2:05 | "Other things we watch for." | `wrong-place` (flagged area), `sudden-stop` (vehicle speed then an abrupt stop), `no-movement` (3 hours still): one alert each, a few seconds each |
| 2:35 | "Ask in plain words." | Ask tile: "Where is Ayaan now?" |
| 2:50 | "Open source, TypeScript, built for AWS." | Repo link and the AWS pieces |

## Claims to avoid

- Do not say a Bee was used, or that anyone nearby is alerted automatically.
- Do not say heart rate was measured: a phone has none.
- Do not show a live iPhone track unless Ayaan agreed and the location is blurred.

## Still open for submission

AWS Builder piece, Open Source contribution, Devpost text, product feedback and friction log (see `docs/FRICTION_LOG.md`). Deadline: Fri 23 Oct 2026, 12:00 pm PT.

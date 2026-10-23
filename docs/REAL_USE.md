# Using RakshaSutra for real (Adam's iPhone)

Real mode follows one actual child's iPhone instead of the demo feed. Everything stays on the parent's computer.

## What you need

- This laptop, switched on and awake while Adam is out.
- Adam's iPhone with the free **OwnTracks** app (App Store).
- A free **Cloudflare quick tunnel** (`cloudflared`) so the phone can reach this laptop over HTTPS.
- Optional: the free **ntfy** app on the parent's phone for push alerts.

## One-time setup

1. `npm install`
2. `npm run setup:real -- --name Adam --age 13 --tz -300`
   Prints the **family code** (the parent's sign-in). Settings and codes are saved in `data/`, which is git-ignored. Never share or commit it.
3. `npm run start:real` builds the web app and starts the server on http://localhost:8787.
4. In a second window, open the tunnel (install `cloudflared` first; it is a download, so install it yourself from Cloudflare's site):
   `cloudflared tunnel --url http://localhost:8787`
   It prints an address like `https://something.trycloudflare.com`. A quick tunnel gets a **new address every run**, so repeat steps 5 to 7 each time you restart it.
5. Open that address in the parent's browser and sign in with the family code.
6. Open **Set up** (the gear icon). Add Home, School, Robotics Center and any regular place (tap the map, set the radius, name it). Add a trusted contact. Optionally enter an ntfy topic and press **Send a test push**.
7. On Adam's iPhone: install OwnTracks, then scan the QR code on the Set up page (or send him the link and tap it). It fills in the address, login, low-battery mode and the places. When asked, allow location **Always** and **Precise**, and keep Background App Refresh on.
   If the places do not appear in OwnTracks, add them by hand under Regions using the same names.

## What to expect

- Mode is OwnTracks **significant changes** plus place enter/leave events: low battery, but silent while he is still, and reports come every few minutes or hundreds of metres, not every second.
- iPhone has no heart rate, so the heart-rate and voice rules are off. Rules that cry wolf on real kids (vehicle, sudden stop, hours-still) are off too.
- The headline use case works: a plan ("pick up at 5:30"), a place-based arrival or departure, and a late-arrival alert if he has not arrived.
- Push messages contain no location and no name. Open the app for details.
- The app never dials or messages an emergency number. 911 is display-only, by design and in code.

## Privacy and consent

- Tell Adam it is on and what it sees. He can see the same data in OwnTracks.
- Only the family code opens the app. Wrong guesses are rate-limited (10 a minute, then a one-minute block).
- The phone has its own separate login that can only send locations.
- If you record the demo video, use a throwaway profile or blur the map: it shows a real child's location.

## Checks

- `npm test` (56 unit tests), `npm run e2e` (demo API), `npm run e2e:real` (real mode with synthetic OwnTracks reports; no phone needed).
- Not yet verified: a real iPhone run, and OwnTracks's handling of the `waypoints` in the config link.

## Simulator: play Adam's phone from the laptop

No walking needed. The simulator starts a **private copy** of real mode (port 8788, folder `data-sim/`, git-ignored) and sends the same OwnTracks reports an iPhone would, through the same login-protected intake. Your real setup in `data/` is never touched, and nothing is sent to anyone (no push topic; emergency numbers are display-only).

1. `npm run sim:serve` (leave it running). It prints a family code for the simulator. Open http://localhost:8788 and sign in.
2. In another window: `npm run sim -- <scenario>`

| Scenario | What happens | What the app should say |
|---|---|---|
| `school-run` (or `walk`) | You drop Adam Home to School along the real roads | Nothing to worry about |
| `pickup` | You pick him up from School and drive Home | Nothing to worry about |
| `late` | Leaves the CTE Center on foot, does not head home, an overdue pick-up plan is confirmed | Expected check-in did not happen |
| `arrive` | Walks back to CTE, you pick him up and drive Home (play after `late`) | Plan completed, concern cleared |
| `wrong-place` | Walks from School to the parent-flagged Abandoned lot | In flagged area |
| `sudden-stop` | Walks, then vehicle speed away from a pick-up point, then stops abruptly | Walking to vehicle speed + Sudden stop |
| `no-movement` | Not moved for 3+ hours outside a safe place (back-dated, instant) | Not moving for hours |
| `signal-lost` | Phone goes silent for 3+ hours (back-dated, instant) | Signal lost |

Each scenario starts a clean day (the simulator restarts its server), except `arrive`. All rules are on in the simulator because it stands in for a continuous feed like a Bee; the real iPhone setup keeps the noisy ones off. `--speed N` changes the playback speed (not for `no-movement` or `signal-lost`).

Routes follow real roads and footpaths. The simulator asks free public routing servers (OSRM, routing.openstreetmap.de) once for each route, then caches it in the git-ignored `data/routes.json`. Home, School and CTE Center come from `data/family.json`, so no address is in the repository.

# Contributing

Thank you for helping. RakshaSutra is a calm, parent-only safety companion. Contributions are welcome if they keep to these rules.

## Ground rules
1. **Privacy by default.** Location and data are visible to the parent only. A feature that widens who can see data needs an explicit, documented reason.
2. **No real family data in the repo, ever.** No real names, addresses, coordinates of a home, access codes, tokens or keys. The demo uses a fictional child ("Adam") and a generic home. `node scripts/check-secrets.mjs` runs in CI and must pass.
3. **Emergency numbers are display-only.** The app never dials or messages emergency services, in code, tests or demos.
4. **Deterministic safety.** The engine decides when to alert, with rules that can be tested. AI may only write the wording.
5. **US units on screen** (miles, mph, feet); data stays metric inside.

## Workflow
```
npm ci
npm run typecheck && npm test
npm -w @rakshasutra/web run build
```
Add or update tests with your change, keep pull requests small, and describe the privacy impact.

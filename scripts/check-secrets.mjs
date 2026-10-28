// Fails if any tracked file looks like it holds a secret or a real family's details.
//   node scripts/check-secrets.mjs
// Extra personal strings can be supplied privately, e.g. CHECK_BLOCKLIST="Surname,Street Name" (never commit them).
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";

const FORBIDDEN = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "a private key"],
  [/AKIA[0-9A-Z]{16}/, "an AWS access key"],
  [/ghp_[A-Za-z0-9]{20,}/, "a GitHub token"],
  [/eyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{10,}/, "a login token (JWT)"],
  [/owntracks:\/\/\/config\?inline=[A-Za-z0-9+/=]{40,}/, "a real OwnTracks setup link"],
  [/[A-Za-z]:[\\/]Users[\\/]/, "a local Windows path"],
  [/[\w.+-]+@(gmail|outlook|hotmail|yahoo)\.com/i, "a personal email address"],
];
for (const w of (process.env.CHECK_BLOCKLIST || "").split(",").map((s) => s.trim()).filter(Boolean)) {
  FORBIDDEN.push([new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), `the blocked word "${w}"`]);
}

const files = execFileSync("git", ["ls-files"], { encoding: "utf8" }).split("\n").filter(Boolean);
const problems = [];
for (const f of files) {
  if (/\.(png|jpe?g|webp|ico|woff2?)$/i.test(f) || statSync(f).size > 2_000_000) continue;
  const text = readFileSync(f, "utf8");
  for (const [re, what] of FORBIDDEN) if (re.test(text)) problems.push(`${f}: contains ${what}`);
}
if (problems.length) {
  console.error("Found things that must not be in this repository:\n  " + problems.join("\n  "));
  process.exit(1);
}
console.log(`No secrets or private details found in ${files.length} files.`);

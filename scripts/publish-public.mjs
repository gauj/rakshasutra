// Publishes a clean snapshot of the private repo's committed files to the separate PUBLIC repo.
//
// Why a separate repo: GitHub visibility belongs to a whole repository, not a branch, so the private repo (where
// work continues) can never be made partly public. This copies what is committed on the current branch, leaves out
// internal notes, refuses to continue if anything personal or secret-looking is found, and pushes it as one new commit.
//
// Usage:  node scripts/publish-public.mjs            (review, commit and push to the public repo)
//         node scripts/publish-public.mjs --dry-run  (do everything except commit and push)
// Setup:  the public repo is a sibling folder, ../rakshasutra-public, created on first run.

import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.resolve(root, "..", "rakshasutra-public");
const REMOTE = process.env.PUBLIC_REMOTE || "https://github.com/gauj/rakshasutra.git";
const dryRun = process.argv.includes("--dry-run");

const run = (cmd, args, cwd = root) => execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }).trim();
const fail = (msg) => {
  console.error("\nStopped: " + msg);
  process.exit(1);
};

// Internal working notes stay private.
const LEAVE_OUT = ["docs/HANDOFF.md"];

// Anything matching these must never reach a public repository.
const FORBIDDEN = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "a private key"],
  [/AKIA[0-9A-Z]{16}/, "an AWS access key"],
  [/ghp_[A-Za-z0-9]{20,}/, "a GitHub token"],
  [/eyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{10,}/, "a login token (JWT)"],
  [/owntracks:\/\/\/config\?inline=[A-Za-z0-9+/=]{40,}/, "a real OwnTracks setup link"],
  [/[A-Za-z]:[\\/]Users[\\/]/, "a local Windows path"],
  [/[\w.+-]+@(gmail|outlook|hotmail|yahoo)\.com/i, "a personal email address"],
];
// Extra personal strings can be supplied privately, e.g. PUBLIC_BLOCKLIST="Surname,Street Name"
for (const w of (process.env.PUBLIC_BLOCKLIST || "").split(",").map((s) => s.trim()).filter(Boolean)) {
  FORBIDDEN.push([new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), `the blocked word "${w}"`]);
}

if (run("git", ["status", "--porcelain", "--untracked-files=no"])) fail("the private repo has uncommitted changes. Commit them first; only committed files are published.");
const sha = run("git", ["rev-parse", "--short", "HEAD"]);

// 1. Export exactly what is committed (so git-ignored private folders can never come along).
const tmp = mkdtempSync(path.join(tmpdir(), "rakshasutra-export-"));
const tarFile = path.join(tmp, "export.tar");
execFileSync("git", ["archive", "--format=tar", "-o", tarFile, "HEAD"], { cwd: root });
const staged = path.join(tmp, "tree");
mkdirSync(staged);
// Relative paths, run inside the temp folder: GNU tar reads "C:\..." as a remote host name.
const tar = spawnSync("tar", ["-xf", "export.tar", "-C", "tree"], { cwd: tmp });
if (tar.status !== 0) fail("could not unpack the export (tar is needed; it ships with Windows 10 and later).");
for (const f of LEAVE_OUT) rmSync(path.join(staged, f), { force: true });

// 2. Refuse to publish if anything looks private.
const problems = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (statSync(p).size < 2_000_000 && !/\.(png|jpe?g|webp|ico|woff2?)$/i.test(name)) {
      const text = readFileSync(p, "utf8");
      for (const [re, what] of FORBIDDEN) if (re.test(text)) problems.push(`${path.relative(staged, p)}: contains ${what}`);
    }
  }
};
walk(staged);
if (problems.length) fail("found things that must not be public:\n  " + problems.join("\n  "));

// 3. Put the snapshot into the public repo's folder, keeping its .git.
if (!existsSync(path.join(out, ".git"))) {
  mkdirSync(out, { recursive: true });
  run("git", ["init", "-b", "main"], out);
  run("git", ["remote", "add", "origin", REMOTE], out);
} else {
  run("git", ["fetch", "origin"], out);
  run("git", ["checkout", "-f", "-B", "main", "origin/main"], out); // -f: the folder is only ever a copy, so leftovers from an earlier run are discarded
}
for (const name of readdirSync(out)) if (name !== ".git") rmSync(path.join(out, name), { recursive: true, force: true });
cpSync(staged, out, { recursive: true });
rmSync(tmp, { recursive: true, force: true });

const changes = run("git", ["status", "--porcelain"], out);
if (!changes) {
  console.log("The public repo is already up to date with commit " + sha + ".");
  process.exit(0);
}
console.log(`Snapshot of private ${sha} copied to ${out}\n${changes.split("\n").length} changed paths.`);
if (dryRun) {
  console.log("Dry run: nothing committed or pushed.");
  process.exit(0);
}

// 4. One commit, as the author's GitHub noreply address (set PUBLIC_AUTHOR_EMAIL), then push.
const email = process.env.PUBLIC_AUTHOR_EMAIL || run("git", ["config", "user.email"]);
run("git", ["add", "-A"], out);
run("git", ["-c", `user.name=${run("git", ["config", "user.name"])}`, "-c", `user.email=${email}`, "commit", "-m", `Sync from private main ${sha}`], out);
run("git", ["push", "-u", "origin", "main"], out);
console.log("Published to " + REMOTE);

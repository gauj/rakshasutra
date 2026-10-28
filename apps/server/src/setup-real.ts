import { DATA_DIR, familyExists, loadFamily, newFamily, saveFamily } from "./family.js";

// Usage: npm run setup:real -- --name Adam --age 13 [--tz -300] [--force]
//        npm run setup:real -- --show     (print the family code again)
const args = process.argv.slice(2);
const opt = (k: string) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const name = opt("name");
const age = Number(opt("age"));
const tz = opt("tz") !== undefined ? Number(opt("tz")) : -300;

if (args.includes("--show")) {
  const f = familyExists() ? loadFamily() : undefined;
  if (!f) {
    console.error(`Nothing is set up yet in ${DATA_DIR}. Run: npm run setup:real -- --name Adam --age 13`);
    process.exit(1);
  }
  console.log(`\n  Family code for ${f.child.name} (type this into the app to sign in):\n\n      ${f.secrets.parentToken}\n`);
  process.exit(0);
}

if (familyExists() && !args.includes("--force")) {
  const f = loadFamily()!;
  console.log(`Already set up for ${f.child.name}. Settings are in ${DATA_DIR}`);
  console.log("To see the family code again, run: npm run setup:real -- --show");
  console.log("To start over (this replaces the access codes), run again with --force.");
  process.exit(0);
}
if (!name || !Number.isFinite(age) || age < 4 || age > 17) {
  console.error("Usage: npm run setup:real -- --name Adam --age 13 [--tz -300] [--force]");
  console.error("(--tz is the child's time zone in minutes from UTC; Texas in summer is -300.)");
  process.exit(1);
}

const f = newFamily(name, age);
f.child.tzOffsetMin = Number.isFinite(tz) ? tz : -300;
saveFamily(f);

console.log(`\nCreated the private settings for ${f.child.name} in ${DATA_DIR}`);
console.log("That folder is git-ignored: it holds the access codes and, later, the saved day. Never share it.\n");
console.log(`  Family code (type this into the app to sign in):\n\n      ${f.secrets.parentToken}\n`);
console.log("Next:");
console.log("  1. npm run start:real          (builds the app and starts the server)");
console.log("  2. In another window, open a tunnel so the iPhone can reach it (see docs/REAL_USE.md)");
console.log("  3. Open the tunnel's address, sign in with the family code, then use Set up to add home, school and the iPhone.\n");

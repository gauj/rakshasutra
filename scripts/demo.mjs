// Starts the app in DEMO mode on its own port, for recording the video: a fictional child, a fictional neighbourhood,
// no real data, and a time-lapse bar to play, pause, drag or jump through the school day.
// If the Bee CLI is installed in tools/bee-cli, your live Bee is read too (the opening "say a note to your Watch" moment).
//
//   npm run demo          then open http://localhost:8789 and press "Play a school day with Bee"
//
// Nothing here touches data/ or sends anything to anyone; emergency numbers are display-only as everywhere.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = process.env.DEMO_PORT || "8789";
const bee = path.join(root, "tools", "bee-cli", process.platform === "win32" ? "bee.exe" : "bee");
const useBee = !process.argv.includes("--no-bee") && existsSync(bee);

const env = {
  ...process.env,
  FORCE_DEMO: "1",
  PORT,
  NTFY_TOPIC: "",
  BEE_ALERTS: "",
  PUBLIC_URL: "",
  BEE_NOTES: useBee ? "1" : "",
  BEE_CLI_BINARY: useBee ? bee : "",
};

console.log(`Demo mode on http://localhost:${PORT}  (Bee live: ${useBee ? "yes" : "no"}). Press Ctrl+C to stop.`);
const child = spawn(process.execPath, ["--import", "tsx", "apps/server/src/index.ts"], { cwd: root, env, stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 0));
process.on("SIGINT", () => child.kill());

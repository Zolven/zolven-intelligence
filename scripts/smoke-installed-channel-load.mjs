#!/usr/bin/env node
// Runtime smoke for an installed release: run `status` against a throwaway
// HOME with a Telegram channel and legacy state, so startup state migrations
// load the bundled channel graph (and through it the Anthropic transport and
// its registry-installed @openclaw/ai imports). `--version` loads none of that;
// v2026.7.1-zolven.7 passed it and still crashed on every real install.
//
// Usage: node scripts/smoke-installed-channel-load.mjs <install-prefix>
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const LOADED_MODULE = "extensions/telegram/legacy-state-migrations-api.js";

function writeLegacyTelegramHome(home) {
  const stateDir = path.join(home, ".openclaw");
  fs.mkdirSync(path.join(stateDir, "telegram"), { recursive: true });
  fs.mkdirSync(path.join(stateDir, "agents", "main", "sessions"), { recursive: true });
  const tokenFile = path.join(home, "telegram-token");
  fs.writeFileSync(tokenFile, "123456789:SMOKE_TEST_TOKEN\n");
  fs.writeFileSync(
    path.join(stateDir, "openclaw.json"),
    `${JSON.stringify({ channels: { telegram: { enabled: true, tokenFile } } }, null, 2)}\n`,
  );
  fs.writeFileSync(
    path.join(stateDir, "agents", "main", "sessions", "sessions.json"),
    `${JSON.stringify({ "agent:main:telegram:dm:123456789": { sessionId: "smoke", updatedAt: 1 } })}\n`,
  );
  fs.writeFileSync(
    path.join(stateDir, "telegram", "update-offset-default.json"),
    '{"lastUpdateId":1}\n',
  );
}

export function runInstalledChannelLoadSmoke(prefix, { timeoutMs = 180_000 } = {}) {
  const bin = path.join(prefix, "bin", "zolven-intelligence");
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "zolven-intelligence-smoke-"));
  try {
    writeLegacyTelegramHome(home);
    const env = { ...process.env, HOME: home, OPENCLAW_PLUGIN_LOAD_PROFILE: "1" };
    for (const key of Object.keys(env)) {
      if (key.startsWith("OPENCLAW_") && key !== "OPENCLAW_PLUGIN_LOAD_PROFILE") {
        delete env[key];
      }
    }
    const result = spawnSync(bin, ["status"], { env, encoding: "utf8", timeout: timeoutMs });
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    const failures = [];
    if (result.error) {
      failures.push(`spawn failed: ${result.error.message}`);
    }
    if (result.status !== 0) {
      failures.push(`exit status ${result.status ?? result.signal}`);
    }
    if (output.includes("Could not start the CLI")) {
      failures.push("CLI reported it could not start");
    }
    if (!output.includes(LOADED_MODULE)) {
      failures.push(`${LOADED_MODULE} was never loaded`);
    }
    return { ok: failures.length === 0, failures, output };
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  const prefix = process.argv[2];
  if (!prefix) {
    console.error("Usage: node scripts/smoke-installed-channel-load.mjs <install-prefix>");
    process.exit(2);
  }
  const { ok, failures, output } = runInstalledChannelLoadSmoke(path.resolve(prefix));
  if (!ok) {
    console.error(`Installed channel-load smoke failed:\n  ${failures.join("\n  ")}`);
    console.error(output.split("\n").slice(-25).join("\n"));
    process.exit(1);
  }
  console.log(`Installed channel-load smoke OK: status loaded ${LOADED_MODULE}.`);
}

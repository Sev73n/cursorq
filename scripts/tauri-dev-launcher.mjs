#!/usr/bin/env node
/**
 * Start Tauri dev with cargo + MSVC on PATH (Windows).
 * Use from repo root or apps/tauri via npm run dev.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const isWin = process.platform === "win32";

function cargoBin() {
  const home = process.env.USERPROFILE || homedir();
  return join(home, ".cargo", "bin");
}

function withCargoPath(env) {
  const bin = cargoBin();
  if (!existsSync(join(bin, isWin ? "cargo.exe" : "cargo"))) return env;
  const sep = isWin ? ";" : ":";
  const prefix = `${bin}${sep}`;
  if ((env.PATH || "").toLowerCase().includes(bin.toLowerCase())) return env;
  return { ...env, PATH: `${prefix}${env.PATH || ""}` };
}

const useBash =
  isWin &&
  (process.env.MSYSTEM ||
    /bash|msys|mintty/i.test(process.env.SHELL || "") ||
    /MINGW|MSYS/i.test(process.env.TERM || ""));

if (isWin && useBash) {
  const sh = join(root, "scripts", "dev-tauri.sh");
  const child = spawn("bash", [sh], { cwd: root, stdio: "inherit", env: process.env });
  child.on("exit", (code) => process.exit(code ?? 1));
} else if (isWin) {
  const cmd = join(root, "scripts", "dev-tauri.cmd");
  const child = spawn("cmd.exe", ["/d", "/s", "/c", cmd], {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });
  child.on("exit", (code) => process.exit(code ?? 1));
} else {
  const env = withCargoPath({ ...process.env });
  const child = spawn(
    "npm",
    ["run", "vite:dev"],
    {
      cwd: join(root, "apps", "tauri"),
      stdio: "inherit",
      env,
      shell: true,
    }
  );
  child.on("exit", (code) => process.exit(code ?? 1));
}

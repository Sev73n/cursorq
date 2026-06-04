/**
 * 构建 Windows 便携 zip：cursorq/CursorQ.exe + copy + mascot + data + config + logs + runtime
 *
 * 用法: node scripts/package-release.mjs
 * 产出: release/cursorq-0.1.0-win64.zip
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const VERSION = JSON.parse(
  fs.readFileSync(path.join(ROOT, "apps/tauri/src-tauri/tauri.conf.json"), "utf8")
).version;
const OUT_DIR = path.join(ROOT, "release", "cursorq");
const EXE_SRC = path.join(
  ROOT,
  "apps/tauri/src-tauri/target/release/cursorq-tauri.exe"
);
const ZIP_PATH = path.join(ROOT, "release", `cursorq-${VERSION}-win64.zip`);

function rmrf(p) {
  if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
}

function mkdirp(p) {
  fs.mkdirSync(p, { recursive: true });
}

function copyFile(src, dest) {
  mkdirp(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function copyDir(src, dest, filter = () => true) {
  if (!fs.existsSync(src)) return;
  mkdirp(dest);
  for (const name of fs.readdirSync(src)) {
    const s = path.join(src, name);
    const d = path.join(dest, name);
    if (!filter(name, s)) continue;
    if (fs.statSync(s).isDirectory()) copyDir(s, d, filter);
    else copyFile(s, d);
  }
}

function step(cmd, cwd = ROOT) {
  console.log(">", cmd);
  execSync(cmd, { cwd, stdio: "inherit", env: process.env });
}

console.log("=== build core ===");
step("npm run build:core");

console.log("=== build tauri frontend ===");
step("npm run vite:build", path.join(ROOT, "apps/tauri"));

console.log("=== cargo release ===");
step("cargo build --release", path.join(ROOT, "apps/tauri/src-tauri"));

if (!fs.existsSync(EXE_SRC)) {
  console.error("missing exe:", EXE_SRC);
  process.exit(1);
}

console.log("=== assemble", OUT_DIR, "===");
rmrf(OUT_DIR);
mkdirp(path.join(OUT_DIR, "data"));
mkdirp(path.join(OUT_DIR, "logs"));
copyFile(EXE_SRC, path.join(OUT_DIR, "CursorQ.exe"));

const contentSrc = path.join(ROOT, "content");
if (!fs.existsSync(path.join(contentSrc, "copy"))) {
  console.error("missing bundled content:", contentSrc);
  process.exit(1);
}
copyDir(contentSrc, path.join(OUT_DIR, "content"), (n) => n !== "README.md");

const remoteTpl = path.join(ROOT, "release/cursorq/config/remote.json.example");
const remoteDest = path.join(OUT_DIR, "config/remote.json");
copyFile(remoteTpl, remoteDest);
console.log("  -> offline: uses bundled content/; optional: enable config/remote.json");

if (!fs.existsSync(path.join(OUT_DIR, "data/app-state.json"))) {
  fs.writeFileSync(
    path.join(OUT_DIR, "data/app-state.json"),
    JSON.stringify(
      { locale: "zh", jokeIndex: 0, surplusBankCents: 0, snapshots: [] },
      null,
      2
    )
  );
}

copyFile(
  path.join(ROOT, "scripts/refresh-usage.mjs"),
  path.join(OUT_DIR, "scripts/refresh-usage.mjs")
);
console.log("=== copy node_modules (minimal) ===");
mkdirp(path.join(OUT_DIR, "node_modules/@cursorq/core"));
copyFile(
  path.join(ROOT, "packages/core/package.json"),
  path.join(OUT_DIR, "node_modules/@cursorq/core/package.json")
);
copyDir(
  path.join(ROOT, "packages/core/dist"),
  path.join(OUT_DIR, "node_modules/@cursorq/core/dist")
);
const nmRoot = path.join(ROOT, "node_modules");
const copyPkg = (name) => {
  const src = path.join(nmRoot, name);
  if (fs.existsSync(src)) {
    copyDir(src, path.join(OUT_DIR, "node_modules", name));
  }
};
copyPkg("sql.js");
const wasmSrc = path.join(nmRoot, "sql.js/dist/sql-wasm.wasm");
if (fs.existsSync(wasmSrc)) {
  copyFile(wasmSrc, path.join(OUT_DIR, "node_modules/sql.js/dist/sql-wasm.wasm"));
}

copyFile(path.join(ROOT, "release/README.md"), path.join(OUT_DIR, "README.txt"));

console.log("=== zip ===");
rmrf(ZIP_PATH);
if (process.platform === "win32") {
  const ps = `Compress-Archive -Path '${OUT_DIR.replace(/'/g, "''")}' -DestinationPath '${ZIP_PATH.replace(/'/g, "''")}' -Force`;
  execSync(`powershell -NoProfile -Command "${ps}"`, { stdio: "inherit" });
} else {
  step(`cd release && zip -r '${path.basename(ZIP_PATH)}' cursorq`);
}

console.log("\nDone:", ZIP_PATH);

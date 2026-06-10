#!/usr/bin/env node
/**
 * 一键 bump 版本号 + 自动 commit + tag
 *
 * 用法:
 *   node scripts/release-bump.mjs 0.1.1          # 指定版本
 *   node scripts/release-bump.mjs patch           # patch/minor/major 自动递增
 *   node scripts/release-bump.mjs 0.2.0 --push    # 自动 push
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

// ---------- 解析参数 ----------
const args = process.argv.slice(2);
const autoPush = args.includes("--push");
const versionArg = args.find((a) => !a.startsWith("--"));

if (!versionArg) {
  console.log("用法: node scripts/release-bump.mjs <version|patch|minor|major> [--push]");
  process.exit(1);
}

// ---------- 计算目标版本 ----------
function bump(current, kind) {
  const [ma, mi, p] = current.split(".").map(Number);
  switch (kind) {
    case "major": return `${ma + 1}.0.0`;
    case "minor": return `${ma}.${mi + 1}.0`;
    case "patch": return `${ma}.${mi}.${p + 1}`;
    default: return kind; // 直接指定
  }
}

const pkgPath = path.join(ROOT, "package.json");
const cargoPath = path.join(ROOT, "apps/tauri/src-tauri/Cargo.toml");
const tauriPath = path.join(ROOT, "apps/tauri/src-tauri/tauri.conf.json");

const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const newVersion = bump(pkg.version, versionArg);

console.log(`版本变更: ${pkg.version} → ${newVersion}`);

// ---------- 校验版本格式 ----------
if (!/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(newVersion)) {
  console.error("无效版本号:", newVersion);
  process.exit(1);
}

// ---------- 更新 3 处版本号 ----------
// 1. package.json
pkg.version = newVersion;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
console.log("  ✓ package.json");

// 2. Cargo.toml
const cargoText = fs.readFileSync(cargoPath, "utf8");
const cargoNew = cargoText.replace(
  /^version\s*=\s*"[^"]+"/m,
  `version = "${newVersion}"`
);
if (cargoText === cargoNew) {
  console.error("Cargo.toml 中未找到 version 字段");
  process.exit(1);
}
fs.writeFileSync(cargoPath, cargoNew);
console.log("  ✓ Cargo.toml");

// 3. tauri.conf.json
const tauriConf = JSON.parse(fs.readFileSync(tauriPath, "utf8"));
tauriConf.version = newVersion;
fs.writeFileSync(tauriPath, JSON.stringify(tauriConf, null, 2) + "\n");
console.log("  ✓ tauri.conf.json");

// ---------- commit + tag ----------
function run(cmd) {
  console.log(">", cmd);
  execSync(cmd, { cwd: ROOT, stdio: "inherit" });
}

try {
  run(`git add package.json apps/tauri/src-tauri/Cargo.toml apps/tauri/src-tauri/tauri.conf.json`);
  run(`git commit -m "chore(release): v${newVersion}"`);
  run(`git tag v${newVersion}`);
  console.log(`\n✓ 已创建 tag: v${newVersion}`);
} catch (e) {
  console.error("git 操作失败:", e.message);
  process.exit(1);
}

if (autoPush) {
  for (const remote of ["origin", "gitea"]) {
    try {
      run(`git push ${remote} main --tags`);
      console.log(`  ✓ 已推送到 ${remote}`);
    } catch {
      console.warn(`  ⚠ 推送 ${remote} 失败，请手动执行 git push ${remote} main --tags`);
    }
  }
  console.log("\n✓ 推送完成，GitHub tag 将触发 CI 创建 Release");
} else {
  console.log(`\n下一步:`);
  console.log(`  git push origin main --tags`);
  console.log(`  git push gitea main --tags`);
  console.log(`或加 --push 参数自动推送`);
}

#!/usr/bin/env node
/**
 * 上传本地 zip 到 Gitea Release（需 git 已配置 gitea 凭据）
 *
 * 用法:
 *   node scripts/publish-gitea-release.mjs v0.2.1
 *   node scripts/publish-gitea-release.mjs v0.2.1 release/cursorq-0.2.1-win64.zip
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

const GITEA_URL = process.env.GITEA_URL || "http://git.73oc.local";
const GITEA_OWNER = process.env.GITEA_OWNER || "73";
const GITEA_REPO = process.env.GITEA_REPO || "cursorq";

const tag = process.argv[2];
if (!tag) {
  console.error("用法: node scripts/publish-gitea-release.mjs <tag> [zip-path]");
  process.exit(1);
}

const version = tag.replace(/^v/, "");
const zipPath =
  process.argv[3] ||
  path.join(ROOT, "release", `cursorq-${version}-win64.zip`);
const notesPath = path.join(ROOT, "RELEASE_NOTES.md");

if (!fs.existsSync(zipPath)) {
  console.error("找不到 zip:", zipPath);
  process.exit(1);
}

function getGiteaToken() {
  if (process.env.GITEA_TOKEN) return process.env.GITEA_TOKEN;
  try {
    const host = new URL(GITEA_URL).host;
    const input = `protocol=http\nhost=${host}\n\n`;
    const out = execSync("git credential fill", {
      input,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    const m = out.match(/^password=(.+)$/m);
    if (m) return m[1].trim();
  } catch {
    /* ignore */
  }
  return null;
}

const token = getGiteaToken();
if (!token) {
  console.error("未找到 Gitea 凭据。请设置 GITEA_TOKEN 或配置 git credential。");
  process.exit(1);
}

const auth = Buffer.from(`${token}:x-oauth-basic`).toString("base64");
const apiBase = `${GITEA_URL}/api/v1/repos/${GITEA_OWNER}/${GITEA_REPO}`;

async function api(method, urlPath, body, headers = {}) {
  const res = await fetch(`${apiBase}${urlPath}`, {
    method,
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
      ...headers,
    },
    body,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  if (!res.ok) {
    throw new Error(`${method} ${urlPath} → ${res.status}: ${text}`);
  }
  return json;
}

const notes = fs.existsSync(notesPath)
  ? fs.readFileSync(notesPath, "utf8")
  : `CursorQ ${version}`;

let release = null;
try {
  release = await api("GET", `/releases/tags/${tag}`);
  console.log(`Release ${tag} 已存在 (id=${release.id})`);
} catch {
  release = await api(
    "POST",
    "/releases",
    JSON.stringify({
      tag_name: tag,
      name: `CursorQ ${version}`,
      body: notes,
      draft: false,
      prerelease: false,
    }),
    { "Content-Type": "application/json" }
  );
  console.log(`已创建 Release ${tag} (id=${release.id})`);
}

const assetName = path.basename(zipPath);
const existing = (release.assets || []).find((a) => a.name === assetName);
if (existing) {
  console.log(`附件 ${assetName} 已存在，跳过上传`);
  process.exit(0);
}

const form = new FormData();
form.append("attachment", new Blob([fs.readFileSync(zipPath)]), assetName);

const uploadRes = await fetch(
  `${apiBase}/releases/${release.id}/assets?name=${encodeURIComponent(assetName)}`,
  {
    method: "POST",
    headers: { Authorization: `Basic ${auth}` },
    body: form,
  }
);
if (!uploadRes.ok) {
  const err = await uploadRes.text();
  throw new Error(`上传失败 ${uploadRes.status}: ${err}`);
}

console.log(`✓ 已上传 ${assetName} → ${GITEA_URL}/${GITEA_OWNER}/${GITEA_REPO}/releases/tag/${tag}`);

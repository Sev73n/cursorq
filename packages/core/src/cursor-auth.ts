import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import initSqlJs, { type Database } from "sql.js";
import type { AuthTokens } from "./types.js";

const require = createRequire(import.meta.url);
let sqlPromise: ReturnType<typeof initSqlJs> | null = null;
let wasmOverride: string | null = null;

/** 宿主可显式指定 sql.js wasm 路径（如便携包目录） */
export function configureSqlWasm(absolutePath: string): void {
  wasmOverride = absolutePath;
  sqlPromise = null;
}

async function getSql() {
  if (!sqlPromise) {
    const wasmPath =
      wasmOverride ?? require.resolve("sql.js/dist/sql-wasm.wasm");
    sqlPromise = initSqlJs({
      wasmBinary: fs.readFileSync(wasmPath),
    });
  }
  return sqlPromise;
}

export function getCursorDbPath(): string {
  const appData = process.env.APPDATA;
  if (!appData) {
    throw new Error("APPDATA not set — Windows only");
  }
  return path.join(
    appData,
    "Cursor",
    "User",
    "globalStorage",
    "state.vscdb"
  );
}

function parseStoredValue(raw: string): string {
  const t = raw.trim();
  if (t.startsWith('"')) {
    try {
      const parsed = JSON.parse(t) as unknown;
      if (typeof parsed === "string") return parsed;
    } catch {
      /* keep raw */
    }
  }
  return raw;
}

function cellToString(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return parseStoredValue(value);
  if (value instanceof Uint8Array) {
    return parseStoredValue(Buffer.from(value).toString("utf8"));
  }
  if (Buffer.isBuffer(value)) {
    return parseStoredValue(value.toString("utf8"));
  }
  return parseStoredValue(String(value));
}

function readKey(db: Database, key: string): string | null {
  const stmt = db.prepare(
    "SELECT value FROM ItemTable WHERE key = ? LIMIT 1"
  );
  stmt.bind([key]);
  if (!stmt.step()) {
    stmt.free();
    return null;
  }
  const row = stmt.getAsObject() as { value?: unknown };
  stmt.free();
  return cellToString(row.value);
}

function readDbBuffer(dbPath: string): Buffer {
  // 复制到临时文件（避免文件锁定问题）
  const tmp = path.join(
    os.tmpdir(),
    `cursorq-${process.pid}-${Date.now()}.vscdb`
  );
  try {
    fs.copyFileSync(dbPath, tmp);
    return fs.readFileSync(tmp);
  } catch {
    throw new Error("无法读取 Cursor 登录数据");
  } finally {
    try {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    } catch {
      /* ignore */
    }
  }
}

export async function readAuthFromCursor(): Promise<AuthTokens | null> {
  const dbPath = getCursorDbPath();
  if (!fs.existsSync(dbPath)) {
    return null;
  }

  // 尝试用 sqlite3 命令行读取（支持大文件）
  // 优先使用项目自带的 sqlite3，否则使用系统路径
  const sqlite3Path = findSqlite3();
  if (sqlite3Path) {
    try {
      const query = "SELECT key, value FROM ItemTable WHERE key IN ('cursorAuth/accessToken', 'cursorAuth/refreshToken', 'cursorAuth/cachedEmail')";
      const result = spawnSync(sqlite3Path, ['-json', dbPath, query], {
        encoding: 'utf8',
        timeout: 10000,
        maxBuffer: 10 * 1024 * 1024,
        shell: false
      });
      
      if (result.error) {
        throw result.error;
      }
      
      if (result.status !== 0) {
        console.error('sqlite3 CLI exited with code:', result.status);
        throw new Error(result.stderr || 'sqlite3 failed');
      }
      
      const output = result.stdout;
      if (!output.trim()) return null;
      
      const rows = JSON.parse(output) as Array<{ key: string; value: string }>;
      const map = new Map(rows.map(r => [r.key, r.value]));
      
      const accessToken = map.get('cursorAuth/accessToken');
      const refreshToken = map.get('cursorAuth/refreshToken');
      const email = map.get('cursorAuth/cachedEmail');
      
      if (!accessToken || !refreshToken) return null;
      
      return { accessToken, refreshToken, email };
    } catch (sqliteError) {
      console.error('sqlite3 CLI failed:', sqliteError);
    }
  }

  // 降级方案：使用 sql.js（仅适用于小文件）
  const stats = fs.statSync(dbPath);
  const sizeMb = stats.size / (1024 * 1024);
  if (sizeMb > 50) {
    console.error(`Database too large (${sizeMb.toFixed(1)}MB), sqlite3 CLI required`);
    return null;
  }

  const SQL = await getSql();
  const buffer = readDbBuffer(dbPath);
  const db = new SQL.Database(buffer);
  try {
    const accessToken = readKey(db, "cursorAuth/accessToken");
    const refreshToken = readKey(db, "cursorAuth/refreshToken");
    const email = readKey(db, "cursorAuth/cachedEmail") ?? undefined;
    if (!accessToken || !refreshToken) return null;
    return { accessToken, refreshToken, email };
  } finally {
    db.close();
  }
}

/** 查找 sqlite3 可执行文件路径 */
function findSqlite3(): string | null {
  // 1. 优先使用项目自带的 sqlite3（发布包中的 tools 目录）
  const bundled = path.join(process.cwd(), 'tools', 'sqlite3.exe');
  if (fs.existsSync(bundled)) {
    return bundled;
  }
  
  // 2. 尝试常见系统路径
  const systemPaths = [
    'C:\\platform-tools\\sqlite3.exe',
    'C:\\Windows\\System32\\sqlite3.exe',
  ];
  for (const p of systemPaths) {
    if (fs.existsSync(p)) return p;
  }
  
  // 3. 尝试 PATH 环境变量
  try {
    const result = execSync('where sqlite3', { encoding: 'utf8', timeout: 5000 });
    const first = result.trim().split('\n')[0]?.trim();
    if (first && fs.existsSync(first)) return first;
  } catch {
    // ignore
  }
  
  return null;
}

const CLIENT_ID = "KbZUR41cY7W6zRSdpSUJ7I7mLYBKOCmB";

export async function refreshAccessToken(
  refreshToken: string
): Promise<string | null> {
  const res = await fetch("https://api2.cursor.sh/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      client_id: CLIENT_ID,
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    access_token?: string;
    shouldLogout?: boolean;
  };
  if (data.shouldLogout || !data.access_token) return null;
  return data.access_token;
}

export function isJwtExpired(token: string, skewSec = 60): boolean {
  try {
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8")
    ) as { exp?: number };
    if (!payload.exp) return false;
    return Date.now() / 1000 >= payload.exp - skewSec;
  } catch {
    return true;
  }
}

export async function getValidAccessToken(): Promise<AuthTokens | null> {
  const auth = await readAuthFromCursor();
  if (!auth) return null;
  if (!isJwtExpired(auth.accessToken)) return auth;
  const next = await refreshAccessToken(auth.refreshToken);
  if (!next) return null;
  return { ...auth, accessToken: next };
}

import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { isPglite } from "../db/index.js";

const execFileAsync = promisify(execFile);

const BACKUP_NAME_RE = /^jbrealty_\d{8}_\d{6}\.sql\.gz$/;

export type BackupConfig = {
  remoteEnabled: boolean;
  remoteUrl: string;
  retentionDays: number;
  alertWebhook: string;
};

const DEFAULT_CONFIG: BackupConfig = {
  remoteEnabled: false,
  remoteUrl: "",
  retentionDays: 14,
  alertWebhook: "",
};

function dataDir() {
  return path.join(process.cwd(), "data");
}

export function backupConfigPath() {
  return path.join(dataDir(), "backup-config.json");
}

function backupDir() {
  return process.env.BACKUP_DIR || "/var/backups/jbrealty";
}

function backupScript(name: "backup-db.sh" | "backup-sync.sh") {
  const root = process.env.JBREALTY_ROOT || path.join(process.cwd(), "..");
  return process.env.BACKUP_SCRIPT_DIR
    ? path.join(process.env.BACKUP_SCRIPT_DIR, name)
    : path.join(root, "deploy/scripts", name);
}

export function backupSupported() {
  return !isPglite && !!process.env.DATABASE_URL;
}

export async function readBackupConfig(): Promise<BackupConfig> {
  try {
    const raw = await fs.readFile(backupConfigPath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<BackupConfig>;
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      retentionDays: Math.min(90, Math.max(3, Number(parsed.retentionDays) || DEFAULT_CONFIG.retentionDays)),
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export async function writeBackupConfig(cfg: BackupConfig) {
  await fs.mkdir(dataDir(), { recursive: true });
  const normalized: BackupConfig = {
    remoteEnabled: Boolean(cfg.remoteEnabled),
    remoteUrl: (cfg.remoteUrl || "").trim(),
    retentionDays: Math.min(90, Math.max(3, Number(cfg.retentionDays) || 14)),
    alertWebhook: (cfg.alertWebhook || "").trim(),
  };
  await fs.writeFile(backupConfigPath(), `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  return normalized;
}

export type BackupListItem = {
  name: string;
  size: number;
  mtime: string;
  sha256?: string;
  pgVersion?: string;
};

export async function listBackups(): Promise<BackupListItem[]> {
  const dir = backupDir();
  let files: string[];
  try {
    files = await fs.readdir(dir);
  } catch {
    return [];
  }

  const items: BackupListItem[] = [];
  for (const name of files.filter((f) => BACKUP_NAME_RE.test(f)).sort().reverse()) {
    const full = path.join(dir, name);
    const stat = await fs.stat(full);
    const base = name.replace(/\.sql\.gz$/, "");
    let sha256: string | undefined;
    let pgVersion: string | undefined;
    try {
      const meta = JSON.parse(await fs.readFile(path.join(dir, `${base}.meta.json`), "utf8")) as {
        sha256?: string; pg_version?: string;
      };
      sha256 = meta.sha256;
      pgVersion = meta.pg_version;
    } catch { /* no meta */ }
    try {
      if (!sha256) sha256 = (await fs.readFile(`${full}.sha256`, "utf8")).trim();
    } catch { /* */ }
    items.push({
      name,
      size: stat.size,
      mtime: stat.mtime.toISOString(),
      sha256,
      pgVersion,
    });
  }
  return items;
}

async function readLogTail(lines = 20): Promise<string[]> {
  const logFile = process.env.BACKUP_LOG_FILE || "/var/log/jbrealty/backup.log";
  try {
    const raw = await fs.readFile(logFile, "utf8");
    return raw.trim().split("\n").slice(-lines);
  } catch {
    return [];
  }
}

export async function getBackupStatus() {
  const [config, backups, logTail] = await Promise.all([
    readBackupConfig(),
    listBackups(),
    readLogTail(15),
  ]);
  return {
    supported: backupSupported(),
    backupDir: backupDir(),
    schedule: "Ежедневно в 03:00 (systemd jbrealty-backup.timer)",
    config,
    backups,
    latest: backups[0] || null,
    logTail,
  };
}

async function runScript(scriptName: "backup-db.sh" | "backup-sync.sh") {
  if (!backupSupported()) {
    throw new Error("Резервное копирование доступно только на production PostgreSQL");
  }

  const script = backupScript(scriptName);
  try {
    await fs.access(script, fs.constants.X_OK);
  } catch {
    throw new Error(`Скрипт не найден: ${script}`);
  }

  const env = {
    ...process.env,
    BACKUP_CONFIG: backupConfigPath(),
    LOCK_FILE: path.join(dataDir(), "backup.lock"),
    ENV_FILE: process.env.ENV_FILE || path.join(process.cwd(), ".env"),
  };

  try {
    const { stdout, stderr } = await execFileAsync("bash", [script], {
      env,
      timeout: 600_000,
      maxBuffer: 4 * 1024 * 1024,
    });
    return (stdout || stderr || "").trim();
  } catch (e) {
    const err = e as NodeJS.ErrnoException & { stdout?: string; stderr?: string };
    const msg = [err.stderr, err.stdout, err.message].filter(Boolean).join("\n").trim();
    throw new Error(msg || "Ошибка скрипта бэкапа");
  }
}

export async function runBackup() {
  const output = await runScript("backup-db.sh");
  const backups = await listBackups();
  return { ok: true, output, latest: backups[0] || null };
}

export async function runBackupSync() {
  const output = await runScript("backup-sync.sh");
  return { ok: true, output };
}

export function resolveBackupFile(name: string) {
  if (!BACKUP_NAME_RE.test(name)) return null;
  const dir = path.resolve(backupDir());
  const full = path.resolve(dir, name);
  if (full !== dir && !full.startsWith(`${dir}${path.sep}`)) return null;
  return full;
}

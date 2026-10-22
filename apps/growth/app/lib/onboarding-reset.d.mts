export const PHRASE: string;
export const PHRASE_SHA1: string;
export const TOKEN_TTL_MIN: number;
export function listTree(dataDir: string): string[];
export function dataDigest(dataDir: string): string;
export function readAll(dataDir: string): { d: Record<string, any>; errors: string[] };
export function makeToken(dataDir: string, now?: Date): string;
export function parseToken(token: string): { ts: number; digest12: string; sig: string } | null;
export function verifyToken(dataDir: string, token: string, now?: Date): { ok: boolean; reason?: string; backupName?: string; ts?: number; expired?: boolean; changed?: boolean };
export function buildSkeleton(d: Record<string, any>, o?: { now?: Date; backupName?: string; differentPerson?: boolean; samePerson?: boolean }): { files: Record<string, any>; prior: any };
export function planReset(dataDir: string, o?: { now?: Date }): {
  dataDir: string; phrase: string; token: string | null; backup: string; ok: boolean; problems: string[]; notes: string[]; mid_interview: boolean;
  archive: { what: string; count: number }[]; blank: { what: string; count: number }[]; keep: string[];
  queue_dropped: number; existing_onboarding: string; backup_contents?: string;
};
export function backupAll(dataDir: string, name: string, now?: Date): { dir: string; manifest: { count: number; files: { path: string; sha1: string; bytes: number }[] } };
export function verifyManifest(dir: string): string[];
export function restoreBackup(o: { dataDir: string; from: string; now?: Date }): { restored: number; from: string; pre_restore: string | null };
export function applyReset(o: { dataDir: string; token: string; phrase: string; forceNew?: boolean; differentPerson?: boolean; samePerson?: boolean; now?: Date; inject?: "post_write" | null }): { ok: boolean; code: string; message: string; backup?: string; backup_dir?: string; files?: number };
/** Where backups live: <dataDir>/.backups, or <GROWTH_BACKUP_DIR>/<hash of the data folder> when that variable is set (keep it outside any synced folder). */
export function backupRoot(dataDir: string): string;

import type { SessionRow, SessionStore } from "./core";

const STORAGE_KEY = "folio-demo-sessions";

function readRows(): SessionRow[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? (value as SessionRow[]) : [];
  } catch {
    return [];
  }
}

function writeRows(rows: SessionRow[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
}

/** Browser-local demo storage shared by same-origin tabs in one browser profile. */
export function createLocalStorageStore(): SessionStore {
  return {
    async insert(row) {
      writeRows([...readRows(), row]);
    },
    async getById(id) {
      return readRows().find((row) => row.id === id) ?? null;
    },
    async getByCodeHash(codeHash) {
      return readRows().find((row) => row.code_hash === codeHash) ?? null;
    },
    async update(id, patch) {
      const rows = readRows();
      const index = rows.findIndex((row) => row.id === id);
      if (index < 0) return;
      const row = rows[index];
      if (!row) return;
      rows[index] = { ...row, ...patch };
      writeRows(rows);
    },
    async setWord(id, word, at) {
      const rows = readRows();
      const index = rows.findIndex((row) => row.id === id);
      const row = rows[index];
      if (index < 0 || !row) return false;
      rows[index] = { ...row, word, word_received_at: at };
      writeRows(rows);
      return true;
    },
    async delete(id) {
      writeRows(readRows().filter((row) => row.id !== id));
    },
    async deleteExpired(now) {
      const nowMs = now.getTime();
      writeRows(readRows().filter((row) => new Date(row.expires_at).getTime() > nowMs));
    },
  };
}

import { useCallback, useEffect, useRef, useState } from "react";
import type { PerformerStatus } from "@/lib/session/core";
import type { SessionApi } from "@/lib/session/client";

export const POLL_MS = 1500;
const STORAGE_KEY = "performer-session";

export type Creds = { sessionId: string; code: string; performerToken: string };
export type Connection = "online" | "reconnecting" | "offline";

/**
 * Performer session state: creation, polling (with backoff after failures), recovery
 * after a page reload (credentials kept in sessionStorage on this device only), and ending.
 */
export function usePerformerSession(api: SessionApi) {
  const [creds, setCreds] = useState<Creds | null>(null);
  const [status, setStatus] = useState<PerformerStatus | null>(null);
  const [connection, setConnection] = useState<Connection>("online");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const failures = useRef(0);
  const storageKey = `${STORAGE_KEY}:${api.mode}`;

  useEffect(() => {
    const saved = sessionStorage.getItem(storageKey);
    if (saved) try { setCreds(JSON.parse(saved)); } catch { sessionStorage.removeItem(storageKey); }
  }, [storageKey]);

  const clear = useCallback(() => {
    sessionStorage.removeItem(storageKey);
    setCreds(null);
  }, [storageKey]);

  useEffect(() => {
    if (!creds) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      const r = await api.getPerformerStatus(creds.sessionId, creds.performerToken);
      if (cancelled) return;
      if (r.ok) {
        failures.current = 0;
        setConnection("online");
        setStatus(r.data);
        if (r.data.state === "ended") return; // stop polling
      } else if (r.error === "unauthorized") {
        setStatus({ state: "ended" });
        return;
      } else {
        failures.current += 1;
        setConnection(navigator.onLine === false ? "offline" : "reconnecting");
      }
      const delay = Math.min(POLL_MS * 2 ** Math.min(failures.current, 3), 12000);
      timer = setTimeout(tick, document.visibilityState === "hidden" ? Math.max(delay, 5000) : delay);
    };
    void tick();
    const wake = () => { clearTimeout(timer); failures.current = 0; void tick(); };
    window.addEventListener("online", wake);
    document.addEventListener("visibilitychange", wake);
    const off = () => setConnection("offline");
    window.addEventListener("offline", off);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      window.removeEventListener("online", wake);
      window.removeEventListener("offline", off);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [api, creds]);

  const create = useCallback(async () => {
    setBusy(true); setError(undefined); setStatus(null);
    const r = await api.createSession();
    setBusy(false);
    if (!r.ok) return setError(r.message);
    sessionStorage.setItem(storageKey, JSON.stringify(r.data));
    setCreds(r.data);
  }, [api, storageKey]);

  const end = useCallback(async () => {
    if (!creds) return;
    setBusy(true);
    const r = await api.endSession(creds.sessionId, creds.performerToken);
    setBusy(false);
    if (!r.ok && r.error !== "unauthorized") return setError(r.message);
    clear(); setStatus(null);
  }, [api, creds, clear]);

  return { creds, status, connection, busy, error, create, end, reset: () => { clear(); setStatus(null); } };
}

import type { SessionRow, SessionStore } from "./core";

/** Server-only store backed by the protected `sessions` table (service role; RLS has no client policies). */
export async function createSupabaseStore(): Promise<SessionStore> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const t = () => supabaseAdmin.from("sessions");
  const check = (error: { message: string } | null) => {
    if (error) throw new Error(error.message);
  };
  return {
    async insert(row) {
      const { error } = await t().insert(row);
      check(error);
    },
    async getById(id) {
      const { data, error } = await t().select("*").eq("id", id).maybeSingle();
      check(error);
      return (data as SessionRow | null) ?? null;
    },
    async getByCodeHash(h) {
      const { data, error } = await t().select("*").eq("code_hash", h).maybeSingle();
      check(error);
      return (data as SessionRow | null) ?? null;
    },
    async update(id, patch) {
      const { error } = await t().update(patch).eq("id", id);
      check(error);
    },
    async setWordIfEmpty(id, word, at) {
      const { data, error } = await t()
        .update({ word, word_received_at: at })
        .eq("id", id)
        .is("word", null)
        .select("id");
      check(error);
      return (data?.length ?? 0) > 0;
    },
    async delete(id) {
      const { error } = await t().delete().eq("id", id);
      check(error);
    },
    async deleteExpired(now) {
      const { error } = await t().delete().lt("expires_at", now.toISOString());
      check(error);
    },
  };
}

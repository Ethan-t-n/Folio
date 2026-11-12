CREATE TABLE public.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash text NOT NULL UNIQUE,
  performer_token_hash text NOT NULL,
  participant_token_hash text,
  word text,
  word_received_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '2 hours'
);
GRANT ALL ON public.sessions TO service_role;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
-- No policies: browsers cannot read or write directly. All access goes through server functions that verify tokens.
CREATE INDEX sessions_expires_at_idx ON public.sessions (expires_at);
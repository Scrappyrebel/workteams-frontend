-- 048: WorkTeams company-owned Telegram evidence group bindings.
-- Source-only migration. DO NOT APPLY while services or access are restricted.
-- This table never enables Telegram sends automatically.
CREATE TABLE IF NOT EXISTS public.telegram_evidence_group_bindings (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  chat_id text NOT NULL UNIQUE CHECK (chat_id ~ '^-[0-9]{6,20}$'),
  group_title text NOT NULL CHECK (char_length(group_title) BETWEEN 1 AND 160),
  verified_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  verified_at timestamptz NOT NULL DEFAULT now(),
  enabled boolean NOT NULL DEFAULT false CHECK (enabled = false)
);

ALTER TABLE public.telegram_evidence_group_bindings ENABLE ROW LEVEL SECURITY;
-- No anon/authenticated grants or client RLS policies: only the server
-- service role can save exact verified company IDs after owner auth.
REVOKE ALL ON public.telegram_evidence_group_bindings FROM PUBLIC;
REVOKE ALL ON public.telegram_evidence_group_bindings FROM anon;
REVOKE ALL ON public.telegram_evidence_group_bindings FROM authenticated;
GRANT ALL ON public.telegram_evidence_group_bindings TO service_role;

COMMENT ON TABLE public.telegram_evidence_group_bindings IS
  'Owner-verified, company-specific PRIVATE Telegram group ID. Forwarding stays disabled until separate reviewed activation and evidence-retention workflow.';

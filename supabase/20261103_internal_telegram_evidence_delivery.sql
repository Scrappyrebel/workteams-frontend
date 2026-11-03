-- Owner-only Telegram delivery ledger for internal Lilly B's evidence.
-- Never expose to app subscribers, employees, anon, or authenticated clients.
-- This is installed only after review and authorization; no production SQL is run by this file.
CREATE TABLE IF NOT EXISTS public.internal_telegram_evidence_delivery (
  product text NOT NULL CHECK (product IN ('business-hq','workteams')),
  company_id uuid NOT NULL,
  evidence_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('video','book_arrival','book_response','book_photo')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','retry','sent','link_only','skipped','failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 10),
  created_at timestamptz NOT NULL DEFAULT now(),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  telegram_message_id bigint,
  last_error_code text,
  PRIMARY KEY (product, company_id, evidence_id, kind)
);
CREATE INDEX IF NOT EXISTS internal_telegram_evidence_delivery_queue_idx
  ON public.internal_telegram_evidence_delivery (product, company_id, status, next_attempt_at, created_at);
ALTER TABLE public.internal_telegram_evidence_delivery ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.internal_telegram_evidence_delivery FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.internal_telegram_evidence_delivery TO service_role;
COMMENT ON TABLE public.internal_telegram_evidence_delivery IS
  'Private operator-only Telegram dispatch bookkeeping; no media bytes, bot secrets, or chat IDs.';

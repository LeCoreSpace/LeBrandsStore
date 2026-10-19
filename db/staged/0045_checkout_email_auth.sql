-- Manual administrative migration. Existing orders are not changed.
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND (rolsuper OR rolbypassrls)) THEN
  RAISE EXCEPTION 'Administrative BYPASSRLS access required';
 END IF;
END $$;
CREATE TABLE public.checkout_email_challenges (
 id uuid PRIMARY KEY,
 store_id uuid NOT NULL REFERENCES public.stores(store_id),
 email_hash text NOT NULL CHECK(email_hash~'^[0-9a-f]{64}$'),
 code_hash text NOT NULL CHECK(code_hash~'^[0-9a-f]{64}$'),
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '10 minutes',
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
 delivered boolean NOT NULL DEFAULT false,
 consumed_at timestamptz
);
CREATE INDEX checkout_email_rate ON public.checkout_email_challenges(store_id,email_hash,created_at);
CREATE INDEX checkout_email_store_rate ON public.checkout_email_challenges(store_id,created_at);
ALTER TABLE public.checkout_email_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkout_email_challenges FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant ON public.checkout_email_challenges
 USING(store_id=nullif(current_setting('app.store_id',true),'')::uuid)
 WITH CHECK(store_id=nullif(current_setting('app.store_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.checkout_email_challenges TO lebrands_app;
COMMENT ON TABLE public.checkout_email_challenges IS
 'Checkout-only email OTP authentication. No raw OTP or email; keyed hashes, bounded attempts, ten-minute expiry. Not merchant account authentication.';

-- Durable attempt limits are reserved/committed before paid external scanning.
-- Failed, blocked and interrupted scans consume attempts; no automatic retry.
DO $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=current_user AND (rolsuper OR rolbypassrls)) THEN
   RAISE EXCEPTION 'Scanning migration requires administrative BYPASSRLS';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.schema_migrations WHERE filename='0033_business_document_retention.sql') THEN
   RAISE EXCEPTION 'Apply subscription-duration document retention first';
 END IF;
END $$;

CREATE TABLE public.business_document_scan_budgets(
 scope text NOT NULL CHECK(scope='platform-month' OR scope ~ '^store-(hour|month):[a-f0-9-]{36}$'),
 window_start timestamptz NOT NULL,
 used integer NOT NULL CHECK(used>=0),
 PRIMARY KEY(scope,window_start)
);
ALTER TABLE public.business_document_scan_budgets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.business_document_scan_budgets FROM PUBLIC,lebrands_app,anon,authenticated,service_role;

CREATE FUNCTION public.business_document_reserve_scan(p_store uuid,p_token text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
 v_hour timestamptz:=date_trunc('hour',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
 v_month timestamptz:=date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
BEGIN
 IF NOT EXISTS(
   SELECT 1 FROM public.sessions s JOIN public.users u ON u.id=s.user_id
   JOIN public.store_members m ON m.user_id=u.id AND m.store_id=p_store AND m.role IN ('owner','admin')
   WHERE s.token_hash=p_token AND s.revoked_at IS NULL AND s.expires_at>now() AND NOT u.must_change_password
 ) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 -- One short lock serializes reservations across stores, not external HTTP work.
 PERFORM pg_advisory_xact_lock(hashtextextended('business-document-scan-budget',0));
 IF EXISTS(
   SELECT 1 FROM (VALUES
     ('platform-month',v_month,500),
     ('store-hour:'||p_store::text,v_hour,5),
     ('store-month:'||p_store::text,v_month,30)
   ) AS limits(scope,window_start,maximum)
   JOIN public.business_document_scan_budgets b
     ON b.scope=limits.scope AND b.window_start=limits.window_start
   WHERE b.used>=limits.maximum
 ) THEN RETURN false; END IF;
 INSERT INTO public.business_document_scan_budgets(scope,window_start,used)
 VALUES('platform-month',v_month,1),('store-hour:'||p_store::text,v_hour,1),
   ('store-month:'||p_store::text,v_month,1)
 ON CONFLICT(scope,window_start) DO UPDATE SET used=public.business_document_scan_budgets.used+1;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.business_document_reserve_scan(uuid,text)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.business_document_reserve_scan(uuid,text) TO lebrands_app;

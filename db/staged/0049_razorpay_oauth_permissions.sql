-- Supabase default privileges can grant new routines directly to API roles.
-- Keep the already-applied migration immutable; tighten only these two
-- application-internal functions, without changing global default privileges.
DO $$
DECLARE api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon','authenticated','service_role']
  LOOP
    IF to_regrole(api_role) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON FUNCTION public.resolve_razorpay_oauth_webhook(text,text,text,text) FROM %I',api_role);
      EXECUTE format('REVOKE ALL ON FUNCTION public.list_razorpay_oauth_refresh(text) FROM %I',api_role);
    END IF;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.resolve_razorpay_oauth_webhook(text,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_razorpay_oauth_refresh(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_razorpay_oauth_webhook(text,text,text,text) TO lebrands_app;
GRANT EXECUTE ON FUNCTION public.list_razorpay_oauth_refresh(text) TO lebrands_app;

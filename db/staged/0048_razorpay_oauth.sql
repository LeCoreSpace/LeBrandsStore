-- Manual only. No table replacement or financial-write privilege changes.
CREATE OR REPLACE FUNCTION public.resolve_razorpay_oauth_webhook(
  p_account text,p_mode text,p_order text,p_payment text)
RETURNS TABLE(store_id uuid)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT i.store_id FROM public.integrations i
  WHERE p_account ~ '^acc_[A-Za-z0-9]{5,80}$' AND p_mode IN ('test','live')
    AND i.provider='razorpay' AND i.metadata->>'auth_type'='oauth'
    AND i.metadata->>'account_id'=p_account AND i.metadata->>'mode'=p_mode
  UNION
  SELECT a.store_id FROM public.payment_attempts a
  WHERE p_account ~ '^acc_[A-Za-z0-9]{5,80}$' AND p_mode IN ('test','live')
    AND ((p_order ~ '^order_[A-Za-z0-9]+$' AND a.provider_order_id=p_order)
      OR (p_payment ~ '^pay_[A-Za-z0-9]+$' AND a.captured_payment_id=p_payment));
$$;
REVOKE ALL ON FUNCTION public.resolve_razorpay_oauth_webhook(text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_razorpay_oauth_webhook(text,text,text,text) TO lebrands_app;
COMMENT ON FUNCTION public.resolve_razorpay_oauth_webhook(text,text,text,text)
IS 'Read-only routing IDs. Worker must verify partner webhook HMAC before calling and verify account/mode against tenant credentials before any write.';

CREATE OR REPLACE FUNCTION public.list_razorpay_oauth_refresh(p_mode text)
RETURNS TABLE(store_id uuid)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT i.store_id FROM public.integrations i
  WHERE i.provider='razorpay' AND i.status='connected' AND i.metadata->>'auth_type'='oauth'
    AND p_mode IN ('test','live') AND i.metadata->>'mode'=p_mode
    AND COALESCE(i.metadata->>'oauth_refresh_attention','false')<>'true'
    AND CASE WHEN i.metadata->>'token_expires_at' ~ '^[0-9]{10,16}$'
      THEN (i.metadata->>'token_expires_at')::numeric ELSE 0 END
      < extract(epoch FROM now()+interval '1 day')*1000
  ORDER BY i.updated_at LIMIT 20;
$$;
REVOKE ALL ON FUNCTION public.list_razorpay_oauth_refresh(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_razorpay_oauth_refresh(text) TO lebrands_app;

-- Recipient-scoped optional notification preferences. Apply before releasing
-- preference links; essential order/payment/account messages are not disabled.
CREATE TABLE public.email_notification_preferences (
 scope text NOT NULL CHECK (scope='platform' OR scope ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'),
 recipient_hash text NOT NULL CHECK (recipient_hash ~ '^[a-f0-9]{64}$'),
 optional_updates boolean NOT NULL DEFAULT true,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(scope,recipient_hash)
);
ALTER TABLE public.email_notification_preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.email_notification_preferences FROM PUBLIC,lebrands_app;

CREATE FUNCTION public.email_notification_preference_get(p_scope text,p_hash text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT coalesce((SELECT optional_updates FROM public.email_notification_preferences
 WHERE scope=p_scope AND recipient_hash=p_hash),true);
$$;
CREATE FUNCTION public.email_notification_preference_set(p_scope text,p_hash text,p_enabled boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF p_scope IS NULL OR NOT(p_scope='platform' OR p_scope ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$')
 OR p_hash IS NULL OR p_hash !~ '^[a-f0-9]{64}$' OR p_enabled IS NULL THEN
  RAISE EXCEPTION 'Invalid email preference' USING ERRCODE='22023';
 END IF;
 INSERT INTO public.email_notification_preferences(scope,recipient_hash,optional_updates)
 VALUES(p_scope,p_hash,p_enabled) ON CONFLICT(scope,recipient_hash)
 DO UPDATE SET optional_updates=excluded.optional_updates,updated_at=now();
END;
$$;
REVOKE ALL ON FUNCTION public.email_notification_preference_get(text,text),public.email_notification_preference_set(text,text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.email_notification_preference_get(text,text),public.email_notification_preference_set(text,text,boolean) TO lebrands_app;

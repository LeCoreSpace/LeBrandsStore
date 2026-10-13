-- Draft migration only. No sends, migrations or deployment are performed by this file's author.
ALTER TABLE public.email_log DROP CONSTRAINT email_log_status_check;
ALTER TABLE public.email_log ADD CONSTRAINT email_log_status_check CHECK(status IN('pending','sending','sent','delivered','bounced','complained','failed'));
ALTER TABLE public.email_log ADD COLUMN event_key text;
ALTER TABLE public.email_log ADD COLUMN payload jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.email_log ADD COLUMN attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 8);
ALTER TABLE public.email_log ADD COLUMN next_attempt_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.email_log ADD COLUMN lease_until timestamptz;
ALTER TABLE public.email_log ADD COLUMN last_event_at timestamptz;
ALTER TABLE public.email_log ADD COLUMN first_attempt_at timestamptz;
CREATE UNIQUE INDEX email_log_event_once ON public.email_log(store_id,event_key) WHERE event_key IS NOT NULL;
ALTER TABLE public.email_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_log FORCE ROW LEVEL SECURITY;
ALTER TABLE public.customers ADD COLUMN email_bounced_at timestamptz;
ALTER TABLE public.customers ADD COLUMN email_complained_at timestamptz;

CREATE TABLE public.email_reset_tokens(
 user_id uuid PRIMARY KEY REFERENCES public.users(id),token_hash text UNIQUE NOT NULL CHECK(token_hash~'^[a-f0-9]{64}$'),
 expires_at timestamptz NOT NULL,issued_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.email_reset_rates(key_hash text PRIMARY KEY CHECK(key_hash~'^[a-f0-9]{64}$'),window_start timestamptz NOT NULL DEFAULT now(),attempts integer NOT NULL DEFAULT 1);
REVOKE ALL ON public.email_reset_rates FROM PUBLIC,lebrands_app;
CREATE FUNCTION public.email_reset_allowed(p_key text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE count integer;
BEGIN
 IF p_key !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Invalid request key'; END IF;
 INSERT INTO public.email_reset_rates(key_hash) VALUES(p_key)
 ON CONFLICT(key_hash) DO UPDATE SET attempts=CASE WHEN email_reset_rates.window_start<now()-interval '1 hour' THEN 1 ELSE email_reset_rates.attempts+1 END,
 window_start=CASE WHEN email_reset_rates.window_start<now()-interval '1 hour' THEN now() ELSE email_reset_rates.window_start END RETURNING attempts INTO count;
 RETURN count<=10;
END $$;
REVOKE ALL ON FUNCTION public.email_reset_allowed(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.email_reset_allowed(text) TO lebrands_app;
CREATE TABLE public.platform_email_jobs(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid REFERENCES public.users(id),
 template text NOT NULL,token_hash text,payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),
 delivery_key_hash text NOT NULL CHECK(delivery_key_hash~'^[a-f0-9]{64}$'),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','sending','sent','failed','cancelled')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 8),
 next_attempt_at timestamptz NOT NULL DEFAULT now(),lease_until timestamptz,
 provider_message_id text,error_code text,created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.platform_email_jobs ADD COLUMN delivery_status text CHECK(delivery_status IN('delivered','bounced','complained'));
ALTER TABLE public.platform_email_jobs ADD COLUMN last_event_at timestamptz;
REVOKE ALL ON public.email_reset_tokens,public.platform_email_jobs FROM PUBLIC,lebrands_app;
CREATE TABLE public.email_staff_invites(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),store_id uuid NOT NULL REFERENCES public.stores(store_id),
 email text NOT NULL,role text NOT NULL CHECK(role IN('admin','editor')),
 token_hash text UNIQUE NOT NULL CHECK(token_hash~'^[a-f0-9]{64}$'),invited_by uuid NOT NULL REFERENCES public.users(id),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '7 days',accepted_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.email_staff_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_staff_invites FORCE ROW LEVEL SECURITY;
CREATE POLICY email_staff_invites_tenant ON public.email_staff_invites USING(store_id=NULLIF(current_setting('app.store_id',true),'')::uuid)
 WITH CHECK(store_id=NULLIF(current_setting('app.store_id',true),'')::uuid);
REVOKE ALL ON public.email_staff_invites FROM PUBLIC,lebrands_app;
GRANT SELECT ON public.email_staff_invites TO lebrands_app;

CREATE FUNCTION public.email_pending_stores() RETURNS SETOF uuid LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT DISTINCT store_id FROM public.email_log WHERE template IN('confirmed','new_order','shipped','delivered','cancelled','refunded','invite')
 AND event_key IS NOT NULL AND attempts<8 AND next_attempt_at<=now() AND (status='pending' OR(status='sending' AND lease_until<now())) LIMIT 100
$$;
CREATE FUNCTION public.email_queue_order(p_store uuid,p_order uuid,p_event text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE o public.orders; recipient text; settings jsonb; destination text; payload jsonb;
BEGIN
 IF p_store IS DISTINCT FROM NULLIF(current_setting('app.store_id',true),'')::uuid THEN RAISE EXCEPTION 'Store context mismatch' USING ERRCODE='42501'; END IF;
 IF p_event NOT IN('confirmed','new_order','shipped','delivered','cancelled','refunded') THEN RAISE EXCEPTION 'Invalid email event'; END IF;
 SELECT * INTO o FROM public.orders WHERE store_id=p_store AND id=p_order;
 IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
 SELECT email INTO recipient FROM public.customers WHERE store_id=p_store AND id=o.customer_id AND email_bounced_at IS NULL AND email_complained_at IS NULL;
 SELECT s.settings INTO settings FROM public.store_setup s WHERE store_id=p_store;
 IF p_event='new_order' THEN recipient:=COALESCE(NULLIF(settings->>'notification_email',''),settings->>'support_email'); END IF;
 IF recipient IS NULL OR recipient !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN RETURN; END IF;
 payload:=jsonb_build_object('order_id',p_order,'event',p_event);
 INSERT INTO public.email_log(store_id,order_id,recipient,template,event_key,payload)
 VALUES(p_store,p_order,recipient,p_event,p_order::text||':'||p_event,payload) ON CONFLICT DO NOTHING;
END $$;
CREATE FUNCTION public.email_order_events() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE event text;
BEGIN
 event:=CASE WHEN TG_OP='INSERT' AND NEW.status IN('confirmed_cod','confirmed','paid','processing') THEN 'confirmed'
  WHEN TG_OP='UPDATE' AND NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN('confirmed_cod','confirmed','paid','processing') THEN 'confirmed'
  WHEN TG_OP='UPDATE' AND NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN('shipped','delivered','cancelled','refunded') THEN NEW.status END;
 IF event IS NOT NULL THEN
  PERFORM public.email_queue_order(NEW.store_id,NEW.id,event);
  IF event='confirmed' THEN PERFORM public.email_queue_order(NEW.store_id,NEW.id,'new_order'); END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER email_order_events AFTER INSERT OR UPDATE OF status ON public.orders FOR EACH ROW EXECUTE FUNCTION public.email_order_events();

CREATE FUNCTION public.email_issue_reset(p_email text,p_hash text,p_message jsonb,p_delivery text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE u public.users; job uuid;
BEGIN
 SELECT * INTO u FROM public.users WHERE lower(email)=lower(p_email) FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF EXISTS(SELECT 1 FROM public.email_reset_tokens WHERE user_id=u.id AND issued_at>now()-interval '1 minute') THEN RETURN NULL; END IF;
 IF p_hash !~ '^[a-f0-9]{64}$' OR p_delivery !~ '^[a-f0-9]{64}$' OR jsonb_typeof(p_message)<>'object' OR octet_length(p_message::text)>50000 THEN RAISE EXCEPTION 'Invalid reset request'; END IF;
 INSERT INTO public.email_reset_tokens(user_id,token_hash,expires_at) VALUES(u.id,p_hash,now()+interval '30 minutes')
 ON CONFLICT(user_id) DO UPDATE SET token_hash=EXCLUDED.token_hash,expires_at=EXCLUDED.expires_at,issued_at=now();
 INSERT INTO public.platform_email_jobs(user_id,template,token_hash,payload,delivery_key_hash)
 VALUES(u.id,'reset',p_hash,jsonb_set(p_message,'{to}',jsonb_build_array(u.email)),p_delivery) RETURNING id INTO job;
 RETURN job;
END $$;
CREATE FUNCTION public.email_complete_reset(p_token text,p_hash text,p_algo text,p_iterations integer,p_salt text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid;
BEGIN
 IF NOT public.valid_password_record(p_hash,p_algo,p_iterations,p_salt) THEN RAISE EXCEPTION 'Invalid password record'; END IF;
 SELECT user_id INTO actor FROM public.email_reset_tokens WHERE token_hash=p_token AND expires_at>now() FOR UPDATE;
 IF actor IS NULL THEN RETURN false; END IF;
 UPDATE public.users SET password_hash=p_hash,password_algo=p_algo,password_iterations=p_iterations,password_salt=p_salt,must_change_password=false WHERE id=actor;
 UPDATE public.sessions SET revoked_at=now() WHERE user_id=actor AND revoked_at IS NULL;
 DELETE FROM public.email_reset_tokens WHERE user_id=actor;
 RETURN true;
END $$;
CREATE FUNCTION public.email_enqueue_verification(p_session text,p_token text,p_message jsonb,p_delivery text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid; address text; result uuid;
BEGIN
 SELECT s.user_id,u.email INTO actor,address FROM public.sessions s JOIN public.users u ON u.id=s.user_id
 WHERE s.token_hash=p_session AND s.revoked_at IS NULL AND s.expires_at>now() AND NOT u.must_change_password;
 IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.ai_email_verifications WHERE user_id=actor AND token_hash=p_token AND expires_at>now())
 THEN RAISE EXCEPTION 'Valid verification required' USING ERRCODE='42501'; END IF;
 IF p_delivery !~ '^[a-f0-9]{64}$' OR jsonb_typeof(p_message)<>'object' OR octet_length(p_message::text)>50000 THEN RAISE EXCEPTION 'Invalid message'; END IF;
 INSERT INTO public.platform_email_jobs(user_id,template,token_hash,payload,delivery_key_hash)
 VALUES(actor,'verification',p_token,jsonb_set(p_message,'{to}',jsonb_build_array(address)),p_delivery) RETURNING id INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.email_enqueue_verification(text,text,jsonb,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.email_enqueue_verification(text,text,jsonb,text) TO lebrands_app;
CREATE FUNCTION public.email_platform_pending() RETURNS TABLE(id uuid,token_hash text)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT j.id,j.token_hash FROM public.platform_email_jobs j WHERE j.attempts<8 AND j.next_attempt_at<=now()
 AND(j.status='pending' OR(j.status='sending' AND j.lease_until<now())) ORDER BY j.created_at LIMIT 100
$$;
REVOKE ALL ON FUNCTION public.email_platform_pending() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.email_platform_pending() TO lebrands_app;
CREATE FUNCTION public.email_claim_platform(p_id uuid,p_delivery text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE job public.platform_email_jobs;
BEGIN
 SELECT * INTO job FROM public.platform_email_jobs WHERE id=p_id AND delivery_key_hash=p_delivery FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Delivery capability required' USING ERRCODE='42501'; END IF;
 IF job.template='reset' AND NOT EXISTS(SELECT 1 FROM public.email_reset_tokens WHERE user_id=job.user_id AND token_hash=job.token_hash AND expires_at>now()) THEN
  UPDATE public.platform_email_jobs SET status='cancelled' WHERE id=p_id;RETURN NULL;
 END IF;
 IF job.template='verification' AND NOT EXISTS(SELECT 1 FROM public.ai_email_verifications WHERE user_id=job.user_id AND token_hash=job.token_hash AND expires_at>now()) THEN
  UPDATE public.platform_email_jobs SET status='cancelled' WHERE id=p_id;RETURN NULL;
 END IF;
 IF job.attempts>=8 OR job.next_attempt_at>now() OR job.status IN('sent','cancelled','failed') OR(job.status='sending' AND job.lease_until>now()) THEN RETURN NULL; END IF;
 UPDATE public.platform_email_jobs SET attempts=attempts+1,status='sending',lease_until=now()+interval '1 minute' WHERE id=p_id;
 RETURN jsonb_build_object('payload',job.payload,'attempts',job.attempts+1);
END $$;
CREATE FUNCTION public.email_finish_platform(p_id uuid,p_delivery text,p_message text,p_error text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 UPDATE public.platform_email_jobs SET provider_message_id=p_message,error_code=p_error,
 status=CASE WHEN p_message IS NOT NULL THEN 'sent' WHEN attempts>=8 THEN 'failed' ELSE 'pending' END,
 next_attempt_at=now()+make_interval(secs=>LEAST(900,10*power(2,attempts)::integer)),lease_until=NULL
 WHERE id=p_id AND delivery_key_hash=p_delivery AND status='sending';
 IF NOT FOUND THEN RAISE EXCEPTION 'Delivery capability required' USING ERRCODE='42501'; END IF;
END $$;
CREATE FUNCTION public.email_invite_staff(p_store uuid,p_session text,p_email text,p_role text,p_hash text,p_message jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid; invited uuid;
BEGIN
 IF p_store IS DISTINCT FROM NULLIF(current_setting('app.store_id',true),'')::uuid THEN RAISE EXCEPTION 'Store context mismatch' USING ERRCODE='42501'; END IF;
 SELECT s.user_id INTO actor FROM public.sessions s JOIN public.users u ON u.id=s.user_id JOIN public.store_members m ON m.user_id=u.id
 WHERE s.token_hash=p_session AND s.revoked_at IS NULL AND s.expires_at>now() AND NOT u.must_change_password AND m.store_id=p_store AND m.role IN('owner','admin');
 IF actor IS NULL THEN RAISE EXCEPTION 'Owner or admin required' USING ERRCODE='42501'; END IF;
 IF p_role NOT IN('admin','editor') OR p_hash !~ '^[a-f0-9]{64}$' OR length(p_email)>254 OR p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  OR jsonb_typeof(p_message)<>'object' OR octet_length(p_message::text)>50000 THEN RAISE EXCEPTION 'Check the invitation'; END IF;
 INSERT INTO public.email_staff_invites(store_id,email,role,token_hash,invited_by)
 VALUES(p_store,lower(p_email),p_role,p_hash,actor) RETURNING id INTO invited;
 INSERT INTO public.email_log(store_id,recipient,template,event_key,payload)
 VALUES(p_store,lower(p_email),'invite','invite:'||invited::text,jsonb_set(p_message,'{to}',jsonb_build_array(lower(p_email))));
 RETURN invited;
END $$;
CREATE FUNCTION public.email_accept_invite(p_hash text,p_session text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE invite public.email_staff_invites; actor uuid; address text;
BEGIN
 SELECT s.user_id,u.email INTO actor,address FROM public.sessions s JOIN public.users u ON u.id=s.user_id
 WHERE s.token_hash=p_session AND s.revoked_at IS NULL AND s.expires_at>now() AND NOT u.must_change_password;
 IF actor IS NULL THEN RAISE EXCEPTION 'Sign in first' USING ERRCODE='42501'; END IF;
 SELECT * INTO invite FROM public.email_staff_invites WHERE token_hash=p_hash AND expires_at>now() AND accepted_at IS NULL FOR UPDATE;
 IF NOT FOUND OR lower(address)<>invite.email THEN RAISE EXCEPTION 'Use the invited email with a valid invitation' USING ERRCODE='42501'; END IF;
 IF NULLIF(current_setting('app.store_id',true),'') IS NOT NULL AND invite.store_id IS DISTINCT FROM NULLIF(current_setting('app.store_id',true),'')::uuid THEN RAISE EXCEPTION 'Store context mismatch' USING ERRCODE='42501'; END IF;
 INSERT INTO public.store_members(store_id,user_id,role) VALUES(invite.store_id,actor,invite.role) ON CONFLICT(store_id,user_id) DO NOTHING;
 UPDATE public.email_staff_invites SET accepted_at=now() WHERE id=invite.id;
 RETURN invite.store_id;
END $$;
CREATE FUNCTION public.email_webhook_target(p_message text) RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT store_id FROM public.email_log WHERE provider_message_id=p_message LIMIT 1
$$;
CREATE FUNCTION public.email_platform_event(p_message text,p_status text,p_at timestamptz) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF p_status NOT IN('delivered','bounced','complained') THEN RAISE EXCEPTION 'Invalid email event'; END IF;
 UPDATE public.platform_email_jobs SET delivery_status=p_status,last_event_at=p_at
 WHERE provider_message_id=p_message AND(last_event_at IS NULL OR last_event_at<p_at)
 AND NOT(COALESCE(delivery_status IN('bounced','complained'),false) AND p_status='delivered');
 RETURN EXISTS(SELECT 1 FROM public.platform_email_jobs WHERE provider_message_id=p_message);
END $$;
REVOKE ALL ON FUNCTION public.email_platform_event(text,text,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.email_platform_event(text,text,timestamptz) TO lebrands_app;
CREATE FUNCTION public.email_team(p_store uuid,p_session text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE result jsonb;
BEGIN
 IF p_store IS DISTINCT FROM NULLIF(current_setting('app.store_id',true),'')::uuid THEN RAISE EXCEPTION 'Store context mismatch' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.sessions s JOIN public.store_members m ON m.user_id=s.user_id
  WHERE s.token_hash=p_session AND s.revoked_at IS NULL AND s.expires_at>now() AND m.store_id=p_store AND m.role IN('owner','admin'))
 THEN RAISE EXCEPTION 'Owner or admin required' USING ERRCODE='42501'; END IF;
 SELECT COALESCE(jsonb_agg(jsonb_build_object('role',m.role,'name',u.name,'email',substr(u.email,1,1)||'***@'||split_part(u.email,'@',2))),'[]'::jsonb)
 INTO result FROM public.store_members m JOIN public.users u ON u.id=m.user_id WHERE m.store_id=p_store;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.email_team(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.email_team(uuid,text) TO lebrands_app;
REVOKE ALL ON FUNCTION public.email_pending_stores(),public.email_queue_order(uuid,uuid,text),public.email_order_events(),
 public.email_issue_reset(text,text,jsonb,text),public.email_complete_reset(text,text,text,integer,text),
 public.email_claim_platform(uuid,text),public.email_finish_platform(uuid,text,text,text),
 public.email_invite_staff(uuid,text,text,text,text,jsonb),public.email_accept_invite(text,text),public.email_webhook_target(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.email_pending_stores(),public.email_queue_order(uuid,uuid,text),
 public.email_issue_reset(text,text,jsonb,text),public.email_complete_reset(text,text,text,integer,text),
 public.email_claim_platform(uuid,text),public.email_finish_platform(uuid,text,text,text),
 public.email_invite_staff(uuid,text,text,text,text,jsonb),public.email_accept_invite(text,text),public.email_webhook_target(text) TO lebrands_app;

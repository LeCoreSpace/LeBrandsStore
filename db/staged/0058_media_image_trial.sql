-- Manual, additive, owner-only trial. No wallet, credits or automatic publication.
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
CREATE TABLE public.media_image_jobs(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),store_id uuid NOT NULL REFERENCES public.stores(store_id),
 user_id uuid NOT NULL REFERENCES public.users(id),request_id uuid NOT NULL,
 placement_id text NOT NULL CHECK(length(placement_id)<=80),
 prompt text NOT NULL CHECK(length(prompt) BETWEEN 10 AND 1500),
 reference_id uuid,width integer NOT NULL CHECK(width BETWEEN 512 AND 2048 AND width%16=0),
 height integer NOT NULL CHECK(height BETWEEN 512 AND 2048 AND height%16=0),
 status text NOT NULL DEFAULT 'queued' CHECK(status IN('queued','generating','ready','saved','failed')),
 object_key text NOT NULL,media_id uuid,content_type text,size_bytes bigint,
 storage_reserve_bytes bigint NOT NULL DEFAULT 10485760 CHECK(storage_reserve_bytes BETWEEN 0 AND 10485760),
 reserved_usd numeric(12,6) NOT NULL DEFAULT 1 CHECK(reserved_usd=1),
 provider_ms integer,total_ms integer,provider_usage jsonb NOT NULL DEFAULT '{}',error text,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(store_id,request_id),CHECK(width*height<=1600000)
);
CREATE INDEX media_image_jobs_store ON public.media_image_jobs(store_id,created_at DESC);
CREATE INDEX media_image_jobs_pending ON public.media_image_jobs(updated_at) WHERE status IN('queued','generating');
REVOKE ALL ON public.media_image_jobs FROM PUBLIC,anon,authenticated,service_role,lebrands_app;
ALTER TABLE public.media_image_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_image_jobs FORCE ROW LEVEL SECURITY;

CREATE FUNCTION public.media_image_access(p_store uuid,p_token text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT p_store=NULLIF(current_setting('app.store_id',true),'')::uuid AND EXISTS(
  SELECT 1 FROM public.sessions s JOIN public.users u ON u.id=s.user_id
  JOIN public.store_members m ON m.user_id=u.id
  WHERE s.token_hash=p_token AND s.revoked_at IS NULL AND s.expires_at>now()
   AND NOT u.must_change_password AND m.store_id=p_store AND m.role='owner')
$$;
CREATE POLICY media_image_owner_read ON public.media_image_jobs FOR SELECT TO lebrands_app
 USING(public.media_image_access(store_id,NULLIF(current_setting('app.media_image_token',true),'')));
GRANT SELECT ON public.media_image_jobs TO lebrands_app;

-- Preserve the existing function's identity, grants and product/SKU/staff logic.
-- Pending generated previews count against storage before the provider is paid.
CREATE OR REPLACE FUNCTION public._plan_capacity_usage(p_store uuid) RETURNS jsonb
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
 WITH catalogue AS (
  SELECT p.id::text AS id,coalesce(o.id::text,'base') AS sku FROM public.products p
  LEFT JOIN public.product_options o ON o.store_id=p.store_id AND o.product_id=p.id
  WHERE p.store_id=p_store AND p.status<>'archived'
 ), live_entries AS (
  SELECT coalesce(p->>'id','invalid-'||n::text) AS id,
   CASE WHEN v IS NULL THEN 'base' ELSE coalesce(v->>'id',v->>'sku','published-variant-'||vn::text) END AS sku
  FROM public.store_publications s
  CROSS JOIN LATERAL jsonb_array_elements(coalesce(nullif(s.snapshot->'products','null'::jsonb),'[]'::jsonb)) WITH ORDINALITY AS x(p,n)
  LEFT JOIN LATERAL jsonb_array_elements(coalesce(nullif(p->'variants','null'::jsonb),'[]'::jsonb)) WITH ORDINALITY AS y(v,vn) ON true
  WHERE s.store_id=p_store
 ), entries AS (SELECT * FROM catalogue UNION SELECT * FROM live_entries),
 active AS (SELECT count(*) AS n FROM public.store_members WHERE store_id=p_store AND role<>'owner'),
 pending AS (
  SELECT count(DISTINCT lower(i.email)) AS n FROM public.email_staff_invites i
  WHERE i.store_id=p_store AND i.accepted_at IS NULL AND i.expires_at>now()
   AND NOT EXISTS(SELECT 1 FROM public.store_members m JOIN public.users u ON u.id=m.user_id
    WHERE m.store_id=p_store AND lower(u.email)=lower(i.email))
 )
 SELECT jsonb_build_object('products',(SELECT count(DISTINCT id) FROM entries),'skus',(SELECT count(*) FROM entries),
  'storage',(SELECT coalesce(sum(size_bytes),0) FROM public.media WHERE store_id=p_store)
   +(SELECT coalesce(sum(storage_reserve_bytes),0) FROM public.media_image_jobs WHERE store_id=p_store),
  'staff',(SELECT n FROM active)+(SELECT n FROM pending),
  'staff_active',(SELECT n FROM active),'staff_pending',(SELECT n FROM pending))
$$;

CREATE FUNCTION public.media_image_create(p_store uuid,p_token text,p_request uuid,p_placement text,p_prompt text,
 p_width integer,p_height integer,p_reference uuid) RETURNS public.media_image_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE job public.media_image_jobs; uid uuid; cap numeric; used numeric; limits jsonb; usage jsonb; jid uuid:=gen_random_uuid();
BEGIN
 IF NOT public.media_image_access(p_store,p_token) THEN RAISE EXCEPTION 'Owner access required' USING ERRCODE='42501'; END IF;
 PERFORM store_id FROM public.stores WHERE store_id=p_store FOR UPDATE;
 SELECT * INTO job FROM public.media_image_jobs WHERE store_id=p_store AND request_id=p_request;
 IF FOUND THEN
  IF job.prompt<>p_prompt OR job.placement_id<>p_placement OR job.width<>p_width OR job.height<>p_height
   OR job.reference_id IS DISTINCT FROM p_reference THEN RAISE EXCEPTION 'This request identifier belongs to a different image' USING ERRCODE='22023'; END IF;
  RETURN job;
 END IF;
 IF p_request IS NULL OR p_prompt IS NULL OR length(p_prompt) NOT BETWEEN 10 AND 1500 OR p_placement IS NULL
  OR p_width IS NULL OR p_height IS NULL OR p_width NOT BETWEEN 512 AND 2048 OR p_height NOT BETWEEN 512 AND 2048
  OR p_width%16<>0 OR p_height%16<>0 OR p_width*p_height>1600000 THEN
  RAISE EXCEPTION 'Invalid generation input' USING ERRCODE='22023';
 END IF;
 IF (SELECT count(*) FROM public.media_image_jobs WHERE store_id=p_store AND created_at>=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')>=3 THEN
  RAISE EXCEPTION 'This store has used its three image requests for today' USING ERRCODE='P0001';
 END IF;
 IF EXISTS(SELECT 1 FROM public.media_image_jobs WHERE store_id=p_store AND status IN('queued','generating')) THEN
  RAISE EXCEPTION 'An image is already being generated. Review recent images first' USING ERRCODE='P0001';
 END IF;
 IF (SELECT count(*) FROM public.media_image_jobs WHERE store_id=p_store AND status='ready')>=5 THEN
  RAISE EXCEPTION 'Save your pending images to the library before generating more' USING ERRCODE='P0001';
 END IF;
 IF p_reference IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.media WHERE store_id=p_store AND id=p_reference
   AND kind='image' AND content_type IN('image/png','image/jpeg','image/webp') AND size_bytes<=4194304
   AND width*height<=4000000) THEN
  RAISE EXCEPTION 'Choose a library reference up to 4 MB and 4 megapixels' USING ERRCODE='22023';
 END IF;
 usage:=public._plan_capacity_usage(p_store);limits:=public._plan_capacity_limits(p_store);
 IF limits->>'storage' IS NULL OR (usage->>'storage')::bigint+10485760>(limits->>'storage')::bigint THEN
  RAISE EXCEPTION 'Storage allowance reached' USING ERRCODE='PQU01',
   DETAIL=jsonb_build_object('resource','storage','used',usage->'storage','projected',(usage->>'storage')::bigint+10485760,'limit',limits->'storage')::text;
 END IF;
 SELECT monthly_cap_usd INTO cap FROM public.ai_platform_settings WHERE singleton FOR UPDATE;
 SELECT coalesce(sum(CASE WHEN status='reserved' THEN reserved_usd ELSE cost_usd END),0) INTO used
  FROM public.ai_usage WHERE created_at>=date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
 SELECT used+coalesce(sum(reserved_usd),0) INTO used FROM public.media_image_jobs
  WHERE created_at>=date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
 IF cap IS NULL OR used+1>cap THEN RAISE EXCEPTION 'The platform trial budget is used. Please try later' USING ERRCODE='P0001'; END IF;
 SELECT user_id INTO uid FROM public.sessions WHERE token_hash=p_token;
 INSERT INTO public.media_image_jobs(id,store_id,user_id,request_id,placement_id,prompt,reference_id,width,height,object_key)
  VALUES(jid,p_store,uid,p_request,p_placement,p_prompt,p_reference,p_width,p_height,'stores/'||p_store||'/'||jid||'.webp') RETURNING * INTO job;
 RETURN job;
END $$;

CREATE FUNCTION public.media_image_claim(p_store uuid,p_job uuid) RETURNS SETOF public.media_image_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF p_store IS DISTINCT FROM NULLIF(current_setting('app.store_id',true),'')::uuid THEN RAISE EXCEPTION 'Store isolation denied' USING ERRCODE='42501'; END IF;
 RETURN QUERY UPDATE public.media_image_jobs SET status='generating',updated_at=clock_timestamp()
  WHERE store_id=p_store AND id=p_job AND status='queued' RETURNING *;
END $$;
CREATE FUNCTION public.media_image_finish(p_store uuid,p_job uuid,p_result jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF p_store IS DISTINCT FROM NULLIF(current_setting('app.store_id',true),'')::uuid THEN RAISE EXCEPTION 'Store isolation denied' USING ERRCODE='42501'; END IF;
 IF p_result->>'status' NOT IN('ready','failed') THEN RAISE EXCEPTION 'Invalid image result' USING ERRCODE='22023'; END IF;
 UPDATE public.media_image_jobs SET status=p_result->>'status',updated_at=clock_timestamp(),
  content_type=p_result->>'content_type',size_bytes=(p_result->>'size_bytes')::bigint,
  storage_reserve_bytes=CASE WHEN p_result->>'status'='ready' THEN (p_result->>'size_bytes')::bigint ELSE 0 END,
  provider_ms=(p_result->>'provider_ms')::integer,total_ms=(p_result->>'total_ms')::integer,
  provider_usage=coalesce(p_result->'usage','{}'),error=left(p_result->>'error',500)
  WHERE store_id=p_store AND id=p_job AND status='generating';
END $$;

CREATE FUNCTION public.media_image_save(p_store uuid,p_token text,p_job uuid) RETURNS public.media_image_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE job public.media_image_jobs;
BEGIN
 IF NOT public.media_image_access(p_store,p_token) THEN RAISE EXCEPTION 'Owner access required' USING ERRCODE='42501'; END IF;
 PERFORM store_id FROM public.stores WHERE store_id=p_store FOR UPDATE;
 SELECT * INTO job FROM public.media_image_jobs WHERE store_id=p_store AND id=p_job FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Image not found' USING ERRCODE='22023'; END IF;
 IF job.status='saved' THEN RETURN job; END IF;
 IF job.status<>'ready' THEN RAISE EXCEPTION 'The image is not ready to save' USING ERRCODE='22023'; END IF;
 UPDATE public.media_image_jobs SET storage_reserve_bytes=0 WHERE id=p_job;
 INSERT INTO public.media(id,store_id,kind,object_key,content_type,size_bytes,width,height,alt_text,upload_type)
  VALUES(job.id,p_store,'image',job.object_key,job.content_type,job.size_bytes,job.width,job.height,'Store creative','image');
 UPDATE public.media_image_jobs SET status='saved',media_id=job.id,updated_at=clock_timestamp() WHERE id=p_job RETURNING * INTO job;
 RETURN job;
END $$;

CREATE FUNCTION public.media_image_is_saved(p_store uuid,p_key text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM public.media_image_jobs j JOIN public.media m ON m.store_id=j.store_id AND m.id=j.media_id
  WHERE j.store_id=p_store AND j.object_key=p_key AND j.status='saved')
$$;
CREATE FUNCTION public.media_image_pending() RETURNS TABLE(store_id uuid,id uuid,status text,object_key text)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT store_id,id,status,object_key FROM public.media_image_jobs
 WHERE status='queued' OR (status='generating' AND updated_at<now()-interval '15 minutes')
 ORDER BY created_at LIMIT 20
$$;

-- The historical builder and this trial share the same locked monthly budget.
CREATE OR REPLACE FUNCTION public.ai_budget_reserve(p_store uuid,p_job uuid,p_operation uuid,p_kind text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE cap numeric; used numeric; amount numeric;
BEGIN
 IF p_store IS DISTINCT FROM NULLIF(current_setting('app.store_id',true),'')::uuid THEN RAISE EXCEPTION 'Store isolation denied' USING ERRCODE='42501'; END IF;
 IF p_operation IS NULL OR NOT EXISTS(SELECT 1 FROM public.ai_generation_jobs WHERE store_id=p_store AND id=p_job AND status='generating') THEN
  RAISE EXCEPTION 'Invalid generation operation' USING ERRCODE='22023'; END IF;
 amount:=CASE p_kind WHEN 'text' THEN 0.20 WHEN 'image' THEN 0.35 ELSE NULL END;
 IF amount IS NULL THEN RAISE EXCEPTION 'Invalid usage kind' USING ERRCODE='22023'; END IF;
 SELECT monthly_cap_usd INTO cap FROM public.ai_platform_settings WHERE singleton FOR UPDATE;
 SELECT coalesce(sum(CASE WHEN status='reserved' THEN reserved_usd ELSE cost_usd END),0) INTO used
  FROM public.ai_usage WHERE created_at>=date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
 SELECT used+coalesce(sum(reserved_usd),0) INTO used FROM public.media_image_jobs
  WHERE created_at>=date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
 IF cap IS NULL OR used+amount>cap THEN RAISE EXCEPTION 'AI spending limit reached. Please try again later.' USING ERRCODE='P0001'; END IF;
 INSERT INTO public.ai_usage(id,store_id,job_id,kind,reserved_usd) VALUES(p_operation,p_store,p_job,p_kind,amount);
 RETURN p_operation;
END $$;

REVOKE ALL ON FUNCTION public.media_image_access(uuid,text),public.media_image_create(uuid,text,uuid,text,text,integer,integer,uuid),
 public.media_image_claim(uuid,uuid),public.media_image_finish(uuid,uuid,jsonb),public.media_image_save(uuid,text,uuid),
 public.media_image_is_saved(uuid,text),public.media_image_pending() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.media_image_access(uuid,text),public.media_image_create(uuid,text,uuid,text,text,integer,integer,uuid),
 public.media_image_claim(uuid,uuid),public.media_image_finish(uuid,uuid,jsonb),public.media_image_save(uuid,text,uuid),
 public.media_image_is_saved(uuid,text),public.media_image_pending() TO lebrands_app;

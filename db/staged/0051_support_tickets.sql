-- Operator-applied only. No existing tickets, identities or email settings change.
DO $$ BEGIN
 IF NOT coalesce((SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname=current_user),false)
 THEN RAISE EXCEPTION 'Administrative BYPASSRLS connection required'; END IF;
 IF to_regclass('public.platform_email_jobs') IS NULL OR to_regclass('public.platform_administrators') IS NULL
 THEN RAISE EXCEPTION 'Transactional email and platform admin migrations are required'; END IF;
 -- Never erase independently changed email guards on a drifted database.
 IF(SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex') FROM pg_proc
 WHERE oid=to_regprocedure('public.email_claim_platform(uuid,text)'))
 IS DISTINCT FROM 'd421e10098d16296ab41dad755b36e0c91399433f44d0d39d5308e5ad000717e'
 THEN RAISE EXCEPTION 'Existing email claim differs from reviewed baseline; review before applying support migration'; END IF;
END $$;

CREATE TABLE public.support_categories(
 code text PRIMARY KEY CHECK(code~'^[a-z][a-z0-9_]{1,49}$'),
 parent_code text REFERENCES public.support_categories(code),
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 100),
 description text NOT NULL DEFAULT '' CHECK(length(description)<=500),
 sort_order integer NOT NULL DEFAULT 0,is_active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
INSERT INTO public.support_categories(code,name,sort_order) VALUES
 ('account','Account and access',10),('store_setup','Store creation and setup',20),
 ('business_verification','Business verification and documents',30),
 ('ann','Ann store builder',40),('themes','Themes and theme editor',50),
 ('pages','Pages and navigation',60),('sections','Sections and grids',70),
 ('media','Images and media',80),('catalogue','Products, variants and collections',90),
 ('inventory','Stock and inventory',100),('checkout','Cart, checkout and COD',110),
 ('orders','Orders and customer accounts',120),('returns','Returns, refunds and RTO',130),
 ('razorpay','Razorpay payments',140),('domain','Custom domain, DNS and SSL',150),
 ('delivery','Delivery and Shiprocket',160),('meta','Meta integration',170),
 ('google','Google Analytics and Google Ads',180),('subscription','Plans and subscriptions',190),
 ('billing','Billing and charges',200),('tax','GST and invoices',210),
 ('offers','Offers and discount codes',220),('analytics','Analytics, costs and reports',230),
 ('emails','Email and notifications',240),('seo','Website performance and SEO',250),
 ('publishing','Saving and publishing',260),('security','Security and privacy',270),
 ('feedback','Feedback and feature requests',280),('other','Other help',290);

CREATE TABLE public.support_tickets(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 ticket_number bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
 requester_user_id uuid NOT NULL REFERENCES public.users(id),
 scope text NOT NULL CHECK(scope IN('account','store')),
 store_id uuid REFERENCES public.stores(store_id),
 category_code text NOT NULL REFERENCES public.support_categories(code),
 subject text NOT NULL CHECK(length(btrim(subject)) BETWEEN 5 AND 160),
 status text NOT NULL DEFAULT 'created' CHECK(status IN('created','pending','closed')),
 priority text NOT NULL DEFAULT 'normal' CHECK(priority IN('low','normal','high','urgent')),
 waiting_on text CHECK(waiting_on IN('brand','support')),
 assigned_admin_user_id uuid REFERENCES public.platform_administrators(user_id),
 source text NOT NULL CHECK(source IN('account','onboarding','dashboard','ann','theme_editor')),
 last_message_number bigint NOT NULL DEFAULT 0,last_activity_at timestamptz NOT NULL DEFAULT now(),
 closed_at timestamptz,closed_by_user_id uuid REFERENCES public.users(id),resolution_message_id uuid,
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
 idempotency_key uuid NOT NULL,creation_payload_hash text NOT NULL CHECK(creation_payload_hash~'^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(requester_user_id,idempotency_key),
 CHECK((scope='account' AND store_id IS NULL) OR(scope='store' AND store_id IS NOT NULL)),
 CHECK(waiting_on IS NULL OR status='pending'),
 CHECK((status='closed' AND closed_at IS NOT NULL AND closed_by_user_id IS NOT NULL AND resolution_message_id IS NOT NULL)
 OR(status<>'closed' AND closed_at IS NULL AND closed_by_user_id IS NULL AND resolution_message_id IS NULL)));
CREATE INDEX support_tickets_requester ON public.support_tickets(requester_user_id,last_activity_at DESC);
CREATE INDEX support_tickets_store ON public.support_tickets(store_id,last_activity_at DESC);
CREATE INDEX support_tickets_queue ON public.support_tickets(status,priority,last_activity_at DESC);
CREATE INDEX support_tickets_assignee ON public.support_tickets(assigned_admin_user_id,status,last_activity_at DESC);
CREATE INDEX support_tickets_category ON public.support_tickets(category_code,last_activity_at DESC);

CREATE TABLE public.support_ticket_participants(
 ticket_id uuid NOT NULL REFERENCES public.support_tickets(id),user_id uuid NOT NULL REFERENCES public.users(id),
 participant_role text NOT NULL CHECK(participant_role IN('requester','brand_owner','collaborator')),
 added_by_user_id uuid NOT NULL REFERENCES public.users(id),notify_replies boolean NOT NULL DEFAULT true,
 last_read_message_number bigint NOT NULL DEFAULT 0 CHECK(last_read_message_number>=0),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),removed_at timestamptz,PRIMARY KEY(ticket_id,user_id));
CREATE INDEX support_participants_user ON public.support_ticket_participants(user_id,ticket_id);
CREATE TABLE public.support_ticket_messages(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),ticket_id uuid NOT NULL REFERENCES public.support_tickets(id),
 message_number bigint NOT NULL CHECK(message_number>0),author_user_id uuid NOT NULL REFERENCES public.users(id),
 author_role text NOT NULL CHECK(author_role IN('brand','platform_admin')),
 visibility text NOT NULL DEFAULT 'public' CHECK(visibility IN('public','internal')),
 body text NOT NULL CHECK(length(btrim(body)) BETWEEN 1 AND 20000),
 client_message_key uuid NOT NULL,original_payload_hash text NOT NULL CHECK(original_payload_hash~'^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),redacted_at timestamptz,
 redacted_by_user_id uuid REFERENCES public.users(id),redaction_reason text,
 UNIQUE(ticket_id,id),UNIQUE(ticket_id,message_number),UNIQUE(ticket_id,author_user_id,client_message_key),
 CHECK(visibility='public' OR author_role='platform_admin'));
ALTER TABLE public.support_tickets ADD FOREIGN KEY(id,resolution_message_id)
 REFERENCES public.support_ticket_messages(ticket_id,id);
CREATE TABLE public.support_ticket_attachments(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),ticket_id uuid NOT NULL,message_id uuid NOT NULL,
 uploaded_by_user_id uuid NOT NULL REFERENCES public.users(id),object_key text NOT NULL UNIQUE,
 original_filename text NOT NULL CHECK(length(original_filename) BETWEEN 1 AND 240),
 mime_type text NOT NULL CHECK(mime_type IN('image/png','image/jpeg','image/webp','application/pdf')),
 size_bytes bigint NOT NULL CHECK(size_bytes BETWEEN 1 AND 10485760),
 sha256 text NOT NULL CHECK(sha256~'^[a-f0-9]{64}$'),
 scan_status text NOT NULL DEFAULT 'pending' CHECK(scan_status IN('pending','clean','rejected','failed')),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),deleted_at timestamptz,
 FOREIGN KEY(ticket_id,message_id) REFERENCES public.support_ticket_messages(ticket_id,id));
CREATE INDEX support_attachments_message ON public.support_ticket_attachments(ticket_id,message_id);
CREATE TABLE public.support_ticket_links(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),ticket_id uuid NOT NULL REFERENCES public.support_tickets(id),
 link_type text NOT NULL CHECK(link_type IN('context','store','theme','page','section','product','order','integration','subscription','invoice')),
 resource_id text CHECK(length(resource_id)<=160),resource_store_id uuid REFERENCES public.stores(store_id),
 label text NOT NULL CHECK(length(label)<=200),
 context jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(context)='object' AND octet_length(context::text)<=8192),
 created_by_user_id uuid NOT NULL REFERENCES public.users(id),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX support_links_resource ON public.support_ticket_links(ticket_id,link_type,resource_id) WHERE resource_id IS NOT NULL;
CREATE TABLE public.support_ticket_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),ticket_id uuid NOT NULL REFERENCES public.support_tickets(id),
 event_type text NOT NULL CHECK(event_type IN('created','status_changed','assigned','priority_changed','participant_changed','message_added','attachment_added','redacted')),
 actor_user_id uuid REFERENCES public.users(id),actor_role text NOT NULL CHECK(actor_role IN('brand','platform_admin','system')),
 visibility text NOT NULL DEFAULT 'public' CHECK(visibility IN('public','internal')),
 old_status text CHECK(old_status IN('created','pending','closed')),new_status text CHECK(new_status IN('created','pending','closed')),
 message_id uuid,metadata jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(metadata)='object' AND octet_length(metadata::text)<=8192),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(ticket_id,id),
 FOREIGN KEY(ticket_id,message_id) REFERENCES public.support_ticket_messages(ticket_id,id));
CREATE INDEX support_events_ticket ON public.support_ticket_events(ticket_id,created_at,id);
CREATE TABLE public.support_ticket_notifications(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),ticket_id uuid NOT NULL,event_id uuid NOT NULL,
 notification_type text NOT NULL CHECK(notification_type IN('ticket_created','ticket_closed','ticket_reply')),
 recipient_user_id uuid REFERENCES public.users(id),recipient_config_key text CHECK(recipient_config_key='support_primary'),
 audience text NOT NULL CHECK(audience IN('brand','admin')),recipient_fingerprint text,
 email_job_id uuid UNIQUE REFERENCES public.platform_email_jobs(id),
 state text NOT NULL DEFAULT 'pending' CHECK(state IN('pending','enqueued','cancelled')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 8),next_attempt_at timestamptz NOT NULL DEFAULT now(),
 lease_until timestamptz,last_error_code text,delivery_seed uuid NOT NULL,
 capability_hash text NOT NULL CHECK(capability_hash~'^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(ticket_id,event_id) REFERENCES public.support_ticket_events(ticket_id,id),
 CHECK((recipient_user_id IS NULL)<>(recipient_config_key IS NULL)),
 CHECK(recipient_fingerprint IS NULL OR recipient_fingerprint~'^[a-f0-9]{64}$'));
CREATE UNIQUE INDEX support_notifications_user_once ON public.support_ticket_notifications(event_id,recipient_user_id) WHERE recipient_user_id IS NOT NULL;
CREATE UNIQUE INDEX support_notifications_config_once ON public.support_ticket_notifications(event_id,recipient_config_key) WHERE recipient_config_key IS NOT NULL;
CREATE UNIQUE INDEX support_notifications_address_once ON public.support_ticket_notifications(event_id,recipient_fingerprint) WHERE recipient_fingerprint IS NOT NULL AND state<>'cancelled';
CREATE INDEX support_notifications_due ON public.support_ticket_notifications(state,next_attempt_at) WHERE state='pending';

CREATE FUNCTION public.support_actor(p_token text,p_admin boolean DEFAULT false) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid;
BEGIN
 IF p_admin IS NULL THEN RAISE EXCEPTION 'Explicit support role required' USING ERRCODE='22023'; END IF;
 IF p_admin THEN RETURN public.platform_admin_actor(p_token); END IF;
 SELECT s.user_id INTO actor FROM public.sessions s JOIN public.users u ON u.id=s.user_id
 WHERE s.token_hash=p_token AND s.revoked_at IS NULL AND s.expires_at>now() AND NOT u.must_change_password FOR SHARE OF s,u;
 IF actor IS NULL THEN RAISE EXCEPTION 'Sign in to get support' USING ERRCODE='42501'; END IF;
 RETURN actor;
END $$;
CREATE FUNCTION public.support_access(p_ticket uuid,p_actor uuid,p_admin boolean) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t public.support_tickets; member_role text;
BEGIN
 SELECT * INTO t FROM public.support_tickets WHERE id=p_ticket;
 IF NOT FOUND THEN RETURN false; END IF;
 IF p_admin THEN RETURN true; END IF;
 IF t.scope='account' THEN RETURN t.requester_user_id=p_actor; END IF;
 SELECT role INTO member_role FROM public.store_members WHERE store_id=t.store_id AND user_id=p_actor FOR SHARE;
 RETURN coalesce(member_role='owner' OR(member_role IS NOT NULL AND(t.requester_user_id=p_actor OR EXISTS(
 SELECT 1 FROM public.support_ticket_participants WHERE ticket_id=t.id AND user_id=p_actor AND removed_at IS NULL))),false);
END $$;
CREATE FUNCTION public.support_notify(p_ticket uuid,p_event uuid,p_kind text,p_seed uuid,p_cap text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 INSERT INTO public.support_ticket_notifications(ticket_id,event_id,notification_type,recipient_user_id,audience,delivery_seed,capability_hash)
 SELECT p_ticket,p_event,p_kind,u,'brand',p_seed,p_cap FROM (
 SELECT requester_user_id AS u FROM public.support_tickets WHERE id=p_ticket
 UNION SELECT m.user_id FROM public.store_members m JOIN public.support_tickets t ON t.store_id=m.store_id
 WHERE t.id=p_ticket AND m.role='owner') r;
 INSERT INTO public.support_ticket_notifications(ticket_id,event_id,notification_type,recipient_config_key,audience,delivery_seed,capability_hash)
 VALUES(p_ticket,p_event,p_kind,'support_primary','admin',p_seed,p_cap);
END $$;
CREATE FUNCTION public.support_message_insert(p_ticket uuid,p_actor uuid,p_admin boolean,p_body text,p_visibility text,p_key uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE msg uuid; seq bigint;
BEGIN
 UPDATE public.support_tickets SET last_message_number=last_message_number+1,revision=revision+1,
 last_activity_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=p_ticket RETURNING last_message_number INTO seq;
 INSERT INTO public.support_ticket_messages(ticket_id,message_number,author_user_id,author_role,visibility,body,client_message_key,original_payload_hash)
 VALUES(p_ticket,seq,p_actor,CASE WHEN p_admin THEN 'platform_admin' ELSE 'brand' END,p_visibility,p_body,p_key,
 encode(sha256(convert_to(jsonb_build_object('body',p_body,'visibility',p_visibility)::text,'UTF8')),'hex')) RETURNING id INTO msg;
 RETURN msg;
END $$;
CREATE FUNCTION public.support_detail(p_token text,p_ticket uuid,p_admin boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid; result jsonb;
BEGIN
 actor:=public.support_actor(p_token,p_admin);
 IF NOT public.support_access(p_ticket,actor,p_admin) THEN RAISE EXCEPTION 'Ticket access denied' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object('id',t.id,'ticket_number',t.ticket_number::text,'subject',t.subject,'status',t.status,
 'priority',t.priority,'revision',t.revision::text,'category_code',t.category_code,'category_name',c.name,
 'store_id',t.store_id,'store_name',s.name,'requester_name',u.name,'source',t.source,
 'assigned_admin_user_id',CASE WHEN p_admin THEN t.assigned_admin_user_id END,'waiting_on',t.waiting_on,
 'created_at',t.created_at,'last_activity_at',CASE WHEN p_admin THEN t.last_activity_at ELSE
 (SELECT max(created_at) FROM public.support_ticket_events WHERE ticket_id=t.id AND visibility='public') END,
 'messages',coalesce((SELECT jsonb_agg(jsonb_build_object('id',m.id,'author_name',a.name,'author_role',m.author_role,
 'visibility',m.visibility,'body',CASE WHEN m.redacted_at IS NOT NULL THEN '[Message removed]' ELSE m.body END,'created_at',m.created_at)
 ORDER BY m.message_number) FROM public.support_ticket_messages m JOIN public.users a ON a.id=m.author_user_id
 WHERE m.ticket_id=t.id AND(p_admin OR m.visibility='public')),'[]'::jsonb),
 'context',coalesce((SELECT context FROM public.support_ticket_links WHERE ticket_id=t.id AND link_type='context' LIMIT 1),'{}'::jsonb),
 'events',coalesce((SELECT jsonb_agg(jsonb_build_object('event_type',e.event_type,'old_status',e.old_status,'new_status',e.new_status,'created_at',e.created_at)
 ORDER BY e.created_at,e.id) FROM public.support_ticket_events e WHERE e.ticket_id=t.id AND(p_admin OR e.visibility='public')),'[]'::jsonb),
 'notifications',CASE WHEN p_admin THEN coalesce((SELECT jsonb_agg(jsonb_build_object('notification_type',n.notification_type,'audience',n.audience,
 'state',n.state,'delivery_status',coalesce(j.delivery_status,j.status),'created_at',n.created_at))
 FROM public.support_ticket_notifications n LEFT JOIN public.platform_email_jobs j ON j.id=n.email_job_id WHERE n.ticket_id=t.id),'[]'::jsonb) ELSE '[]'::jsonb END)
 INTO result FROM public.support_tickets t JOIN public.users u ON u.id=t.requester_user_id
 JOIN public.support_categories c ON c.code=t.category_code LEFT JOIN public.stores s ON s.store_id=t.store_id WHERE t.id=p_ticket;
 RETURN result;
END $$;
CREATE FUNCTION public.support_list(p_token text,p_admin boolean,p_status text,p_query text,p_category text,p_page integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid; items jsonb; total bigint;
BEGIN
 actor:=public.support_actor(p_token,p_admin);
 IF p_status NOT IN('all','created','pending','closed') OR length(p_query)>100 OR p_page<0 OR p_page>10000
 THEN RAISE EXCEPTION 'Invalid support filter' USING ERRCODE='22023'; END IF;
 WITH visible AS(SELECT t.* FROM public.support_tickets t WHERE(p_admin OR(
 (t.requester_user_id=actor OR t.store_id IN(SELECT store_id FROM public.store_members WHERE user_id=actor)) AND public.support_access(t.id,actor,false)))
 AND(p_status='all' OR t.status=p_status) AND(p_category='all' OR t.category_code=p_category)
 AND(p_query='' OR t.subject ILIKE '%'||p_query||'%' OR t.ticket_number::text=replace(upper(p_query),'SUP-','')))
 SELECT count(*) INTO total FROM visible;
 SELECT coalesce(jsonb_agg(r.data ORDER BY r.activity DESC,r.id DESC),'[]'::jsonb) INTO items FROM(
 SELECT t.id,CASE WHEN p_admin THEN t.last_activity_at ELSE(SELECT max(created_at) FROM public.support_ticket_events WHERE ticket_id=t.id AND visibility='public') END AS activity,
 jsonb_build_object('id',t.id,'ticket_number',t.ticket_number::text,'subject',t.subject,
 'status',t.status,'priority',t.priority,'store_name',s.name,'requester_name',u.name,'created_at',t.created_at,
 'last_activity_at',CASE WHEN p_admin THEN t.last_activity_at ELSE(SELECT max(created_at) FROM public.support_ticket_events WHERE ticket_id=t.id AND visibility='public') END) AS data
 FROM public.support_tickets t JOIN public.users u ON u.id=t.requester_user_id LEFT JOIN public.stores s ON s.store_id=t.store_id
 WHERE(p_admin OR((t.requester_user_id=actor OR t.store_id IN(SELECT store_id FROM public.store_members WHERE user_id=actor)) AND public.support_access(t.id,actor,false))) AND(p_status='all' OR t.status=p_status)
 AND(p_category='all' OR t.category_code=p_category) AND(p_query='' OR t.subject ILIKE '%'||p_query||'%' OR t.ticket_number::text=replace(upper(p_query),'SUP-',''))
 ORDER BY activity DESC,t.id DESC LIMIT 25 OFFSET p_page*25) r;
 RETURN jsonb_build_object('admin',p_admin,'tickets',items,'total',total,'page',p_page,
 'filters',jsonb_build_object('status',p_status,'q',p_query,'category',p_category),
 'categories',(SELECT coalesce(jsonb_agg(jsonb_build_object('code',code,'name',name) ORDER BY sort_order),'[]'::jsonb) FROM public.support_categories WHERE is_active),
 'stores',(SELECT coalesce(jsonb_agg(jsonb_build_object('store_id',s.store_id,'name',s.name) ORDER BY s.name),'[]'::jsonb)
 FROM public.stores s JOIN public.store_members m ON m.store_id=s.store_id WHERE m.user_id=actor),
 'admins',CASE WHEN p_admin THEN(SELECT coalesce(jsonb_agg(jsonb_build_object('user_id',a.user_id,'name',u.name) ORDER BY u.name),'[]'::jsonb)
 FROM public.platform_administrators a JOIN public.users u ON u.id=a.user_id WHERE a.active) ELSE '[]'::jsonb END);
END $$;
CREATE FUNCTION public.support_create(p_token text,p_data jsonb,p_seed uuid,p_cap text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid; store uuid; ticket uuid; msg uuid; event uuid; fingerprint text; existing public.support_tickets; pair record;
BEGIN
 actor:=public.support_actor(p_token,false);
 IF jsonb_typeof(p_data)<>'object' OR octet_length(p_data::text)>65536 OR p_cap !~ '^[a-f0-9]{64}$'
 OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_data) k WHERE k NOT IN('subject','body','category_code','store_id','source','context','idempotency_key'))
 OR jsonb_typeof(p_data->'subject') IS DISTINCT FROM 'string' OR jsonb_typeof(p_data->'body') IS DISTINCT FROM 'string'
 OR jsonb_typeof(p_data->'idempotency_key') IS DISTINCT FROM 'string'
 OR coalesce(length(btrim(p_data->>'subject')),0) NOT BETWEEN 5 AND 160 OR coalesce(length(btrim(p_data->>'body')),0) NOT BETWEEN 1 AND 20000
 OR coalesce(p_data->>'source','') NOT IN('account','onboarding','dashboard','ann','theme_editor')
 OR jsonb_typeof(p_data->'context') IS DISTINCT FROM 'object' OR octet_length((p_data->'context')::text)>8192
 THEN RAISE EXCEPTION 'Check ticket details' USING ERRCODE='22023'; END IF;
 FOR pair IN SELECT * FROM jsonb_each(p_data->'context') LOOP
 IF pair.key NOT IN('pathname','theme_key','page_slug','section_id','provider') OR jsonb_typeof(pair.value)<>'string'
 OR length(pair.value#>>'{}')>200 OR(pair.value#>>'{}')~'[\r\n<>]' OR(pair.key='pathname' AND ((pair.value#>>'{}') !~ '^/[a-zA-Z0-9/_.,:~-]*$'))
 THEN RAISE EXCEPTION 'Use safe page context' USING ERRCODE='22023'; END IF;
 END LOOP;
 store:=nullif(p_data->>'store_id','')::uuid;
 IF store IS NOT NULL THEN
 PERFORM 1 FROM public.store_members WHERE store_id=store AND user_id=actor FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Store access denied' USING ERRCODE='42501'; END IF; END IF;
 PERFORM 1 FROM public.users WHERE id=actor FOR UPDATE;
 fingerprint:=encode(sha256(convert_to(p_data::text,'UTF8')),'hex');
 SELECT * INTO existing FROM public.support_tickets WHERE requester_user_id=actor AND idempotency_key=(p_data->>'idempotency_key')::uuid;
 IF FOUND THEN
 IF existing.creation_payload_hash<>fingerprint THEN RAISE EXCEPTION 'Request key already used with different details' USING ERRCODE='22023'; END IF;
 RETURN existing.id; END IF;
 IF(SELECT count(*) FROM public.support_tickets WHERE requester_user_id=actor AND created_at>now()-interval '1 hour')>=12
 THEN RAISE EXCEPTION 'Please wait before creating another ticket' USING ERRCODE='P0001'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.support_categories WHERE code=p_data->>'category_code' AND is_active)
 THEN RAISE EXCEPTION 'Choose a support topic' USING ERRCODE='22023'; END IF;
 INSERT INTO public.support_tickets(requester_user_id,scope,store_id,category_code,subject,source,idempotency_key,creation_payload_hash)
 VALUES(actor,CASE WHEN store IS NULL THEN 'account' ELSE 'store' END,store,p_data->>'category_code',btrim(p_data->>'subject'),
 p_data->>'source',(p_data->>'idempotency_key')::uuid,fingerprint) RETURNING id INTO ticket;
 INSERT INTO public.support_ticket_participants(ticket_id,user_id,participant_role,added_by_user_id) VALUES(ticket,actor,'requester',actor);
 msg:=public.support_message_insert(ticket,actor,false,btrim(p_data->>'body'),'public',(p_data->>'idempotency_key')::uuid);
 INSERT INTO public.support_ticket_links(ticket_id,link_type,label,context,created_by_user_id)
 VALUES(ticket,'context','Page details',p_data->'context',actor);
 INSERT INTO public.support_ticket_events(ticket_id,event_type,actor_user_id,actor_role,new_status,message_id)
 VALUES(ticket,'created',actor,'brand','created',msg) RETURNING id INTO event;
 PERFORM public.support_notify(ticket,event,'ticket_created',p_seed,p_cap);
 RETURN ticket;
END $$;
CREATE FUNCTION public.support_reply(p_token text,p_ticket uuid,p_admin boolean,p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid; t public.support_tickets; msg uuid; v text; oldmsg public.support_ticket_messages; fingerprint text;
BEGIN
 actor:=public.support_actor(p_token,p_admin);
 SELECT * INTO t FROM public.support_tickets WHERE id=p_ticket FOR UPDATE;
 IF NOT public.support_access(p_ticket,actor,p_admin) THEN RAISE EXCEPTION 'Ticket access denied' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(p_data)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_data) k WHERE k NOT IN('body','visibility','idempotency_key'))
 OR jsonb_typeof(p_data->'body') IS DISTINCT FROM 'string' OR jsonb_typeof(p_data->'idempotency_key') IS DISTINCT FROM 'string'
 OR coalesce(length(btrim(p_data->>'body')),0) NOT BETWEEN 1 AND 20000 THEN RAISE EXCEPTION 'Enter your reply' USING ERRCODE='22023'; END IF;
 v:=coalesce(p_data->>'visibility','public');
 IF v NOT IN('public','internal') OR(v='internal' AND NOT p_admin) THEN RAISE EXCEPTION 'Private notes require support access' USING ERRCODE='42501'; END IF;
 fingerprint:=encode(sha256(convert_to(jsonb_build_object('body',btrim(p_data->>'body'),'visibility',v)::text,'UTF8')),'hex');
 SELECT * INTO oldmsg FROM public.support_ticket_messages WHERE ticket_id=p_ticket AND author_user_id=actor AND client_message_key=(p_data->>'idempotency_key')::uuid;
 IF FOUND THEN
 IF oldmsg.original_payload_hash<>fingerprint THEN RAISE EXCEPTION 'Reply key already used' USING ERRCODE='22023'; END IF;
 RETURN public.support_detail(p_token,p_ticket,p_admin); END IF;
 IF(SELECT count(*) FROM public.support_ticket_messages WHERE author_user_id=actor AND created_at>now()-interval '1 hour')>=100
 THEN RAISE EXCEPTION 'Please wait before sending another reply' USING ERRCODE='P0001'; END IF;
 msg:=public.support_message_insert(p_ticket,actor,p_admin,btrim(p_data->>'body'),v,(p_data->>'idempotency_key')::uuid);
 IF v='public' AND(t.status='closed' OR(p_admin AND t.status='created')) THEN
 UPDATE public.support_tickets SET status='pending',waiting_on=CASE WHEN p_admin THEN 'brand' ELSE 'support' END,
 closed_at=NULL,closed_by_user_id=NULL,resolution_message_id=NULL WHERE id=p_ticket;
 INSERT INTO public.support_ticket_events(ticket_id,event_type,actor_user_id,actor_role,old_status,new_status)
 VALUES(p_ticket,'status_changed',actor,CASE WHEN p_admin THEN 'platform_admin' ELSE 'brand' END,t.status,'pending');
 ELSIF v='public' AND t.status='pending' THEN
 UPDATE public.support_tickets SET waiting_on=CASE WHEN p_admin THEN 'brand' ELSE 'support' END WHERE id=p_ticket; END IF;
 INSERT INTO public.support_ticket_events(ticket_id,event_type,actor_user_id,actor_role,visibility,message_id)
 VALUES(p_ticket,'message_added',actor,CASE WHEN p_admin THEN 'platform_admin' ELSE 'brand' END,v,msg);
 RETURN public.support_detail(p_token,p_ticket,p_admin);
END $$;
CREATE FUNCTION public.support_workflow(p_token text,p_ticket uuid,p_admin boolean,p_data jsonb,p_seed uuid,p_cap text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid; t public.support_tickets; target text; msg uuid; event uuid; assignee uuid;
BEGIN
 actor:=public.support_actor(p_token,p_admin);
 SELECT * INTO t FROM public.support_tickets WHERE id=p_ticket FOR UPDATE;
 IF NOT public.support_access(p_ticket,actor,p_admin) THEN RAISE EXCEPTION 'Ticket access denied' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(p_data)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_data) k WHERE k NOT IN('revision','status','resolution','assigned_admin_user_id','priority','waiting_on'))
 OR p_cap !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Invalid ticket update' USING ERRCODE='22023'; END IF;
 IF(p_data->>'revision')::bigint IS DISTINCT FROM t.revision THEN RAISE EXCEPTION 'Ticket changed. Refresh before updating.' USING ERRCODE='40001'; END IF;
 IF NOT p_admin AND EXISTS(SELECT 1 FROM jsonb_object_keys(p_data) k WHERE k NOT IN('revision','status','resolution'))
 THEN RAISE EXCEPTION 'Support administrator access required' USING ERRCODE='42501'; END IF;
 target:=coalesce(p_data->>'status',t.status);
 IF nullif(btrim(p_data->>'resolution'),'') IS NOT NULL AND NOT(target='closed' AND t.status<>'closed')
 THEN RAISE EXCEPTION 'A resolution is saved only when closing an open ticket' USING ERRCODE='22023'; END IF;
 IF target NOT IN('created','pending','closed') OR(target='created' AND t.status<>'created')
 OR(NOT p_admin AND NOT(target='closed' OR(t.status='closed' AND target='pending')))
 THEN RAISE EXCEPTION 'Choose a valid ticket status' USING ERRCODE='22023'; END IF;
 IF p_data?'assigned_admin_user_id' THEN
 assignee:=nullif(p_data->>'assigned_admin_user_id','')::uuid;
 IF assignee IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.platform_administrators WHERE user_id=assignee AND active)
 THEN RAISE EXCEPTION 'Choose an active support administrator' USING ERRCODE='22023'; END IF;
 UPDATE public.support_tickets SET assigned_admin_user_id=assignee WHERE id=p_ticket;
 INSERT INTO public.support_ticket_events(ticket_id,event_type,actor_user_id,actor_role,visibility) VALUES(p_ticket,'assigned',actor,'platform_admin','internal');
 END IF;
 IF p_data?'priority' THEN
 IF coalesce(p_data->>'priority','') NOT IN('low','normal','high','urgent') THEN RAISE EXCEPTION 'Invalid priority' USING ERRCODE='22023'; END IF;
 UPDATE public.support_tickets SET priority=p_data->>'priority' WHERE id=p_ticket;
 INSERT INTO public.support_ticket_events(ticket_id,event_type,actor_user_id,actor_role,visibility) VALUES(p_ticket,'priority_changed',actor,'platform_admin','internal'); END IF;
 IF p_data?'waiting_on' AND p_data->>'waiting_on' IS NOT NULL AND p_data->>'waiting_on' NOT IN('brand','support')
 THEN RAISE EXCEPTION 'Invalid waiting status' USING ERRCODE='22023'; END IF;
 IF target<>t.status THEN
 IF target='closed' THEN
 IF coalesce(length(btrim(p_data->>'resolution')),0) NOT BETWEEN 3 AND 20000 THEN RAISE EXCEPTION 'Enter a public resolution of at least 3 characters' USING ERRCODE='22023'; END IF;
 msg:=public.support_message_insert(p_ticket,actor,p_admin,btrim(p_data->>'resolution'),'public',gen_random_uuid());
 END IF;
 UPDATE public.support_tickets SET status=target,closed_at=CASE WHEN target='closed' THEN clock_timestamp() END,
 closed_by_user_id=CASE WHEN target='closed' THEN actor END,resolution_message_id=CASE WHEN target='closed' THEN msg END,
 waiting_on=CASE WHEN target='pending' THEN coalesce(p_data->>'waiting_on','support') END WHERE id=p_ticket;
 INSERT INTO public.support_ticket_events(ticket_id,event_type,actor_user_id,actor_role,old_status,new_status,message_id)
 VALUES(p_ticket,'status_changed',actor,CASE WHEN p_admin THEN 'platform_admin' ELSE 'brand' END,t.status,target,msg) RETURNING id INTO event;
 IF target='closed' THEN PERFORM public.support_notify(p_ticket,event,'ticket_closed',p_seed,p_cap); END IF;
 ELSIF p_data?'waiting_on' THEN
 UPDATE public.support_tickets SET waiting_on=CASE WHEN status='pending' THEN p_data->>'waiting_on' END WHERE id=p_ticket; END IF;
 UPDATE public.support_tickets SET revision=revision+1,updated_at=clock_timestamp(),last_activity_at=clock_timestamp() WHERE id=p_ticket;
 RETURN public.support_detail(p_token,p_ticket,p_admin);
END $$;

CREATE FUNCTION public.support_email_pending() RETURNS TABLE(id uuid,delivery_seed uuid)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT id,delivery_seed FROM public.support_ticket_notifications WHERE state='pending' AND attempts<8 AND next_attempt_at<=now()
 ORDER BY created_at LIMIT 50
$$;
CREATE FUNCTION public.support_email_details(p_id uuid,p_cap text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE n public.support_ticket_notifications; t public.support_tickets; address text;
BEGIN
 SELECT * INTO n FROM public.support_ticket_notifications WHERE id=p_id AND capability_hash=p_cap AND state='pending';
 IF NOT FOUND THEN RAISE EXCEPTION 'Delivery capability required' USING ERRCODE='42501'; END IF;
 SELECT * INTO t FROM public.support_tickets WHERE id=n.ticket_id;
 IF n.recipient_user_id IS NOT NULL THEN
 IF NOT public.support_access(t.id,n.recipient_user_id,false) THEN
 UPDATE public.support_ticket_notifications SET state='cancelled',last_error_code='recipient_access_revoked' WHERE id=p_id; RETURN NULL; END IF;
 SELECT email INTO address FROM public.users WHERE id=n.recipient_user_id; END IF;
 RETURN jsonb_build_object('recipient',address,'audience',n.audience,'ticket_id',t.id,'ticket_number',t.ticket_number::text,
 'subject',t.subject,'notification_type',n.notification_type,'status',CASE WHEN n.notification_type='ticket_closed' THEN 'closed' ELSE 'created' END);
END $$;
CREATE FUNCTION public.support_email_enqueue(p_id uuid,p_cap text,p_message jsonb,p_fingerprint text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE n public.support_ticket_notifications; job uuid; address text;
BEGIN
 SELECT * INTO n FROM public.support_ticket_notifications WHERE id=p_id AND capability_hash=p_cap FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Delivery capability required' USING ERRCODE='42501'; END IF;
 IF n.state<>'pending' THEN RETURN n.email_job_id; END IF;
 IF public.support_email_details(p_id,p_cap) IS NULL THEN RETURN NULL; END IF;
 IF jsonb_typeof(p_message)<>'object' OR octet_length(p_message::text)>50000 OR p_fingerprint !~ '^[a-f0-9]{64}$'
 THEN RAISE EXCEPTION 'Invalid support email' USING ERRCODE='22023'; END IF;
 IF n.recipient_user_id IS NOT NULL THEN SELECT email INTO address FROM public.users WHERE id=n.recipient_user_id;
 ELSE address:=p_message->'to'->>0; END IF;
 IF coalesce(address,'') !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' THEN RAISE EXCEPTION 'Email recipient unavailable' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(n.event_id::text||p_fingerprint,0));
 IF EXISTS(SELECT 1 FROM public.support_ticket_notifications WHERE event_id=n.event_id AND recipient_fingerprint=p_fingerprint AND state<>'cancelled' AND id<>n.id)
 THEN UPDATE public.support_ticket_notifications SET state='cancelled',last_error_code='duplicate_recipient' WHERE id=p_id; RETURN NULL; END IF;
 INSERT INTO public.platform_email_jobs(user_id,template,token_hash,payload,delivery_key_hash)
 VALUES(n.recipient_user_id,n.notification_type,encode(sha256(convert_to('support:'||n.delivery_seed::text,'UTF8')),'hex'),
 jsonb_set(p_message,'{to}',jsonb_build_array(address)),p_cap) RETURNING id INTO job;
 UPDATE public.support_ticket_notifications SET state='enqueued',recipient_fingerprint=p_fingerprint,email_job_id=job,updated_at=clock_timestamp() WHERE id=p_id;
 RETURN job;
END $$;
CREATE FUNCTION public.support_email_retry(p_id uuid,p_cap text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 UPDATE public.support_ticket_notifications SET attempts=attempts+1,last_error_code='email_preparation_failed',
 next_attempt_at=now()+make_interval(secs=>LEAST(900,10*power(2,attempts)::integer))
 WHERE id=p_id AND capability_hash=p_cap AND state='pending' AND attempts<8
$$;

-- Reauthorise delayed support deliveries, without granting new configuration
-- access or replacing the identity of the established email claim function.
CREATE FUNCTION public.support_email_job_allowed(p_job uuid,p_cap text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE n public.support_ticket_notifications; address text; payload jsonb;
BEGIN
 SELECT * INTO n FROM public.support_ticket_notifications WHERE email_job_id=p_job AND capability_hash=p_cap FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 IF n.recipient_user_id IS NOT NULL THEN
 IF NOT public.support_access(n.ticket_id,n.recipient_user_id,false) THEN
 UPDATE public.support_ticket_notifications SET state='cancelled',last_error_code='recipient_access_revoked' WHERE id=n.id;
 RETURN false; END IF;
 SELECT lower(email) INTO address FROM public.users WHERE id=n.recipient_user_id;
 SELECT j.payload INTO payload FROM public.platform_email_jobs j WHERE j.id=p_job;
 IF address IS DISTINCT FROM lower(payload->'to'->>0) THEN
 UPDATE public.support_ticket_notifications SET state='pending',email_job_id=NULL,recipient_fingerprint=NULL,
 attempts=0,next_attempt_at=now(),last_error_code='recipient_changed' WHERE id=n.id;
 RETURN false; END IF;
 END IF;
 RETURN true;
END $$;
CREATE OR REPLACE FUNCTION public.email_claim_platform(p_id uuid,p_delivery text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE job public.platform_email_jobs;
BEGIN
 SELECT * INTO job FROM public.platform_email_jobs WHERE id=p_id AND delivery_key_hash=p_delivery FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Delivery capability required' USING ERRCODE='42501'; END IF;
 IF job.template='reset' AND NOT EXISTS(SELECT 1 FROM public.email_reset_tokens WHERE user_id=job.user_id AND token_hash=job.token_hash AND expires_at>now()) THEN
 UPDATE public.platform_email_jobs SET status='cancelled' WHERE id=p_id;RETURN NULL; END IF;
 IF job.template='verification' AND NOT EXISTS(SELECT 1 FROM public.ai_email_verifications WHERE user_id=job.user_id AND token_hash=job.token_hash AND expires_at>now()) THEN
 UPDATE public.platform_email_jobs SET status='cancelled' WHERE id=p_id;RETURN NULL; END IF;
 IF job.attempts>=8 OR job.next_attempt_at>now() OR job.status IN('sent','cancelled','failed') OR(job.status='sending' AND job.lease_until>now()) THEN RETURN NULL; END IF;
 IF job.template IN('ticket_created','ticket_closed') AND NOT public.support_email_job_allowed(p_id,p_delivery) THEN
 UPDATE public.platform_email_jobs SET status='cancelled',error_code='support_recipient_changed' WHERE id=p_id; RETURN NULL; END IF;
 UPDATE public.platform_email_jobs SET attempts=attempts+1,status='sending',lease_until=now()+interval '1 minute' WHERE id=p_id;
 RETURN jsonb_build_object('payload',job.payload,'attempts',job.attempts+1);
END $$;

CREATE FUNCTION public.support_touch_updated_at() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN NEW.updated_at:=clock_timestamp(); RETURN NEW; END $$;
DO $$ DECLARE r record; role_name text; sequence_name text; BEGIN
 FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN(
 'support_categories','support_tickets','support_ticket_participants','support_ticket_messages','support_ticket_attachments','support_ticket_links','support_ticket_events','support_ticket_notifications')
 LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',r.tablename);
 EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',r.tablename);
 EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,lebrands_app',r.tablename);
 EXECUTE format('CREATE TRIGGER support_touch BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.support_touch_updated_at()',r.tablename);
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN EXECUTE format('REVOKE ALL ON public.%I FROM %I',r.tablename,role_name); END IF; END LOOP;
 END LOOP;
 sequence_name:=pg_get_serial_sequence('public.support_tickets','ticket_number');
 EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM PUBLIC,lebrands_app',sequence_name);
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
 EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM %I',sequence_name,role_name); END IF; END LOOP;
 FOR r IN SELECT p.oid::regprocedure AS identity,p.proname FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace
 WHERE s.nspname='public' AND(p.proname LIKE 'support\_%' ESCAPE '\' OR p.proname='email_claim_platform')
 LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,lebrands_app',r.identity);
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I',r.identity,role_name); END IF; END LOOP;
 IF r.proname IN('email_claim_platform','support_list','support_detail','support_create','support_reply','support_workflow',
 'support_email_pending','support_email_details','support_email_enqueue','support_email_retry')
 THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO lebrands_app',r.identity); END IF;
 END LOOP;
END $$;

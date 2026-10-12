-- MANUAL ONLY. Apply with db:migrate after reviewing docs/AURA_PAGE_ARCHITECTURE.md.
-- The schema token is expanded from the immutable, checked-in schema snapshot
-- by db/migrate.js before execution and before computing the migration checksum.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = current_user AND (rolsuper OR rolbypassrls)) THEN
    RAISE EXCEPTION 'Store page migration requires an administrative BYPASSRLS role';
  END IF;
END $$;

CREATE FUNCTION public.aura_section_schemas() RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT $schemas$__AURA_SECTION_SCHEMAS_V1__$schemas$::jsonb
$$;

-- Existing image/logo behavior is unchanged; bounded hero video uploads use R2.
ALTER TABLE public.media DROP CONSTRAINT media_upload_type_check;
ALTER TABLE public.media ADD CONSTRAINT media_upload_type_check CHECK(upload_type IN('logo','image','video'));

CREATE TABLE public.store_pages (
  store_id uuid NOT NULL REFERENCES public.stores(store_id),
  page_key text NOT NULL CHECK (page_key IN ('home','collection','product','about','contact',
    'policy-privacy','policy-terms','policy-shipping','policy-cancellation-refund','policy-contact','policy-pricing',
    'cart','checkout','track','confirmation','404')),
  draft_layout jsonb NOT NULL,
  published_layout jsonb,
  version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.users(id),
  PRIMARY KEY (store_id,page_key)
);
CREATE TABLE public.store_page_versions (
  store_id uuid NOT NULL,
  page_key text NOT NULL,
  version integer NOT NULL CHECK (version >= 0),
  layout jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.users(id),
  PRIMARY KEY (store_id,page_key,version),
  FOREIGN KEY (store_id,page_key) REFERENCES public.store_pages(store_id,page_key)
);
ALTER TABLE public.store_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_pages FORCE ROW LEVEL SECURITY;
ALTER TABLE public.store_page_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_page_versions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.store_pages,public.store_page_versions FROM PUBLIC,lebrands_app;
GRANT SELECT ON TABLE public.store_pages,public.store_page_versions TO lebrands_app;
-- No direct APP insert/update/delete: draft saves go through authenticated functions;
-- only the publication trigger may change published layouts or history.
CREATE POLICY pages_tenant ON public.store_pages FOR ALL TO lebrands_app
  USING (store_id = NULLIF(current_setting('app.store_id',true),'')::uuid)
  WITH CHECK (store_id = NULLIF(current_setting('app.store_id',true),'')::uuid);
CREATE POLICY page_versions_tenant ON public.store_page_versions FOR ALL TO lebrands_app
  USING (store_id = NULLIF(current_setting('app.store_id',true),'')::uuid)
  WITH CHECK (store_id = NULLIF(current_setting('app.store_id',true),'')::uuid);
ALTER TABLE public.store_pages OWNER TO postgres;
ALTER TABLE public.store_page_versions OWNER TO postgres;

CREATE FUNCTION public.aura_validate_fields(p_fields jsonb,p_values jsonb,p_store uuid,p_enabled boolean DEFAULT true)
RETURNS void LANGUAGE plpgsql SET search_path = pg_catalog,public AS $$
DECLARE k text; f jsonb; v jsonb; kind text; url text; token text; item jsonb; tag text; stack text[] := '{}';
BEGIN
  IF jsonb_typeof(p_values) IS DISTINCT FROM 'object' OR EXISTS
    (SELECT 1 FROM jsonb_object_keys(p_values) x WHERE NOT p_fields ? x) THEN
    RAISE EXCEPTION 'Unknown section setting' USING ERRCODE='22023';
  END IF;
  FOR k,f IN SELECT * FROM jsonb_each(p_fields) LOOP
    v := COALESCE(p_values->k,f->'default'); kind := f->>'type';
    IF v IS NULL OR v = 'null'::jsonb OR v = '""'::jsonb THEN
      IF p_enabled AND COALESCE((f->>'required')::boolean,false) THEN
        RAISE EXCEPTION 'Required field: %',k USING ERRCODE='22023';
      END IF;
      CONTINUE;
    END IF;
    IF kind IN ('text','richtext') THEN
      IF jsonb_typeof(v) <> 'string' OR length(v#>>'{}') > (f->>'maxLength')::integer THEN
        RAISE EXCEPTION 'Invalid or oversized text: %',k USING ERRCODE='22023';
      END IF;
      token := v#>>'{}';
      IF kind = 'text' AND token ~ '[<>]' THEN RAISE EXCEPTION 'HTML is not allowed' USING ERRCODE='22023'; END IF;
      IF kind = 'richtext' THEN
        IF regexp_replace(token,'</?[a-z]+\s*/?>','','gi') ~ '[<>]' THEN
          RAISE EXCEPTION 'Invalid rich text HTML' USING ERRCODE='22023';
        END IF;
        stack := '{}';
        FOR item IN SELECT to_jsonb(m[1]) FROM regexp_matches(token,'(<[^>]+>)','g') m LOOP
          tag := lower(item#>>'{}');
          IF tag !~ '^</?(p|br|strong|em|ul|ol|li)\s*/?>$' THEN
            RAISE EXCEPTION 'Rich text formatting is not allowed' USING ERRCODE='22023';
          END IF;
          IF tag ~ '^</?br' THEN CONTINUE; END IF;
          IF tag ~ '/>$' THEN RAISE EXCEPTION 'Invalid rich text tag' USING ERRCODE='22023'; END IF;
          token := regexp_replace(tag,'[<>/[:space:]]','','g');
          IF tag LIKE '</%' THEN
            IF cardinality(stack)=0 OR stack[cardinality(stack)] <> token THEN
              RAISE EXCEPTION 'Unbalanced rich text' USING ERRCODE='22023';
            END IF;
            stack := stack[1:cardinality(stack)-1];
          ELSE stack := array_append(stack,token); END IF;
        END LOOP;
        IF cardinality(stack)>0 THEN RAISE EXCEPTION 'Unbalanced rich text' USING ERRCODE='22023'; END IF;
      END IF;
    ELSIF kind = 'toggle' THEN
      IF jsonb_typeof(v) <> 'boolean' THEN RAISE EXCEPTION 'Invalid toggle' USING ERRCODE='22023'; END IF;
    ELSIF kind = 'select' THEN
      IF NOT f->'values' @> jsonb_build_array(v) THEN RAISE EXCEPTION 'Invalid selection' USING ERRCODE='22023'; END IF;
    ELSIF kind = 'colour' THEN
      IF jsonb_typeof(v) <> 'string' OR v#>>'{}' !~ '^#[0-9a-fA-F]{6}$' THEN RAISE EXCEPTION 'Invalid colour' USING ERRCODE='22023'; END IF;
    ELSIF kind = 'link' THEN
      url := v#>>'{}';
      IF jsonb_typeof(v) <> 'string' OR length(url)>2048 OR url ~ '[[:space:]<>"''\\]' OR
        (url !~ '^/[^/]' AND url <> '/' AND url !~ '^https://[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)+(:443)?([/?#]|$)') OR
        url ~* '(%0[0-9a-f]|%1[0-9a-f]|%5c)' OR url ~* '^https://(127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2[0-9]|3[01])\.)' THEN
        RAISE EXCEPTION 'Disallowed link' USING ERRCODE='22023';
      END IF;
    ELSIF kind IN ('image','video') THEN
      url := v->>'url';
      IF jsonb_typeof(v) <> 'object' OR EXISTS (SELECT 1 FROM jsonb_object_keys(v) x WHERE x NOT IN ('url','alt','width','height','focalX','focalY'))
        OR url IS NULL OR url !~* ('^https://media\.lebrands\.store/stores/'||p_store::text||'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.'||
          CASE WHEN kind='video' THEN '(mp4|webm)$' ELSE '(png|jpe?g|svg|webp|avif)$' END)
        OR jsonb_typeof(v->'alt') IS DISTINCT FROM 'string' OR length(btrim(v->>'alt'))=0 OR length(v->>'alt')>500 OR v->>'alt' ~ '[<>]' THEN
        RAISE EXCEPTION 'Invalid media or media belongs to another store' USING ERRCODE='22023';
      END IF;
      FOREACH token IN ARRAY ARRAY['width','height'] LOOP
        IF v ? token AND (jsonb_typeof(v->token) <> 'number' OR (v->>token) !~ '^[0-9]+$' OR (v->>token)::numeric NOT BETWEEN 1 AND 20000) THEN
          RAISE EXCEPTION 'Invalid media dimensions' USING ERRCODE='22023';
        END IF;
      END LOOP;
      FOREACH token IN ARRAY ARRAY['focalX','focalY'] LOOP
        IF v ? token AND (jsonb_typeof(v->token) <> 'number' OR (v->>token)::numeric NOT BETWEEN 0 AND 1) THEN
          RAISE EXCEPTION 'Invalid focal point' USING ERRCODE='22023';
        END IF;
      END LOOP;
    ELSIF kind IN ('product','collection') THEN
      IF jsonb_typeof(v) <> 'string' OR v#>>'{}' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        RAISE EXCEPTION 'Invalid reference' USING ERRCODE='22023';
      END IF;
      IF kind='product' AND NOT EXISTS (SELECT 1 FROM public.products WHERE store_id=p_store AND id=(v#>>'{}')::uuid) THEN
        RAISE EXCEPTION 'Product belongs to another store or does not exist' USING ERRCODE='42501';
      END IF;
      IF kind='collection' AND NOT EXISTS (SELECT 1 FROM public.collections WHERE store_id=p_store AND id=(v#>>'{}')::uuid) THEN
        RAISE EXCEPTION 'Collection belongs to another store or does not exist' USING ERRCODE='42501';
      END IF;
    ELSIF kind = 'list' THEN
      IF jsonb_typeof(v) <> 'array' OR jsonb_array_length(v) NOT BETWEEN (f->>'minItems')::integer AND (f->>'maxItems')::integer THEN
        RAISE EXCEPTION 'Invalid list length' USING ERRCODE='22023';
      END IF;
      FOR item IN SELECT * FROM jsonb_array_elements(v) LOOP PERFORM public.aura_validate_fields(f->'itemFields',item,p_store,true); END LOOP;
    ELSE RAISE EXCEPTION 'Unknown field type' USING ERRCODE='22023';
    END IF;
  END LOOP;
END $$;

CREATE FUNCTION public.aura_validate_layout(p_store uuid,p_page text,p_layout jsonb)
RETURNS void LANGUAGE plpgsql SET search_path = pg_catalog,public AS $$
DECLARE schemas jsonb := public.aura_section_schemas(); part jsonb; schema jsonb; block jsonb;
  ids text[] := '{}'; types text[] := '{}'; bids text[]; t text; enabled boolean;
BEGIN
  IF p_page IS NULL OR NOT (schemas->'header'->'pages' ? p_page) OR jsonb_typeof(p_layout) IS DISTINCT FROM 'array' OR
    jsonb_array_length(p_layout) NOT BETWEEN 2 AND 30 OR octet_length(p_layout::text)>100000 THEN
    RAISE EXCEPTION 'Invalid page or oversized layout' USING ERRCODE='22023';
  END IF;
  FOR part IN SELECT * FROM jsonb_array_elements(p_layout) LOOP
    IF jsonb_typeof(part) <> 'object' OR EXISTS (SELECT 1 FROM jsonb_object_keys(part) x WHERE x NOT IN ('id','type','settings','blocks')) OR
      jsonb_typeof(part->'id') IS DISTINCT FROM 'string' OR part->>'id' !~ '^[a-zA-Z0-9_-]{1,64}$' OR part->>'id'=ANY(ids) THEN
      RAISE EXCEPTION 'Invalid or duplicate section ID' USING ERRCODE='22023';
    END IF;
    ids := array_append(ids,part->>'id'); t := part->>'type'; schema := schemas->t;
    IF schema IS NULL OR NOT (schema->'pages' ? p_page) THEN RAISE EXCEPTION 'Section not allowed on this page' USING ERRCODE='22023'; END IF;
    enabled := COALESCE(part->'settings'->'enabled','true'::jsonb) <> 'false'::jsonb;
    IF schema->'required' ? p_page AND (NOT enabled OR t=ANY(types)) THEN
      RAISE EXCEPTION 'Required section cannot be hidden or duplicated' USING ERRCODE='22023';
    END IF;
    types := array_append(types,t);
    PERFORM public.aura_validate_fields(schema->'fields',part->'settings',p_store,enabled);
    IF jsonb_typeof(part->'blocks') IS DISTINCT FROM 'array' OR jsonb_array_length(part->'blocks')>(schema->>'max')::integer OR
      (enabled AND jsonb_array_length(part->'blocks')>0 AND jsonb_array_length(part->'blocks')<(schema->>'min')::integer) THEN
      RAISE EXCEPTION 'Invalid block count' USING ERRCODE='22023';
    END IF;
    bids := '{}';
    FOR block IN SELECT * FROM jsonb_array_elements(part->'blocks') LOOP
      IF jsonb_typeof(block) <> 'object' OR EXISTS (SELECT 1 FROM jsonb_object_keys(block) x WHERE x NOT IN ('id','type','settings')) OR
        block->>'type' IS DISTINCT FROM 'item' OR jsonb_typeof(block->'id') IS DISTINCT FROM 'string' OR block->>'id' !~ '^[a-zA-Z0-9_-]{1,64}$' OR
        block->>'id'=ANY(bids) OR schema->'blocks'='null'::jsonb THEN
        RAISE EXCEPTION 'Invalid section block' USING ERRCODE='22023';
      END IF;
      bids := array_append(bids,block->>'id');
      PERFORM public.aura_validate_fields(schema->'blocks',block->'settings',p_store,enabled);
    END LOOP;
    IF enabled AND t='hero' AND part->'settings'->>'variant'='video' AND
      (COALESCE(part->'settings'->'video','null'::jsonb)='null'::jsonb OR COALESCE(part->'settings'->'poster','null'::jsonb)='null'::jsonb) THEN
      RAISE EXCEPTION 'Video requires a poster' USING ERRCODE='22023';
    END IF;
  END LOOP;
  FOR t,schema IN SELECT * FROM jsonb_each(schemas) LOOP
    IF schema->'required' ? p_page AND NOT t=ANY(types) THEN RAISE EXCEPTION 'Required section missing: %',t USING ERRCODE='22023'; END IF;
  END LOOP;
  IF p_layout->-1->>'type' <> 'footer' OR p_layout->0->>'type' NOT IN ('header','announcement') OR array_position(types,'header')>2 THEN
    RAISE EXCEPTION 'Header and footer must frame the page' USING ERRCODE='22023';
  END IF;
END $$;

CREATE FUNCTION public.aura_section(p_type text,p_settings jsonb DEFAULT '{}'::jsonb,p_blocks jsonb DEFAULT '[]'::jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = pg_catalog,public AS $$
  SELECT jsonb_build_object('id','default-'||p_type,'type',p_type,'settings',
    (SELECT jsonb_object_agg(key,COALESCE(value->'default','null'::jsonb)) FROM jsonb_each(public.aura_section_schemas()->p_type->'fields'))||p_settings,
    'blocks',p_blocks)
$$;
CREATE FUNCTION public.aura_default_layout(p_page text,p_snapshot jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog,public AS $$
DECLARE s jsonb := COALESCE(p_snapshot->'settings','{}'::jsonb); hero jsonb; parts jsonb; images jsonb;
  brand text := COALESCE(NULLIF(s->>'brand_name',''),p_snapshot#>>'{store,name}','Store');
BEGIN
  IF p_page='home' THEN
    hero := COALESCE(s->'hero_image',p_snapshot#>'{products,0,images,0}');
    IF hero IS NOT NULL AND hero->>'url' IS NOT NULL THEN
      hero := jsonb_strip_nulls(jsonb_build_object('url',hero->'url','alt',COALESCE(NULLIF(hero->>'alt',''),p_snapshot#>>'{products,0,title}',brand),'width',hero->'width','height',hero->'height'));
    ELSE hero := 'null'::jsonb; END IF;
    parts := jsonb_build_array(public.aura_section('announcement'),public.aura_section('header'),
      public.aura_section('hero',jsonb_build_object('title',COALESCE(NULLIF(s->>'tagline',''),brand),
        'description',replace(replace(replace(COALESCE(s->>'description',''),'&','&amp;'),'<','&lt;'),'>','&gt;'),
        'image',hero,'video',COALESCE(s->'hero_video','null'::jsonb),'poster',COALESCE(s->'hero_poster','null'::jsonb),
        'variant',CASE WHEN s->'hero_video' IS NOT NULL AND s->'hero_video'<>'null'::jsonb AND s->'hero_poster' IS NOT NULL AND s->'hero_poster'<>'null'::jsonb THEN 'video' ELSE 'split' END,
        'button_label','Shop the collection')),
      public.aura_section('statement',jsonb_build_object('enabled',COALESCE(s->>'statement','')<>'','text',COALESCE(s->>'statement',''))),
      public.aura_section('featured-collection',jsonb_build_object('title','Collection')),
      public.aura_section('lookbook'),public.aura_section('founder',jsonb_build_object(
        'enabled',COALESCE(s->>'founder_name','')<>'' AND COALESCE(s->>'founder_story','')<>'' AND COALESCE(s->'founder_portrait','null'::jsonb)<>'null'::jsonb,
        'name',COALESCE(s->>'founder_name',''),'story',replace(replace(replace(COALESCE(s->>'founder_story',''),'&','&amp;'),'<','&lt;'),'>','&gt;'),
        'portrait',COALESCE(s->'founder_portrait','null'::jsonb))));
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id','item-'||(n-1)::text,'type','item','settings',jsonb_build_object('image',v))), '[]'::jsonb)
      INTO images FROM jsonb_array_elements(COALESCE(s->'craft_images','[]'::jsonb)) WITH ORDINALITY x(v,n);
    parts:=parts||jsonb_build_array(public.aura_section('craft','{}'::jsonb,images),public.aura_section('reviews'));
    IF jsonb_array_length(COALESCE(s->'gallery_images','[]'::jsonb))>=4 THEN
      SELECT jsonb_agg(jsonb_build_object('id','item-'||(n-1)::text,'type','item','settings',jsonb_build_object('image',v)))
        INTO images FROM jsonb_array_elements(s->'gallery_images') WITH ORDINALITY x(v,n);
      parts:=parts||jsonb_build_array(public.aura_section('gallery','{}'::jsonb,images));
    END IF;
    RETURN parts||jsonb_build_array(public.aura_section('trust'),public.aura_section('footer',jsonb_build_object('brand_line',COALESCE(s->>'tagline',''))));
  END IF;
  RETURN jsonb_build_array(public.aura_section('header'),
    CASE WHEN p_page='collection' THEN public.aura_section('product-grid','{"title":"Collection"}'::jsonb)
      WHEN p_page='product' THEN public.aura_section('product-details')
      WHEN p_page='about' THEN public.aura_section('about',jsonb_build_object('title',brand,
        'body',replace(replace(replace(COALESCE(s->>'description',''),'&','&amp;'),'<','&lt;'),'>','&gt;')))
      WHEN p_page='contact' THEN public.aura_section('contact','{"title":"Contact"}'::jsonb)
      WHEN p_page LIKE 'policy-%' THEN public.aura_section('policy') WHEN p_page='404' THEN public.aura_section('not-found') ELSE public.aura_section('commerce') END,
    public.aura_section('footer',jsonb_build_object('brand_line',COALESCE(s->>'tagline',''))));
END $$;

-- Backfill draft from current setup, published from the OLD PUBLICATION, never
-- from an unpublished draft. All statuses are preserved, including live stores.
INSERT INTO public.store_pages(store_id,page_key,draft_layout,published_layout,version)
SELECT s.store_id,k.page,
  public.aura_default_layout(k.page,jsonb_build_object('store',to_jsonb(s),'settings',
    COALESCE(p.snapshot->'settings','{}'::jsonb)||COALESCE(d.settings,'{}'::jsonb),
    'products',COALESCE(p.snapshot->'products','[]'::jsonb))),
  CASE WHEN p.snapshot IS NULL THEN NULL ELSE public.aura_default_layout(k.page,p.snapshot) END,0
FROM public.stores s LEFT JOIN public.store_setup d USING(store_id)
LEFT JOIN public.store_publications p USING(store_id)
CROSS JOIN LATERAL jsonb_array_elements_text(public.aura_section_schemas()->'header'->'pages') k(page);
INSERT INTO public.store_page_versions(store_id,page_key,version,layout)
SELECT store_id,page_key,version,published_layout FROM public.store_pages WHERE published_layout IS NOT NULL;

CREATE FUNCTION public.guard_store_page_layout() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,public AS $$
BEGIN
  PERFORM public.aura_validate_layout(NEW.store_id,NEW.page_key,NEW.draft_layout);
  IF NEW.published_layout IS NOT NULL THEN PERFORM public.aura_validate_layout(NEW.store_id,NEW.page_key,NEW.published_layout); END IF;
  NEW.updated_at:=now(); RETURN NEW;
END $$;
CREATE TRIGGER store_page_layout_guard BEFORE INSERT OR UPDATE ON public.store_pages
FOR EACH ROW EXECUTE FUNCTION public.guard_store_page_layout();

CREATE FUNCTION public.initialize_store_page_layouts() RETURNS trigger LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE k text; snapshot jsonb:=jsonb_build_object('store',to_jsonb(NEW),'settings',jsonb_build_object('brand_name',NEW.name),'products','[]'::jsonb);
BEGIN
  FOR k IN SELECT * FROM jsonb_array_elements_text(public.aura_section_schemas()->'header'->'pages') LOOP
    INSERT INTO public.store_pages(store_id,page_key,draft_layout) VALUES(NEW.store_id,k,public.aura_default_layout(k,snapshot));
  END LOOP;
  RETURN NEW;
END $$;
CREATE TRIGGER initialize_store_page_layouts AFTER INSERT ON public.stores FOR EACH ROW EXECUTE FUNCTION public.initialize_store_page_layouts();

CREATE FUNCTION public.sync_wizard_page_slots() RETURNS trigger LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE page public.store_pages; part jsonb; replacement jsonb; fresh jsonb; changed text[]; key text; field text; source text; layout jsonb;
  snapshot jsonb; next_settings jsonb; next_blocks jsonb;
BEGIN
  SELECT array_agg(k) INTO changed FROM jsonb_object_keys(NEW.settings||COALESCE(OLD.settings,'{}'::jsonb)) k
    WHERE NEW.settings->k IS DISTINCT FROM OLD.settings->k;
  IF changed IS NULL THEN RETURN NEW; END IF;
  SELECT COALESCE(p.snapshot,jsonb_build_object('store',to_jsonb(s),'products','[]'::jsonb))||jsonb_build_object('settings',NEW.settings)
    INTO snapshot FROM public.stores s LEFT JOIN public.store_publications p USING(store_id) WHERE s.store_id=NEW.store_id;
  FOR page IN SELECT * FROM public.store_pages WHERE store_id=NEW.store_id FOR UPDATE LOOP
    fresh:=public.aura_default_layout(page.page_key,snapshot); layout:='[]'::jsonb;
    FOR part IN SELECT * FROM jsonb_array_elements(page.draft_layout) LOOP
      next_settings:=part->'settings'; next_blocks:=part->'blocks';
      IF part->>'id'=ANY(ARRAY['default-hero','default-statement','default-founder','default-craft','default-gallery','default-about','default-footer']) THEN
        SELECT v INTO replacement FROM jsonb_array_elements(fresh) v WHERE v->>'id'=part->>'id';
        IF replacement IS NOT NULL THEN
          FOR field IN SELECT * FROM jsonb_object_keys(replacement->'settings') LOOP
            source:=CASE field
              WHEN 'title' THEN CASE WHEN part->>'type'='about' THEN 'brand_name' ELSE 'tagline' END
              WHEN 'description' THEN 'description' WHEN 'body' THEN 'description' WHEN 'image' THEN 'hero_image'
              WHEN 'video' THEN 'hero_video' WHEN 'poster' THEN 'hero_poster' WHEN 'variant' THEN 'hero_video'
              WHEN 'brand_line' THEN 'tagline' WHEN 'text' THEN 'statement' WHEN 'portrait' THEN 'founder_portrait'
              WHEN 'name' THEN 'founder_name' WHEN 'story' THEN 'founder_story' ELSE '' END;
            IF source=ANY(changed) OR (field='variant' AND 'hero_poster'=ANY(changed)) OR
              (field='enabled' AND ((part->>'type'='statement' AND 'statement'=ANY(changed)) OR
                (part->>'type'='founder' AND changed && ARRAY['founder_portrait','founder_name','founder_story']))) THEN
              next_settings:=jsonb_set(next_settings,ARRAY[field],replacement->'settings'->field);
            END IF;
          END LOOP;
          IF (part->>'type'||'_images')=ANY(changed) THEN
            next_blocks:=replacement->'blocks';
            IF part->>'type'='gallery' THEN next_settings:=jsonb_set(next_settings,'{enabled}','true'::jsonb); END IF;
          END IF;
        ELSIF part->>'type'='gallery' AND 'gallery_images'=ANY(changed) THEN
          next_blocks:='[]'::jsonb; next_settings:=jsonb_set(next_settings,'{enabled}','false'::jsonb);
        END IF;
      END IF;
      layout:=layout||jsonb_build_array(part||jsonb_build_object('settings',next_settings,'blocks',next_blocks));
    END LOOP;
    IF page.page_key='home' AND 'gallery_images'=ANY(changed) AND jsonb_array_length(COALESCE(NEW.settings->'gallery_images','[]'::jsonb))>=4
      AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(layout) v WHERE v->>'id'='default-gallery') THEN
      SELECT v INTO replacement FROM jsonb_array_elements(fresh) v WHERE v->>'id'='default-gallery';
      layout:=(layout- (jsonb_array_length(layout)-1))||jsonb_build_array(replacement,layout->-1);
    END IF;
    IF layout IS DISTINCT FROM page.draft_layout THEN
      UPDATE public.store_pages SET draft_layout=layout,version=version+1,updated_by=NULL WHERE store_id=page.store_id AND page_key=page.page_key;
    END IF;
  END LOOP;
  RETURN NEW;
END $$;
CREATE TRIGGER sync_wizard_page_slots AFTER UPDATE OF settings ON public.store_setup
FOR EACH ROW EXECUTE FUNCTION public.sync_wizard_page_slots();

CREATE FUNCTION public.store_page_actor(p_store uuid,p_token text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE actor uuid;
BEGIN
  IF p_store IS DISTINCT FROM NULLIF(current_setting('app.store_id',true),'')::uuid OR
    NOT public.authorize_store_session(p_token,p_store) THEN RAISE EXCEPTION 'Store access denied' USING ERRCODE='42501'; END IF;
  SELECT user_id INTO actor FROM public.sessions WHERE token_hash=p_token;
  RETURN actor;
END $$;
CREATE FUNCTION public.save_store_page(p_store uuid,p_page text,p_layout jsonb,p_expected integer,p_token text)
RETURNS public.store_pages LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE actor uuid; row public.store_pages;
BEGIN
  IF p_expected IS NULL OR p_expected<0 THEN RAISE EXCEPTION 'Invalid page revision' USING ERRCODE='22023'; END IF;
  actor:=public.store_page_actor(p_store,p_token);
  PERFORM 1 FROM public.stores WHERE store_id=p_store FOR UPDATE;
  PERFORM public.aura_validate_layout(p_store,p_page,p_layout);
  SELECT * INTO row FROM public.store_pages WHERE store_id=p_store AND page_key=p_page FOR UPDATE;
  IF FOUND THEN
    IF row.version<>p_expected THEN RAISE EXCEPTION 'Page changed in another tab. Reload before saving.' USING ERRCODE='40001'; END IF;
    UPDATE public.store_pages SET draft_layout=p_layout,version=version+1,updated_by=actor WHERE store_id=p_store AND page_key=p_page RETURNING * INTO row;
  ELSE
    IF p_expected<>0 THEN RAISE EXCEPTION 'Page revision is invalid' USING ERRCODE='40001'; END IF;
    INSERT INTO public.store_pages(store_id,page_key,draft_layout,version,updated_by) VALUES(p_store,p_page,p_layout,1,actor) RETURNING * INTO row;
  END IF;
  RETURN row;
END $$;
CREATE FUNCTION public.restore_store_page(p_store uuid,p_page text,p_version integer,p_expected integer,p_token text)
RETURNS public.store_pages LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE layout jsonb;
BEGIN
  PERFORM public.store_page_actor(p_store,p_token);
  SELECT v.layout INTO layout FROM public.store_page_versions v WHERE store_id=p_store AND page_key=p_page AND version=p_version;
  IF layout IS NULL THEN RAISE EXCEPTION 'Published version not found' USING ERRCODE='22023'; END IF;
  RETURN public.save_store_page(p_store,p_page,layout,p_expected,p_token);
END $$;

CREATE FUNCTION public.publish_store_page_layouts() RETURNS trigger LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE k text; row public.store_pages;
BEGIN
  -- Catalogue-only snapshot writes MUST NOT publish unrelated draft edits.
  IF TG_OP='UPDATE' AND current_setting('app.publish_pages',true) IS DISTINCT FROM 'true' THEN RETURN NEW; END IF;
  FOR k IN SELECT * FROM jsonb_array_elements_text(public.aura_section_schemas()->'header'->'pages') LOOP
    INSERT INTO public.store_pages(store_id,page_key,draft_layout)
      VALUES(NEW.store_id,k,public.aura_default_layout(k,NEW.snapshot)) ON CONFLICT DO NOTHING;
  END LOOP;
  FOR row IN SELECT * FROM public.store_pages WHERE store_id=NEW.store_id AND published_layout IS DISTINCT FROM draft_layout FOR UPDATE LOOP
    PERFORM public.aura_validate_layout(row.store_id,row.page_key,row.draft_layout);
    UPDATE public.store_pages SET published_layout=draft_layout,version=version+1 WHERE store_id=row.store_id AND page_key=row.page_key RETURNING * INTO row;
    INSERT INTO public.store_page_versions(store_id,page_key,version,layout,updated_by) VALUES(row.store_id,row.page_key,row.version,row.published_layout,row.updated_by);
    DELETE FROM public.store_page_versions WHERE store_id=row.store_id AND page_key=row.page_key AND version IN (
      SELECT version FROM public.store_page_versions WHERE store_id=row.store_id AND page_key=row.page_key ORDER BY version DESC OFFSET 20);
  END LOOP;
  PERFORM set_config('app.publish_pages','false',true);
  RETURN NEW;
END $$;
CREATE TRIGGER publish_store_page_layouts AFTER INSERT OR UPDATE OF snapshot ON public.store_publications
FOR EACH ROW EXECUTE FUNCTION public.publish_store_page_layouts();

-- Functions are deliberately narrow; helper/trigger functions are not APP APIs.
DO $$ DECLARE fn record; r text;
BEGIN
  FOR fn IN SELECT oid::regprocedure AS signature FROM pg_proc WHERE pronamespace='public'::regnamespace AND
    proname IN ('aura_section_schemas','aura_validate_fields','aura_validate_layout','aura_section','aura_default_layout',
      'guard_store_page_layout','store_page_actor','save_store_page','restore_store_page','publish_store_page_layouts','initialize_store_page_layouts','sync_wizard_page_slots') LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO postgres',fn.signature);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,lebrands_app',fn.signature);
    FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
      IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I',fn.signature,r); END IF;
    END LOOP;
  END LOOP;
  FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN EXECUTE format('REVOKE ALL ON TABLE public.store_pages,public.store_page_versions FROM %I',r); END IF;
  END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.save_store_page(uuid,text,jsonb,integer,text),public.restore_store_page(uuid,text,integer,integer,text) TO lebrands_app;

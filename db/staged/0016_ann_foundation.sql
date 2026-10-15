-- Ann Stage 3. Additive only: no merchant content is backfilled or published.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=current_user AND (rolsuper OR rolbypassrls)) THEN
    RAISE EXCEPTION 'Run as an administrative BYPASSRLS role';
  END IF;
END $$;

CREATE TABLE public.ann_reference_attributes (
  id bigint PRIMARY KEY,
  subcategory_id bigint NOT NULL REFERENCES public.aura_library_subcategories(subcategory_id),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  sort_order integer NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX ann_attribute_name ON public.ann_reference_attributes(subcategory_id,lower(name));
CREATE INDEX ann_attribute_subcategory ON public.ann_reference_attributes(subcategory_id,sort_order,id);
CREATE TABLE public.ann_reference_values (
  id bigint PRIMARY KEY,
  attribute_id bigint NOT NULL REFERENCES public.ann_reference_attributes(id),
  value text NOT NULL CHECK (length(value) BETWEEN 1 AND 200),
  sort_order integer NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX ann_attribute_value ON public.ann_reference_values(attribute_id,lower(value));
CREATE INDEX ann_value_attribute ON public.ann_reference_values(attribute_id,sort_order,id);

__ANN_REFERENCE_SEED_V1__

CREATE TABLE public.ann_builder_sessions (
  store_id uuid PRIMARY KEY REFERENCES public.stores(store_id) ON DELETE CASCADE,
  reference_version text NOT NULL DEFAULT 'ann-v1' CHECK (reference_version='ann-v1'),
  revision integer NOT NULL DEFAULT 1 CHECK (revision BETWEEN 1 AND 2147483646),
  current_step text NOT NULL CHECK (current_step IN
    ('category','style','palette','fonts','collections','products','story','selling','business','policies','domain','payments','shipping','review')),
  -- Allow formatting overhead in jsonb::text; the API bounds compact input at 60KB.
  answers jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(answers)='object' AND octet_length(answers::text)<=131072),
  created_by uuid NOT NULL REFERENCES public.users(id),
  updated_by uuid NOT NULL REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ann_builder_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ann_builder_sessions FORCE ROW LEVEL SECURITY;
CREATE POLICY ann_session_read ON public.ann_builder_sessions FOR SELECT TO lebrands_app
  USING (store_id=NULLIF(current_setting('app.store_id',true),'')::uuid);
ALTER TABLE public.ann_reference_attributes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ann_reference_attributes FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ann_reference_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ann_reference_values FORCE ROW LEVEL SECURITY;
CREATE POLICY ann_attributes_read ON public.ann_reference_attributes FOR SELECT TO lebrands_app USING(true);
CREATE POLICY ann_values_read ON public.ann_reference_values FOR SELECT TO lebrands_app USING(true);
REVOKE ALL ON public.ann_builder_sessions,public.ann_reference_attributes,public.ann_reference_values FROM PUBLIC,lebrands_app;
GRANT SELECT ON public.ann_builder_sessions,public.ann_reference_attributes,public.ann_reference_values TO lebrands_app;

CREATE FUNCTION public.ann_save_session(p_store uuid,p_token text,p_revision integer,p_step text,p_answers jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid; next_revision integer;
BEGIN
  IF p_store IS DISTINCT FROM NULLIF(current_setting('app.store_id',true),'')::uuid
    OR NOT public.authorize_store_session(p_token,p_store) THEN
    RAISE EXCEPTION 'Store isolation denied' USING ERRCODE='42501';
  END IF;
  SELECT s.user_id INTO actor FROM public.sessions s
    JOIN public.store_members m ON m.user_id=s.user_id AND m.store_id=p_store
    WHERE s.token_hash=p_token AND m.role IN ('owner','admin');
  IF actor IS NULL THEN RAISE EXCEPTION 'Store write denied' USING ERRCODE='42501'; END IF;
  IF p_revision=0 THEN
    INSERT INTO public.ann_builder_sessions(store_id,current_step,answers,created_by,updated_by)
    VALUES(p_store,p_step,p_answers,actor,actor) ON CONFLICT(store_id) DO NOTHING
    RETURNING revision INTO next_revision;
  ELSE
    UPDATE public.ann_builder_sessions SET current_step=p_step,answers=p_answers,
      revision=revision+1,updated_by=actor,updated_at=clock_timestamp()
    WHERE store_id=p_store AND revision=p_revision RETURNING revision INTO next_revision;
  END IF;
  IF next_revision IS NULL THEN
    RAISE EXCEPTION 'Ann progress changed; reload before saving' USING ERRCODE='40001';
  END IF;
  RETURN next_revision;
END $$;
REVOKE ALL ON FUNCTION public.ann_save_session(uuid,text,integer,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ann_save_session(uuid,text,integer,text,jsonb) TO lebrands_app;
COMMENT ON TABLE public.ann_builder_sessions IS 'Private Ann planning progress only. Never inventory, policies, publication or verified business data.';

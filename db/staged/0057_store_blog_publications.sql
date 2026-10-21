-- Additive, explicitly selected release. Publishing copies one saved revision;
-- mutable merchant drafts are never a source for public rendering.
ALTER TABLE public.store_blog_drafts ADD COLUMN published_slug text;
ALTER TABLE public.store_blog_drafts ADD COLUMN first_published_at timestamptz;
ALTER TABLE public.store_blog_drafts ADD CONSTRAINT blog_permanent_address
  CHECK (published_slug IS NULL OR published_slug=slug);
ALTER TABLE public.store_blog_drafts ADD CONSTRAINT blog_tenant_article UNIQUE(store_id,id);
CREATE FUNCTION public.protect_blog_address() RETURNS trigger
  LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  IF OLD.published_slug IS NOT NULL AND NEW.published_slug IS DISTINCT FROM OLD.published_slug THEN
    RAISE EXCEPTION 'Published article addresses cannot be changed' USING ERRCODE='23514';
  END IF;
  IF OLD.first_published_at IS NOT NULL AND NEW.first_published_at IS DISTINCT FROM OLD.first_published_at THEN
    RAISE EXCEPTION 'Original publication dates cannot be changed' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.protect_blog_address() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER blog_address_lock BEFORE UPDATE ON public.store_blog_drafts
  FOR EACH ROW EXECUTE FUNCTION public.protect_blog_address();
CREATE TABLE public.store_blog_publications(
  store_id uuid NOT NULL,
  article_id uuid NOT NULL,
  slug text NOT NULL CHECK (length(slug)<=160 AND slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object' AND octet_length(snapshot::text)<=800000),
  revision bigint NOT NULL CHECK(revision>0),
  first_published_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(store_id,article_id),
  UNIQUE(store_id,slug),
  FOREIGN KEY(store_id,article_id) REFERENCES public.store_blog_drafts(store_id,id) ON DELETE CASCADE
);
CREATE INDEX store_blog_publications_recent ON public.store_blog_publications(store_id,first_published_at DESC,article_id);
ALTER TABLE public.store_blog_publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_blog_publications FORCE ROW LEVEL SECURITY;
CREATE POLICY blog_public_read ON public.store_blog_publications FOR SELECT TO lebrands_app USING(
  store_id=NULLIF(current_setting('app.store_id',true),'')::uuid AND
  (public.blog_draft_access(store_id) OR EXISTS(
    SELECT 1 FROM public.stores s JOIN public.store_publications p ON p.store_id=s.store_id
    WHERE s.store_id=store_blog_publications.store_id AND s.status='live'))
);
CREATE POLICY blog_publish_insert ON public.store_blog_publications FOR INSERT TO lebrands_app
  WITH CHECK(public.blog_draft_access(store_id));
CREATE POLICY blog_publish_update ON public.store_blog_publications FOR UPDATE TO lebrands_app
  USING(public.blog_draft_access(store_id)) WITH CHECK(public.blog_draft_access(store_id));
CREATE POLICY blog_publish_delete ON public.store_blog_publications FOR DELETE TO lebrands_app
  USING(public.blog_draft_access(store_id));
REVOKE ALL ON TABLE public.store_blog_publications FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.store_blog_publications TO lebrands_app;

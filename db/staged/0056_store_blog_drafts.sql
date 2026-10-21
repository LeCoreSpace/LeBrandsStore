-- Manual additive migration. Draft-only authoring; no public article routes.
CREATE TABLE public.store_blog_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(store_id) ON DELETE CASCADE,
  title text NOT NULL CHECK(length(title) BETWEEN 1 AND 160),
  slug text NOT NULL CHECK(length(slug)<=160 AND slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  summary text NOT NULL DEFAULT '' CHECK(length(summary)<=400),
  author text NOT NULL DEFAULT '' CHECK(length(author)<=100),
  category text NOT NULL DEFAULT '' CHECK(length(category)<=80),
  hero_media_id uuid,
  hero_alt text NOT NULL DEFAULT '' CHECK(length(hero_alt)<=300),
  sections jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK(jsonb_typeof(sections)='array' AND jsonb_array_length(sections)<=40 AND octet_length(sections::text)<=650000),
  revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(store_id,slug)
);
CREATE INDEX store_blog_drafts_recent ON public.store_blog_drafts(store_id,updated_at DESC,id);

-- Tenant context alone is insufficient to read private drafts. Require a live
-- merchant session and membership as well, including for SELECT/preview.
CREATE FUNCTION public.blog_draft_access(p_store uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT p_store=NULLIF(current_setting('app.store_id',true),'')::uuid
    AND EXISTS(
      SELECT 1 FROM public.sessions s JOIN public.users u ON u.id=s.user_id
        JOIN public.store_members m ON m.user_id=u.id
      WHERE s.token_hash=NULLIF(current_setting('app.blog_token',true),'')
        AND s.revoked_at IS NULL AND s.expires_at>now() AND NOT u.must_change_password
        AND m.store_id=p_store AND m.role IN('owner','admin','editor')
    );
$$;
REVOKE ALL ON FUNCTION public.blog_draft_access(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.blog_draft_access(uuid) TO lebrands_app;
ALTER TABLE public.store_blog_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_blog_drafts FORCE ROW LEVEL SECURITY;
CREATE POLICY blog_draft_member ON public.store_blog_drafts FOR ALL TO lebrands_app
  USING(public.blog_draft_access(store_id))
  WITH CHECK(public.blog_draft_access(store_id));
REVOKE ALL ON TABLE public.store_blog_drafts FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.store_blog_drafts TO lebrands_app;

-- REVIEW DRAFT ONLY: not registered with db/migrate.js.
-- Additive tables for the shared Aura starter-content library.
-- No existing stores, pages, media or AI jobs are modified.
-- Authoring/publishing/application functions and content imports are separate work.
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles
    WHERE rolname = current_user AND (rolsuper OR rolbypassrls)
  ) THEN
    RAISE EXCEPTION 'Run as an administrative BYPASSRLS role';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'lebrands_app'
  ) THEN
    RAISE EXCEPTION 'Existing lebrands_app role is required';
  END IF;
END $$;

-- Preserve the source taxonomy IDs. Import product categories only.
CREATE TABLE public.aura_library_categories (
  category_id bigint PRIMARY KEY,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  slug text NOT NULL UNIQUE CHECK (length(btrim(slug)) BETWEEN 1 AND 200),
  brand_type text NOT NULL DEFAULT 'product' CHECK (brand_type = 'product'),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.aura_library_subcategories (
  subcategory_id bigint PRIMARY KEY,
  category_id bigint NOT NULL REFERENCES public.aura_library_categories(category_id),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  slug text NOT NULL CHECK (length(btrim(slug)) BETWEEN 1 AND 200),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (category_id, slug),
  UNIQUE (category_id, subcategory_id)
);

-- Stable placement IDs, e.g. home.hero; renderer types, e.g. hero.
-- Field schemas remain owned by the existing Aura section registry.
CREATE TABLE public.aura_library_sections (
  section_id text PRIMARY KEY CHECK (section_id ~ '^[a-z][a-z0-9_.-]{0,79}$'),
  page_key text NOT NULL CHECK (page_key IN ('home','collection','product','cart','checkout')),
  section_type text NOT NULL CHECK (section_type ~ '^[a-z][a-z0-9-]{0,79}$'),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  default_position integer NOT NULL CHECK (default_position >= 0),
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE (section_id, page_key),
  UNIQUE (page_key, default_position)
);

-- File bytes stay in object storage, never PostgreSQL.
-- object_key is resolved through a trusted storage-provider adapter.
CREATE TABLE public.aura_library_assets (
  asset_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_provider text NOT NULL CHECK (storage_provider IN ('r2','cloudinary','app_storage')),
  object_key text NOT NULL CHECK (length(btrim(object_key)) BETWEEN 1 AND 1024),
  media_type text NOT NULL CHECK (media_type IN ('image','video')),
  mime_type text NOT NULL CHECK (mime_type IN (
    'image/jpeg','image/png','image/webp','image/avif','video/mp4','video/webm'
  )),
  width integer NOT NULL CHECK (width BETWEEN 1 AND 20000),
  height integer NOT NULL CHECK (height BETWEEN 1 AND 20000),
  alt_text text NOT NULL CHECK (length(btrim(alt_text)) BETWEEN 1 AND 500),
  provenance text NOT NULL CHECK (provenance IN ('owned','licensed','ai_generated')),
  rights_note text NOT NULL CHECK (length(btrim(rights_note)) BETWEEN 1 AND 2000),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','ready')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((media_type = 'image' AND mime_type LIKE 'image/%')
      OR (media_type = 'video' AND mime_type LIKE 'video/%')),
  UNIQUE (storage_provider, object_key)
);

-- Published versions must be treated as immutable by the authoring workflow.
CREATE TABLE public.aura_library_packs (
  pack_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id bigint NOT NULL,
  subcategory_id bigint NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  FOREIGN KEY (category_id, subcategory_id)
    REFERENCES public.aura_library_subcategories(category_id, subcategory_id),
  UNIQUE (category_id, subcategory_id, version),
  CHECK ((status = 'draft' AND published_at IS NULL)
      OR (status = 'published' AND published_at IS NOT NULL))
);

-- settings holds editable text/labels; blocks holds ordered sample items.
-- Validate both against the code-owned section schema before publication.
CREATE TABLE public.aura_library_section_content (
  pack_id uuid NOT NULL REFERENCES public.aura_library_packs(pack_id),
  section_id text NOT NULL,
  page_key text NOT NULL,
  position integer NOT NULL CHECK (position >= 0),
  settings jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(settings) = 'object' AND octet_length(settings::text) <= 131072),
  blocks jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(blocks) = 'array'),
  PRIMARY KEY (pack_id, section_id),
  FOREIGN KEY (section_id, page_key)
    REFERENCES public.aura_library_sections(section_id, page_key),
  UNIQUE (pack_id, page_key, position)
);

-- Bind assets to exact fields, e.g. {settings,image} or {blocks,0,image}.
CREATE TABLE public.aura_library_section_assets (
  pack_id uuid NOT NULL,
  section_id text NOT NULL,
  field_path text[] NOT NULL CHECK (
    cardinality(field_path) BETWEEN 1 AND 8
    AND array_position(field_path, '') IS NULL
    AND array_position(field_path, NULL) IS NULL
  ),
  variant text NOT NULL DEFAULT 'default' CHECK (variant IN ('default','desktop','mobile')),
  asset_id uuid NOT NULL REFERENCES public.aura_library_assets(asset_id),
  PRIMARY KEY (pack_id, section_id, field_path, variant),
  FOREIGN KEY (pack_id, section_id)
    REFERENCES public.aura_library_section_content(pack_id, section_id)
);

-- Stores pin the exact pack version used. Their edited layouts remain in store_pages.
CREATE TABLE public.store_starter_packs (
  store_id uuid PRIMARY KEY REFERENCES public.stores(store_id),
  pack_id uuid NOT NULL REFERENCES public.aura_library_packs(pack_id),
  applied_at timestamptz NOT NULL DEFAULT now(),
  applied_by uuid NOT NULL REFERENCES public.users(id)
);

CREATE INDEX aura_library_packs_published_idx
  ON public.aura_library_packs(category_id, subcategory_id, version DESC)
  WHERE status = 'published';
CREATE INDEX aura_library_section_assets_asset_idx
  ON public.aura_library_section_assets(asset_id);
CREATE INDEX store_starter_packs_pack_idx ON public.store_starter_packs(pack_id);

-- Platform library: APP can read reviewed/published records but cannot author.
-- Per-store selection: APP can read only its current tenant.
DO $$
DECLARE table_name text; role_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'aura_library_categories','aura_library_subcategories','aura_library_sections',
    'aura_library_assets','aura_library_packs','aura_library_section_content',
    'aura_library_section_assets','store_starter_packs'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I OWNER TO postgres', table_name);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', table_name);
    FOR role_name IN SELECT rolname FROM pg_catalog.pg_roles
      WHERE rolname IN ('lebrands_app','anon','authenticated','service_role')
    LOOP
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', table_name, role_name);
    END LOOP;
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO lebrands_app', table_name);
  END LOOP;
END $$;

CREATE POLICY aura_categories_read ON public.aura_library_categories
  FOR SELECT TO lebrands_app USING (is_active);
CREATE POLICY aura_subcategories_read ON public.aura_library_subcategories
  FOR SELECT TO lebrands_app USING (
    is_active AND EXISTS (
      SELECT 1 FROM public.aura_library_categories c WHERE c.category_id = aura_library_subcategories.category_id
    )
  );
CREATE POLICY aura_sections_read ON public.aura_library_sections
  FOR SELECT TO lebrands_app USING (is_active);
CREATE POLICY aura_assets_read ON public.aura_library_assets
  FOR SELECT TO lebrands_app USING (status = 'ready');
CREATE POLICY aura_packs_read ON public.aura_library_packs
  FOR SELECT TO lebrands_app USING (
    status = 'published' AND EXISTS (
      SELECT 1 FROM public.aura_library_subcategories s WHERE s.subcategory_id = aura_library_packs.subcategory_id
    )
  );
CREATE POLICY aura_content_read ON public.aura_library_section_content
  FOR SELECT TO lebrands_app USING (
    EXISTS (SELECT 1 FROM public.aura_library_packs p WHERE p.pack_id = aura_library_section_content.pack_id)
    AND EXISTS (SELECT 1 FROM public.aura_library_sections s WHERE s.section_id = aura_library_section_content.section_id)
  );
CREATE POLICY aura_asset_bindings_read ON public.aura_library_section_assets
  FOR SELECT TO lebrands_app USING (
    EXISTS (
      SELECT 1 FROM public.aura_library_section_content c
      WHERE c.pack_id = aura_library_section_assets.pack_id
        AND c.section_id = aura_library_section_assets.section_id
    )
    AND EXISTS (SELECT 1 FROM public.aura_library_assets a WHERE a.asset_id = aura_library_section_assets.asset_id)
  );
CREATE POLICY store_starter_pack_tenant_read ON public.store_starter_packs
  FOR SELECT TO lebrands_app USING (
    store_id = NULLIF(current_setting('app.store_id', true), '')::uuid
  );

COMMIT;

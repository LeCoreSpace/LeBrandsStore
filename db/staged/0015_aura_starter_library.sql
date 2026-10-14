-- STAGED: shared product taxonomy and Aura pilot. No store backfill or publication.
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
  storage_provider text NOT NULL CHECK (storage_provider IN ('r2','cloudinary','app_storage','worker_assets')),
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


INSERT INTO public.aura_library_categories(category_id,name,slug) VALUES(1,'Fashion & Apparel','fashion-and-apparel');
INSERT INTO public.aura_library_categories(category_id,name,slug) VALUES(2,'Beauty & Personal Care','beauty-and-personal-care');
INSERT INTO public.aura_library_categories(category_id,name,slug) VALUES(3,'Jewelry & Watches','jewelry-and-watches');
INSERT INTO public.aura_library_categories(category_id,name,slug) VALUES(4,'Home & Living','home-and-living');
INSERT INTO public.aura_library_categories(category_id,name,slug) VALUES(5,'Electronics & Tech','electronics-and-tech');
INSERT INTO public.aura_library_categories(category_id,name,slug) VALUES(6,'Food & Beverages','food-and-beverages');
INSERT INTO public.aura_library_categories(category_id,name,slug) VALUES(7,'Fitness, Health & Wellness','fitness-health-and-wellness');
INSERT INTO public.aura_library_categories(category_id,name,slug) VALUES(8,'Health & Pharmacy','health-and-pharmacy');
INSERT INTO public.aura_library_categories(category_id,name,slug) VALUES(9,'Baby & Kids Essentials','baby-and-kids-essentials');
INSERT INTO public.aura_library_categories(category_id,name,slug) VALUES(10,'Pet Care','pet-care');
INSERT INTO public.aura_library_categories(category_id,name,slug) VALUES(11,'School, Office & Art Supplies & Musical instruments','school-office-and-art-supplies-musical');
INSERT INTO public.aura_library_categories(category_id,name,slug) VALUES(12,'Hardware & Automotive ','Hardware and Autmotive');
INSERT INTO public.aura_library_categories(category_id,name,slug) VALUES(13,'Digital Goods(sold in Physcial form)','digital-goods');
INSERT INTO public.aura_library_categories(category_id,name,slug) VALUES(14,'Resale & Pre-owned','recommerce-and-pre-owned');
INSERT INTO public.aura_library_categories(category_id,name,slug) VALUES(15,'Gifting & Occasions','gifting-and-occasions');
INSERT INTO public.aura_library_categories(category_id,name,slug) VALUES(16,'Artisan & Handicrafts','artisan-handicrafts');
INSERT INTO public.aura_library_categories(category_id,name,slug) VALUES(38,'Mobility, Cycling & Outdoor Sports','mobility-cycling-outdoor-sports');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(1,1,'Mens Clothing','mens-clothing');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(2,1,'Womens Clothing','womens-clothing');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(3,1,'Kids Wear','kids-wear');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(4,1,'Ethnic & Traditional Wear','ethnic-and-traditional-wear');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(5,1,'Streetwear','streetwear');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(6,1,'Sportswear & Activewear','sportswear-and-activewear');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(7,1,'Innerwear & Loungewear','innerwear-and-loungewear');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(8,1,'Footwear','footwear');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(9,1,'Bags & Wallets','bags-and-wallets');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(10,1,'Luxury & Designer Wear','luxury-and-designer-wear');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(11,1,'Denim & Casuals','denim-and-casuals');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(12,1,'Formal Wear','formal-wear');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(13,1,'Outerwear & Jackets','outerwear-and-jackets');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(14,1,'Sleepwear','sleepwear');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(15,1,'Swimwear & Beachwear','swimwear-and-beachwear');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(16,1,'Sarees & Lehengas','sarees-and-lehengas');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(17,1,'Kurtas & Kurtis','kurtas-and-kurtis');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(18,1,'Seasonal Fashion','seasonal-fashion');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(19,1,'Uniforms & Workwear','uniforms-and-workwear');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(20,1,'Maternity Wear','maternity-wear');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(21,2,'Skincare','skincare');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(22,2,'Haircare','haircare');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(23,2,'Makeup & Cosmetics','makeup-and-cosmetics');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(24,2,'Bath & Body','bath-and-body');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(25,2,'Fragrances','fragrances');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(26,2,'Mens Grooming','mens-grooming');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(27,2,'Beauty Tools & Appliances','beauty-tools-and-appliances');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(28,2,'Nail Care','nail-care');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(29,2,'Oral Care','oral-care');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(30,2,'Natural & Ayurvedic Beauty','natural-and-ayurvedic-beauty');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(31,2,'Sunscreens & Protection','sunscreens-and-protection');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(32,2,'Anti-Aging Solutions','anti-aging-solutions');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(33,2,'Face Masks & Treatments','face-masks-and-treatments');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(34,2,'Eye Care','eye-care');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(35,2,'Lip Care','lip-care');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(36,2,'Shaving & Beard Care','shaving-and-beard-care');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(37,2,'Hair Color & Styling','hair-color-and-styling');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(38,2,'Baby & Kids Care','baby-and-kids-care');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(39,2,'Travel Packs','travel-packs');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(40,2,'Spa & Salon Essentials','spa-and-salon-essentials');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(41,3,'Fine Jewelry','fine-jewelry');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(42,3,'Silver Jewelry','silver-jewelry');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(43,3,'Fashion Jewelry','fashion-jewelry');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(44,3,'Luxury Watches','luxury-watches');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(45,3,'Smartwatches','smartwatches');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(46,3,'Rings','rings');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(47,3,'Earrings','earrings');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(48,3,'Necklaces & Pendants','necklaces-and-pendants');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(49,3,'Bracelets & Bangles','bracelets-and-bangles');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(50,3,'Bridal Jewelry','bridal-jewelry');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(51,3,'Antique Jewelry','antique-jewelry');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(52,3,'Customized Jewelry','customized-jewelry');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(53,3,'Birthstone Jewelry','birthstone-jewelry');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(54,3,'Nose Pins','nose-pins');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(55,3,'Anklets & Toe Rings','anklets-and-toe-rings');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(56,3,'Mens Jewelry','mens-jewelry');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(57,3,'Minimalist Jewelry','minimalist-jewelry');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(58,3,'Temple Jewelry','temple-jewelry');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(59,3,'Jewelry Sets','jewelry-sets');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(60,3,'Watch Accessories','watch-accessories');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(61,4,'Furniture','furniture');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(62,4,'Home Decor','home-decor');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(63,4,'Bedding & Linen','bedding-and-linen');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(64,4,'Kitchen & Dining','kitchen-and-dining');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(65,4,'Storage & Organization','storage-and-organization');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(66,4,'Lighting & Lamps','lighting-and-lamps');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(67,4,'Curtains & Furnishings','curtains-and-furnishings');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(68,4,'Gardening & Outdoor','gardening-and-outdoor');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(69,4,'Cleaning Essentials','cleaning-essentials');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(70,4,'Tableware & Serveware','tableware-and-serveware');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(71,4,'Rugs & Carpets','rugs-and-carpets');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(72,4,'Wall Art & Frames','wall-art-and-frames');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(73,4,'Clocks & Mirrors','clocks-and-mirrors');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(74,4,'Bath Essentials','bath-essentials');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(75,4,'Festive Decor','festive-decor');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(76,4,'Smart Furnishings','smart-furnishings');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(77,4,'Workspace Furniture','workspace-furniture');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(78,4,'Kids Room Furniture','kids-room-furniture');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(79,4,'Eco-Friendly Home Products','eco-friendly-home-products');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(80,4,'Air Purifiers & Appliances','air-purifiers-and-appliances');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(81,5,'Smartphones','smartphones');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(82,5,'Laptops & Tablets','laptops-and-tablets');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(83,5,'Audio Devices','audio-devices');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(84,5,'Wearables','wearables');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(85,5,'Gaming Consoles & Gear','gaming-consoles-and-gear');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(86,5,'Smart Home Devices','smart-home-devices');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(87,5,'Cameras & Photography','cameras-and-photography');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(88,5,'Drones & Robotics','drones-and-robotics');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(89,5,'PC Components','pc-components');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(90,5,'Tech Accessories','tech-accessories');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(91,5,'Printers & Scanners','printers-and-scanners');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(92,5,'Smart TVs & Projectors','smart-tvs-and-projectors');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(93,5,'Power Banks & Batteries','power-banks-and-batteries');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(94,5,'Computer Peripherals','computer-peripherals');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(95,5,'Networking Devices','networking-devices');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(96,5,'VR & AR Devices','vr-and-ar-devices');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(97,5,'E-Readers','e-readers');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(98,5,'Dashcams & Car Tech','dashcams-and-car-tech');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(99,5,'Office Tech Gadgets','office-tech-gadgets');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(100,5,'Storage Devices','storage-devices');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(101,6,'Snacks & Namkeen','snacks-and-namkeen');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(102,6,'Chocolates & Sweets','chocolates-and-sweets');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(103,6,'Packaged Meals','packaged-meals');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(104,6,'Health Foods','health-foods');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(105,6,'Beverages','beverages');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(106,6,'Dairy & Bakery','dairy-and-bakery');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(107,6,'Ready-to-Cook Mixes','ready-to-cook-mixes');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(108,6,'Spices & Condiments','spices-and-condiments');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(109,6,'Gourmet & Organic Foods','gourmet-and-organic-foods');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(110,6,'Regional & Traditional Foods','regional-and-traditional-foods');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(111,6,'Sauces & Pickles','sauces-and-pickles');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(112,6,'Breakfast Cereals','breakfast-cereals');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(113,6,'Dry Fruits & Nuts','dry-fruits-and-nuts');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(114,6,'Protein Foods','protein-foods');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(115,6,'Instant Foods & Noodles','instant-foods-and-noodles');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(116,6,'Frozen Foods','frozen-foods');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(117,6,'Baby Foods','baby-foods');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(118,6,'Energy Bars & Shakes','energy-bars-and-shakes');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(119,6,'Mocktails & Non-Alcoholic Drinks','mocktails-and-non-alcoholic-drinks');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(120,6,'Cooking Oils & Ghee','cooking-oils-and-ghee');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(121,7,'Workout Gear','workout-gear');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(122,7,'Home Gym Equipment','home-gym-equipment');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(123,7,'Yoga Essentials','yoga-essentials');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(124,7,'Athleisure Wear','athleisure-wear');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(125,7,'Supplements & Nutrition','supplements-and-nutrition');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(126,7,'Sports Drinks','sports-drinks');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(127,7,'Health Trackers','health-trackers');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(128,7,'Recovery Products','recovery-products');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(129,7,'Mental Wellness Tools','mental-wellness-tools');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(130,7,'Fitness Gadgets','fitness-gadgets');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(131,7,'Weight Training Equipment','weight-training-equipment');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(132,7,'Martial Arts Gear','martial-arts-gear');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(133,7,'Outdoor Sports Gear','outdoor-sports-gear');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(134,7,'Running Essentials','running-essentials');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(135,7,'Cycling Gear','cycling-gear');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(136,7,'Hiking Gear','hiking-gear');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(137,7,'Physiotherapy Tools','physiotherapy-tools');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(138,7,'Posture Correctors','posture-correctors');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(139,7,'Meditation Aids','meditation-aids');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(140,7,'Spa & Relaxation Equipment','spa-and-relaxation-equipment');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(141,8,'Vitamins','vitamins');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(142,8,'Immunity Boosters','immunity-boosters');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(143,8,'Herbal Remedies','herbal-remedies');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(144,8,'Protein Powders','protein-powders');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(145,8,'First Aid Kits','first-aid-kits');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(146,8,'Personal Health Devices','personal-health-devices');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(147,8,'Orthopedic Aids','orthopedic-aids');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(148,8,'Eye Care & Lenses','eye-care-and-lenses');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(149,8,'Hygiene Products','hygiene-products');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(150,8,'Sexual Wellness','sexual-wellness');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(151,8,'Womens Health','womens-health');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(152,8,'Mens Health','mens-health');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(153,8,'Joint Care','joint-care');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(154,8,'Digestive Health','digestive-health');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(155,8,'Sleep Aids','sleep-aids');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(156,8,'Diabetes Care','diabetes-care');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(157,8,'Respiratory Health','respiratory-health');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(158,8,'Hair & Nail Supplements','hair-and-nail-supplements');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(159,8,'Child Nutrition','child-nutrition');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(160,8,'Elderly Care Products','elderly-care-products');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(161,9,'Baby Clothing','baby-clothing');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(162,9,'Diapers & Baby Care','diapers-and-baby-care');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(163,9,'Baby Food & Formula','baby-food-and-formula');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(164,9,'Strollers & Carriers','strollers-and-carriers');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(165,9,'Nursery Furniture','nursery-furniture');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(166,9,'Toys','toys');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(167,9,'Kids Grooming','kids-grooming');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(168,9,'Learning Kits','learning-kit');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(169,9,'Kids Footwear','kids-footwear');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(170,9,'Educational Books','educational-books');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(171,9,'Car Seats & Safety Gear','car-seats-and-safety-gear');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(172,9,'Feeding Bottles','feeding-bottles');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(173,9,'Baby Bath Essentials','baby-bath-essentials');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(174,9,'Baby Bedding','baby-bedding');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(175,9,'Activity Gyms','activity-gyms');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(176,9,'Teething Products','teething-products');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(177,9,'Baby Monitors','baby-monitors');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(178,9,'Seasonal Kids Wear','seasonal-kids-wear');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(179,9,'Eco-Friendly Baby Goods','eco-friendly-baby-goods');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(180,9,'Baby Gift Hampers','baby-gift-hampers');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(181,10,'Dog Food','dog-food');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(182,10,'Cat Food','cat-food');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(183,10,'Small Pet Food','small-pet-food');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(184,10,'Pet Treats','pet-treats');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(185,10,'Pet Grooming','pet-grooming');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(186,10,'Pet Healthcare','pet-healthcare');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(187,10,'Collars & Leashes','collars-and-leashes');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(188,10,'Pet Beds','pet-beds');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(189,10,'Pet Toys','pet-toys');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(190,10,'Pet Clothing','pet-clothing');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(191,10,'Training Gear','training-gear');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(192,10,'Aquatic Supplies','aquatic-supplies');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(193,10,'Bird Cages','bird-cages');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(194,10,'Small Pet Habitats','small-pet-habitats');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(195,10,'Pet Bowls','pet-bowls');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(196,10,'Travel Accessories','travel-accessories');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(197,10,'Pet Vitamins','pet-vitamins');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(198,10,'Eco-Friendly Pet Goods','eco-friendly-pet-goods');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(199,10,'Litter & Waste','litter-and-waste');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(200,10,'Pet First Aid','pet-first-aid');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(201,11,'School Stationery','school-stationery');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(202,11,'Notebooks & Journals','notebooks-and-journals');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(203,11,'Academic Textbooks','academic-textbooks');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(204,11,'Childrens Books','childrens-books');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(205,11,'Exam Prep & Reference Books','exam-prep-and-reference-books');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(212,11,'Art Supplies','art-supplies');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(213,11,'Craft Materials & DIY Kits','craft-materials-and-diy-kits');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(214,11,'Sketchbooks & Drawing Pads','sketchbooks-and-drawing-pads');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(215,11,'Digital Drawing Tablets','digital-drawing-tablets');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(216,11,'Wall Posters & Educational Charts','wall-posters-and-educational-charts');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(217,11,'Calendars & Planners','calendars-and-planners');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(218,11,'Coloring Books & Activity Books','coloring-books-and-activity-books');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(220,11,'Art Prints & Designer Stationery','art-prints-and-designer-stationery');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(208,11,'Drums & Percussion','drums-percussion');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(209,11,'Pianos & Keyboards','piano-keyboard');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(210,11,'Wind Instruments','wind-instruments');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(211,11,'String Instruments','string-instruments');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(219,11,'Office Stationery','office-stationery');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(207,11,'Guitars & Basses','guitars-bases');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(206,11,'Classical Music Instruments','classical-music0instruments');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(221,12,'Car Accessories','car-accessories');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(222,12,'Bike Accessories','bike-accessories');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(223,12,'Helmets & Riding Gear','helmets-and-riding-gear');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(224,12,'Car Care','car-care');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(225,12,'Oils & Lubricants','oils-and-lubricants');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(226,12,'Tyres & Tubes','tyres-and-tubes');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(227,12,'EV Accessories','ev-accessories');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(228,12,'Dashcams','dashcams');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(229,12,'Vehicle Lighting','vehicle-lighting');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(230,12,'Custom Mods','custom-mods');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(231,12,'Car Covers','car-covers');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(232,12,'Car Audio Systems','car-audio-systems');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(233,12,'Alloy Wheels','alloy-wheels');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(234,12,'Luggage Boxes','luggage-boxes');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(235,12,'Jackets & Gloves','jackets-and-gloves');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(236,12,'Riding Boots','riding-boots');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(237,12,'Vehicle Security','vehicle-security');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(238,12,'Roof Racks','roof-racks');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(239,12,'Child Car Seats','child-car-seats');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(240,12,'Tools','Tools');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(241,13,'E-Books','e-books');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(242,13,'Audiobooks','audiobooks');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(243,13,'Online Courses','online-courses');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(245,13,'Design Templates','design-templates');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(246,13,'Fonts','fonts');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(247,13,'Stock Photos','stock-photos');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(248,13,'Stock Videos','stock-videos');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(250,13,'Sound Effects','sound-effects');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(251,13,'Software Plugins','software-plugins');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(252,13,'Mobile Apps','mobile-apps');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(253,13,'Website Themes','website-themes');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(254,13,'Lightroom Presets','lightroom-presets');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(255,13,'Video LUTs','video-luts');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(256,13,'Game Assets','game-assets');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(257,13,'3D Models','3d-models');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(258,13,'NFTs & Collectibles','nfts-and-collectibles');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(259,13,'Printables','printables');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(260,13,'Digital Art Packs','digital-art-packs');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(249,13,'Music','licensed-music');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(244,13,'Movies','licensed-movies');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(261,14,'Fashion Resale','fashion-resale');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(263,14,'Jewelry Resale','jewelry-resale');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(264,14,'Watch Resale','watch-resale');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(265,14,'Sneaker Resale','sneaker-resale');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(266,14,'Electronics Refurbished','electronics-refurbished');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(267,14,'Laptop Refurbished','laptop-refurbished');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(268,14,'Smartphone Refurbished','smartphone-refurbished');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(269,14,'Furniture Resale','furniture-resale');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(270,14,'Kids Goods Resale','kids-goods-resale');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(271,14,'Baby Products Resale','baby-products-pre-owned');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(273,14,'Home Appliances Refurbished','home-appliances-refurbished');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(274,14,'Car Accessories Pre-owned','car-accessories-pre-owned');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(275,14,'Bike Gear Pre-owned','bike-gear-pre-owned');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(276,14,'Book Resale','book-resale');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(277,14,'Collectibles Resale','collectibles-resale');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(278,14,'Antique Resale','antique-resale');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(279,14,'Camera Gear Resale','camera-gear-resale');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(272,14,'Musical Instruments Resale','musical-preowned');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(280,14,'Sustainable Thrift','sustainable-thrift');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(262,14,'Luxury Resale','luxury-resale');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(281,15,'Gift Hampers','gift-hampers');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(282,15,'Personalized Gifts','personalized-gifts');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(283,15,'Flowers','flowers');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(284,15,'Cakes & Desserts','cakes-and-desserts');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(285,15,'Chocolates & Confectionery Gifts','chocolates-and-confectionery-gifts');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(286,15,'Wedding Gifts','wedding-gifts');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(287,15,'Anniversary Gifts','anniversary-gifts');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(288,15,'Birthday Gifts','birthday-gifts');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(289,15,'Corporate Gifts','corporate-gifts');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(290,15,'Handmade Gifts','handmade-gifts');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(291,15,'Photo Frames & Memory Books','photo-frames-and-memory-books');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(292,15,'Festive Hampers','festive-hampers');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(293,15,'Party Supplies','party-supplies');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(294,15,'Custom Jewelry Gifts','custom-jewelry-gifts');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(295,15,'Baby Shower Gifts','baby-shower-gifts');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(296,15,'Eco-Friendly Gifts','eco-friendly-gifts');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(297,15,'Luxury Gifting','luxury-gifting');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(298,15,'Greeting Cards','greeting-cards');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(299,15,'Subscription Gift Boxes','subscription-gift-boxes');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(300,15,'Wedding Favors','wedding-favors');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(301,16,'Handloom Textiles','handloom-textiles');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(302,16,'Block Printing & Natural Dye Fabrics','block-printing-natural-dye-fabrics');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(303,16,'Embroidery & Needlework','embroidery-needlework');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(306,16,'Wooden Carvings & Toys','wooden-carvings-toys');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(307,16,'Metal Crafts (Brass, Copper, Bidri)','metal-crafts-brass-copper-bidri');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(308,16,'Stone Carvings & Sculptures','stone-carvings-sculptures');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(311,16,'Folk Paintings (Madhubani, Warli, Pattachitra)','folk-paintings-madhubani-warli-pattachitra');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(312,16,'Tribal & Indigenous Art','tribal-indigenous-art');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(313,16,'Handmade Jewelry (Terracotta, Beads, Tribal Silver)','handmade-jewelry-terracotta-beads-tribal-silver');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(314,16,'Handmade Candles & Aromatics','handmade-candles-aromatics');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(315,16,'Handmade Soaps & Bath Products','handmade-soaps-bath-products');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(316,16,'Craft Supplies & DIY Tools','craft-supplies-diy-tools');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(317,16,'Paper & Party Supplies','paper-party-supplies');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(318,16,'Handmade Toys & Games','handmade-toys-games');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(319,16,'Collectibles & Miniatures','collectibles-miniatures');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(320,16,'Upcycled & Eco-Friendly Artisan Goods','upcycled-eco-friendly-artisan-goods');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(310,16,'Digital Print & Collage Art','digital-print-collage');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(309,16,'Bamboo & Cane & Jute Products','bamboo-cane-jute-products');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(304,16,'Pottery & Ceramics & Terracotta','pottery-ceramics -terracota');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(305,16,'Painting (Acrylic, oil, WaterColor)','painting');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(767,38,'City & Urban Bicycles','city-urban-bicycles');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(768,38,'Mountain Bikes','mountain-bikes');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(769,38,'Road Bikes','road-bikes');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(770,38,'Hybrid Bicycles','hybrid-bicycles');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(771,38,'Kids Bicycles','kids-bicycles');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(772,38,'Folding Bicycles','folding-bicycles');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(773,38,'Electric Bicycles','electric-bicycles');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(774,38,'Helmets & Safety Gear','helmets-safety-gear');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(775,38,'Cycling Apparel & Footwear','cycling-apparel-footwear');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(776,38,'Gloves, Caps & Protective Wear','cycling-protective-wear');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(777,38,'Lights, Bells & Visibility Accessories','cycling-visibility-accessories');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(778,38,'Locks & Anti-Theft Solutions','bicycle-locks-anti-theft');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(779,38,'Bags, Carriers & Racks','bicycle-bags-carriers-racks');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(780,38,'Bicycle Spare Parts & Components','bicycle-spare-parts-components');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(781,38,'Tyres, Tubes & Wheels','bicycle-tyres-tubes-wheels');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(782,38,'Repair Tools & Maintenance Kits','bicycle-repair-tools');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(783,38,'Lubricants & Cleaning Products','bicycle-lubricants-cleaning');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(784,38,'Fitness & Training Accessories','cycling-fitness-training');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(785,38,'Cycling for Adventure & Touring','cycling-adventure-touring');
INSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES(786,38,'Eco-Friendly & Sustainable Mobility','eco-friendly-sustainable-mobility');
INSERT INTO public.aura_library_packs(pack_id,category_id,subcategory_id,version,name,status,published_at) VALUES('c0010001-0000-4000-8000-000000000001',1,1,1,'Mens Clothing preview starter','published',now());
INSERT INTO public.aura_library_sections(section_id,page_key,section_type,name,default_position) VALUES('home.announcement','home','announcement','Announcement',1);
INSERT INTO public.aura_library_section_content(pack_id,section_id,page_key,position,settings,blocks) VALUES('c0010001-0000-4000-8000-000000000001','home.announcement','home',1,'{"enabled": false, "kicker": "", "text": "Discover a considered everyday wardrobe", "url": ""}'::jsonb,'[]'::jsonb);
INSERT INTO public.aura_library_sections(section_id,page_key,section_type,name,default_position) VALUES('home.header','home','header','Header',2);
INSERT INTO public.aura_library_section_content(pack_id,section_id,page_key,position,settings,blocks) VALUES('c0010001-0000-4000-8000-000000000001','home.header','home',2,'{"enabled": true, "kicker": "", "logo_position": "left", "links": [{"label": "Collection", "url": "/collections/all"}, {"label": "About", "url": "/pages/about"}, {"label": "Contact", "url": "/pages/contact"}]}'::jsonb,'[]'::jsonb);
INSERT INTO public.aura_library_sections(section_id,page_key,section_type,name,default_position) VALUES('home.hero','home','hero','Hero',3);
INSERT INTO public.aura_library_section_content(pack_id,section_id,page_key,position,settings,blocks) VALUES('c0010001-0000-4000-8000-000000000001','home.hero','home',3,'{"enabled": true, "kicker": "EVERYDAY, CONSIDERED", "title": "A quieter way to dress.", "description": "<p>Clean silhouettes, useful layers and a palette that works together. Explore a thoughtful starting point for your everyday wardrobe.</p>", "image": {"url": "/assets/img/aura-starters/c001-s001/v01/c001-s001-hero-desktop-v01.webp", "alt": "Illustrative menswear campaign featuring an ecru shirt and sand trousers", "width": 2000, "height": 1250, "focalX": 0.88, "focalY": 0.5}, "poster": null, "video": null, "variant": "split", "button_label": "Explore the collection", "button_url": "/collections/all"}'::jsonb,'[]'::jsonb);
INSERT INTO public.aura_library_sections(section_id,page_key,section_type,name,default_position) VALUES('home.featured-collection','home','featured-collection','Featured Collection',4);
INSERT INTO public.aura_library_section_content(pack_id,section_id,page_key,position,settings,blocks) VALUES('c0010001-0000-4000-8000-000000000001','home.featured-collection','home',4,'{"enabled": true, "kicker": "BUILD YOUR WARDROBE", "title": "Find your starting point", "collection": null, "limit": 3}'::jsonb,'[]'::jsonb);
INSERT INTO public.aura_library_sections(section_id,page_key,section_type,name,default_position) VALUES('home.featured-products','home','featured-products','Featured Products',5);
INSERT INTO public.aura_library_section_content(pack_id,section_id,page_key,position,settings,blocks) VALUES('c0010001-0000-4000-8000-000000000001','home.featured-products','home',5,'{"enabled": false, "kicker": "THE EVERYDAY EDIT", "title": "Pieces to begin with"}'::jsonb,'[]'::jsonb);
INSERT INTO public.aura_library_sections(section_id,page_key,section_type,name,default_position) VALUES('home.statement','home','statement','Statement',6);
INSERT INTO public.aura_library_section_content(pack_id,section_id,page_key,position,settings,blocks) VALUES('c0010001-0000-4000-8000-000000000001','home.statement','home',6,'{"enabled": true, "kicker": "LESS, BUT MORE USEFUL", "text": "A considered wardrobe starts with pieces you can make your own."}'::jsonb,'[]'::jsonb);
INSERT INTO public.aura_library_sections(section_id,page_key,section_type,name,default_position) VALUES('home.spotlight','home','spotlight','Spotlight',7);
INSERT INTO public.aura_library_section_content(pack_id,section_id,page_key,position,settings,blocks) VALUES('c0010001-0000-4000-8000-000000000001','home.spotlight','home',7,'{"enabled": false, "kicker": "ONE PIECE, MANY POSSIBILITIES", "product": null}'::jsonb,'[]'::jsonb);
INSERT INTO public.aura_library_sections(section_id,page_key,section_type,name,default_position) VALUES('home.lookbook','home','lookbook','Lookbook',8);
INSERT INTO public.aura_library_section_content(pack_id,section_id,page_key,position,settings,blocks) VALUES('c0010001-0000-4000-8000-000000000001','home.lookbook','home',8,'{"enabled": true, "kicker": "WAYS TO WEAR"}'::jsonb,'[{"id": "sample-lookbook-1", "type": "item", "settings": {"title": "An easy beginning", "text": "<p>An ecru shirt and sand trousers create a restrained starting point for an everyday outfit.</p>", "label": "Explore shirts", "url": "/collections/all", "image": {"url": "/assets/img/aura-starters/c001-s001/v01/c001-s001-lookbook-01-v01.webp", "alt": "Illustrative everyday outfit with an ecru shirt and sand chinos", "width": 1200, "height": 1600}}}, {"id": "sample-lookbook-2", "type": "item", "settings": {"title": "Add another layer", "text": "<p>A sage overshirt brings depth to a simple black tee without making the outfit feel busy.</p>", "label": "Explore layers", "url": "/collections/all", "image": {"url": "/assets/img/aura-starters/c001-s001/v01/c001-s001-lookbook-02-v01.webp", "alt": "Illustrative layered outfit with a sage overshirt and black T-shirt", "width": 1200, "height": 1600}}}, {"id": "sample-lookbook-3", "type": "item", "settings": {"title": "Keep the weekend simple", "text": "<p>A charcoal polo and a lighter trouser offer an uncomplicated pairing for a relaxed day.</p>", "label": "Explore essentials", "url": "/collections/all", "image": {"url": "/assets/img/aura-starters/c001-s001/v01/c001-s001-lookbook-03-v01.webp", "alt": "Illustrative casual outfit with a charcoal polo and sand chinos", "width": 1200, "height": 1600}}}]'::jsonb);
INSERT INTO public.aura_library_sections(section_id,page_key,section_type,name,default_position) VALUES('home.craft','home','craft','Craft',9);
INSERT INTO public.aura_library_section_content(pack_id,section_id,page_key,position,settings,blocks) VALUES('c0010001-0000-4000-8000-000000000001','home.craft','home',9,'{"enabled": true, "kicker": "A CLOSER LOOK", "title": "Texture and detail"}'::jsonb,'[{"id": "sample-craft-1", "type": "item", "settings": {"caption": "An illustrative study of the textures and colours behind this sample wardrobe.", "image": {"url": "/assets/img/aura-starters/c001-s001/v01/c001-s001-craft-fabric-v01.webp", "alt": "Illustrative close-up of ecru, indigo and sage woven fabrics", "width": 1200, "height": 900}}}, {"id": "sample-craft-2", "type": "item", "settings": {"caption": "Look closely at the collar, cuff and fastening details of the sample ecru shirt.", "image": {"url": "/assets/img/aura-starters/c001-s001/v01/c001-s001-craft-construction-v01.webp", "alt": "Illustrative close-up of an ecru shirt cuff, seam and button", "width": 1200, "height": 900}}}]'::jsonb);
INSERT INTO public.aura_library_sections(section_id,page_key,section_type,name,default_position) VALUES('home.founder','home','founder','Founder',10);
INSERT INTO public.aura_library_section_content(pack_id,section_id,page_key,position,settings,blocks) VALUES('c0010001-0000-4000-8000-000000000001','home.founder','home',10,'{"enabled": true, "kicker": "THE STORY BEHIND THE WARDROBE", "portrait": {"url": "/assets/img/aura-starters/c001-s001/v01/c001-s001-founder-portrait-v01.webp", "alt": "Fictional designer portrait used only as starter-content illustration", "width": 1000, "height": 1250}, "story": "<p><em>This is starter copy and a fictional portrait. Replace them with your own founder''s name, photograph and verified story.</em></p><p>A wardrobe can be an expression of how we choose to spend our days. This example brand begins with a simple idea: bring together understated colours, useful silhouettes and pieces that can be combined without overthinking.</p><p>The resulting edit offers a starting point rather than a set of rules. A shirt can stand alone or become a layer. A restrained colour can anchor an outfit or quietly connect it. Replace this sample narrative with the experiences and decisions that genuinely shaped your own brand.</p>", "name": "Sample founder"}'::jsonb,'[]'::jsonb);
INSERT INTO public.aura_library_sections(section_id,page_key,section_type,name,default_position) VALUES('home.trust','home','trust','Trust',11);
INSERT INTO public.aura_library_section_content(pack_id,section_id,page_key,position,settings,blocks) VALUES('c0010001-0000-4000-8000-000000000001','home.trust','home',11,'{"enabled": true, "kicker": "BEFORE YOU CHOOSE"}'::jsonb,'[]'::jsonb);
INSERT INTO public.aura_library_sections(section_id,page_key,section_type,name,default_position) VALUES('home.reviews','home','reviews','Reviews',12);
INSERT INTO public.aura_library_section_content(pack_id,section_id,page_key,position,settings,blocks) VALUES('c0010001-0000-4000-8000-000000000001','home.reviews','home',12,'{"enabled": false, "kicker": "FROM OUR CUSTOMERS", "title": "Experiences, in their words", "limit": 3}'::jsonb,'[]'::jsonb);
INSERT INTO public.aura_library_sections(section_id,page_key,section_type,name,default_position) VALUES('home.faq','home','faq','Faq',13);
INSERT INTO public.aura_library_section_content(pack_id,section_id,page_key,position,settings,blocks) VALUES('c0010001-0000-4000-8000-000000000001','home.faq','home',13,'{"enabled": true, "kicker": "A LITTLE MORE INFORMATION", "title": "Before you choose"}'::jsonb,'[{"id": "sample-faq-1", "type": "item", "settings": {"question": "How do I choose a size?", "answer": "<p>Use the verified measurements on the product page and compare them with a garment you already wear comfortably. Sizes can differ between styles.</p>"}}, {"id": "sample-faq-2", "type": "item", "settings": {"question": "Where can I find the fabric details?", "answer": "<p>Check the product''s materials and care information. Follow the garment label for the most appropriate care instructions.</p>"}}, {"id": "sample-faq-3", "type": "item", "settings": {"question": "How can I put an outfit together?", "answer": "<p>Begin with a colour you enjoy wearing, then add a contrasting texture or a useful layer. The lookbook provides illustrative combinations to explore.</p>"}}, {"id": "sample-faq-4", "type": "item", "settings": {"question": "What should I know about delivery?", "answer": "<p>Read the store''s current shipping policy and review the available information at checkout before placing your order.</p>"}}, {"id": "sample-faq-5", "type": "item", "settings": {"question": "Where can I check the returns policy?", "answer": "<p>Review the store''s published cancellation and refund policy before purchasing, including any applicable conditions.</p>"}}, {"id": "sample-faq-6", "type": "item", "settings": {"question": "How can I ask a question before ordering?", "answer": "<p>Use the contact details published by the brand on its contact page. Include the product name and the information you need.</p>"}}]'::jsonb);
INSERT INTO public.aura_library_sections(section_id,page_key,section_type,name,default_position) VALUES('home.footer','home','footer','Footer',14);
INSERT INTO public.aura_library_section_content(pack_id,section_id,page_key,position,settings,blocks) VALUES('c0010001-0000-4000-8000-000000000001','home.footer','home',14,'{"enabled": true, "kicker": "", "brand_line": "A considered wardrobe, made personal.", "links": [{"label": "Collection", "url": "/collections/all"}, {"label": "About", "url": "/pages/about"}, {"label": "Contact", "url": "/pages/contact"}], "social_links": []}'::jsonb,'[]'::jsonb);
INSERT INTO public.aura_library_sections(section_id,page_key,section_type,name,default_position) VALUES('collection.header','collection','header','Header',1);
INSERT INTO public.aura_library_section_content(pack_id,section_id,page_key,position,settings,blocks) VALUES('c0010001-0000-4000-8000-000000000001','collection.header','collection',1,'{"enabled": true, "kicker": "", "logo_position": "left", "links": [{"label": "Collection", "url": "/collections/all"}, {"label": "About", "url": "/pages/about"}, {"label": "Contact", "url": "/pages/contact"}]}'::jsonb,'[]'::jsonb);
INSERT INTO public.aura_library_sections(section_id,page_key,section_type,name,default_position) VALUES('collection.collection-heading','collection','collection-heading','Collection Heading',2);
INSERT INTO public.aura_library_section_content(pack_id,section_id,page_key,position,settings,blocks) VALUES('c0010001-0000-4000-8000-000000000001','collection.collection-heading','collection',2,'{"enabled": true, "kicker": "THE WARDROBE EDIT", "intro": "Explore clean silhouettes, useful layers and understated colours. Find the pieces that suit the way you dress."}'::jsonb,'[]'::jsonb);
INSERT INTO public.aura_library_sections(section_id,page_key,section_type,name,default_position) VALUES('collection.collection-nav','collection','collection-nav','Collection Nav',3);
INSERT INTO public.aura_library_section_content(pack_id,section_id,page_key,position,settings,blocks) VALUES('c0010001-0000-4000-8000-000000000001','collection.collection-nav','collection',3,'{"enabled": true, "kicker": "", "title": "Explore the wardrobe"}'::jsonb,'[]'::jsonb);
INSERT INTO public.aura_library_sections(section_id,page_key,section_type,name,default_position) VALUES('collection.collection-tools','collection','collection-tools','Collection Tools',4);
INSERT INTO public.aura_library_section_content(pack_id,section_id,page_key,position,settings,blocks) VALUES('c0010001-0000-4000-8000-000000000001','collection.collection-tools','collection',4,'{"enabled": true, "kicker": "", "title": "Find your edit"}'::jsonb,'[]'::jsonb);
INSERT INTO public.aura_library_sections(section_id,page_key,section_type,name,default_position) VALUES('collection.product-grid','collection','product-grid','Product Grid',5);
INSERT INTO public.aura_library_section_content(pack_id,section_id,page_key,position,settings,blocks) VALUES('c0010001-0000-4000-8000-000000000001','collection.product-grid','collection',5,'{"enabled": true, "kicker": "", "title": "The collection", "collection": null}'::jsonb,'[]'::jsonb);
INSERT INTO public.aura_library_sections(section_id,page_key,section_type,name,default_position) VALUES('collection.collection-pagination','collection','collection-pagination','Collection Pagination',6);
INSERT INTO public.aura_library_section_content(pack_id,section_id,page_key,position,settings,blocks) VALUES('c0010001-0000-4000-8000-000000000001','collection.collection-pagination','collection',6,'{"enabled": true, "kicker": "", "page_size": "24"}'::jsonb,'[]'::jsonb);
INSERT INTO public.aura_library_sections(section_id,page_key,section_type,name,default_position) VALUES('collection.collection-description','collection','collection-description','Collection Description',7);
INSERT INTO public.aura_library_section_content(pack_id,section_id,page_key,position,settings,blocks) VALUES('c0010001-0000-4000-8000-000000000001','collection.collection-description','collection',7,'{"enabled": true, "kicker": "DRESSING WITH INTENTION", "title": "A useful starting point", "body": "<p>This illustrative edit brings together shirts, tees, layers and trousers in a restrained palette. Each piece offers a different way to begin an outfit, whether you prefer a simple pairing or another layer.</p><p>Explore the individual product details before choosing. Replace this starter description with the focus and verified characteristics of your own collection.</p>"}'::jsonb,'[]'::jsonb);
INSERT INTO public.aura_library_sections(section_id,page_key,section_type,name,default_position) VALUES('collection.related-collections','collection','related-collections','Related Collections',8);
INSERT INTO public.aura_library_section_content(pack_id,section_id,page_key,position,settings,blocks) VALUES('c0010001-0000-4000-8000-000000000001','collection.related-collections','collection',8,'{"enabled": true, "kicker": "CONTINUE EXPLORING", "title": "Another way to build your wardrobe"}'::jsonb,'[]'::jsonb);
INSERT INTO public.aura_library_sections(section_id,page_key,section_type,name,default_position) VALUES('collection.footer','collection','footer','Footer',9);
INSERT INTO public.aura_library_section_content(pack_id,section_id,page_key,position,settings,blocks) VALUES('c0010001-0000-4000-8000-000000000001','collection.footer','collection',9,'{"enabled": true, "kicker": "", "brand_line": "A considered wardrobe, made personal.", "links": [], "social_links": []}'::jsonb,'[]'::jsonb);
INSERT INTO public.aura_library_sections(section_id,page_key,section_type,name,default_position) VALUES('product.header','product','header','Header',1);
INSERT INTO public.aura_library_section_content(pack_id,section_id,page_key,position,settings,blocks) VALUES('c0010001-0000-4000-8000-000000000001','product.header','product',1,'{"enabled": true, "kicker": "", "logo_position": "left", "links": [{"label": "Collection", "url": "/collections/all"}, {"label": "About", "url": "/pages/about"}, {"label": "Contact", "url": "/pages/contact"}]}'::jsonb,'[]'::jsonb);
INSERT INTO public.aura_library_sections(section_id,page_key,section_type,name,default_position) VALUES('product.product-details','product','product-details','Product Details',2);
INSERT INTO public.aura_library_section_content(pack_id,section_id,page_key,position,settings,blocks) VALUES('c0010001-0000-4000-8000-000000000001','product.product-details','product',2,'{"enabled": true, "kicker": "THE EVERYDAY SHIRT"}'::jsonb,'[]'::jsonb);
INSERT INTO public.aura_library_sections(section_id,page_key,section_type,name,default_position) VALUES('product.shipping-info','product','shipping-info','Shipping Info',3);
INSERT INTO public.aura_library_section_content(pack_id,section_id,page_key,position,settings,blocks) VALUES('c0010001-0000-4000-8000-000000000001','product.shipping-info','product',3,'{"enabled": true, "kicker": "PLAN YOUR PURCHASE", "title": "Delivery and returns", "body": "<p>Review the store''s shipping information and cancellation and refund policy before placing your order. Available delivery information and any applicable charges are provided by the store.</p>", "show_policy_links": true}'::jsonb,'[]'::jsonb);
INSERT INTO public.aura_library_sections(section_id,page_key,section_type,name,default_position) VALUES('product.product-specs','product','product-specs','Product Specs',4);
INSERT INTO public.aura_library_section_content(pack_id,section_id,page_key,position,settings,blocks) VALUES('c0010001-0000-4000-8000-000000000001','product.product-specs','product',4,'{"enabled": true, "kicker": "AN ILLUSTRATIVE PRODUCT", "title": "The details", "show_sku": true}'::jsonb,'[{"id": "sample-product-specs-1", "type": "item", "settings": {"label": "Example colour", "value": "Ecru"}}, {"id": "sample-product-specs-2", "type": "item", "settings": {"label": "Example silhouette", "value": "Relaxed, straight"}}, {"id": "sample-product-specs-3", "type": "item", "settings": {"label": "Example collar", "value": "Button-down"}}, {"id": "sample-product-specs-4", "type": "item", "settings": {"label": "Example sleeve", "value": "Long sleeve"}}, {"id": "sample-product-specs-5", "type": "item", "settings": {"label": "Example pocket", "value": "Single chest pocket"}}]'::jsonb);
INSERT INTO public.aura_library_sections(section_id,page_key,section_type,name,default_position) VALUES('product.material-care','product','material-care','Material Care',5);
INSERT INTO public.aura_library_section_content(pack_id,section_id,page_key,position,settings,blocks) VALUES('c0010001-0000-4000-8000-000000000001','product.material-care','product',5,'{"enabled": true, "kicker": "LOOK AFTER YOUR WARDROBE", "title": "Materials and care", "body": "<p><em>Replace this example with the product''s verified fabric composition and care-label instructions.</em></p><ul><li>Read the garment''s care label before cleaning.</li><li>Separate light and dark colours where appropriate.</li><li>Store garments clean and dry.</li></ul>"}'::jsonb,'[]'::jsonb);
INSERT INTO public.aura_library_sections(section_id,page_key,section_type,name,default_position) VALUES('product.size-guide','product','size-guide','Size Guide',6);
INSERT INTO public.aura_library_section_content(pack_id,section_id,page_key,position,settings,blocks) VALUES('c0010001-0000-4000-8000-000000000001','product.size-guide','product',6,'{"enabled": true, "kicker": "FIND YOUR FIT", "title": "Size guide", "heading_a": "Size", "heading_b": "Illustrative chest measurement", "note": "<p><em>These are sample garment measurements, not a real size chart. Replace them with verified measurements for each product before publication.</em></p>"}'::jsonb,'[{"id": "sample-size-guide-1", "type": "item", "settings": {"size": "S", "measurement": "96 cm, sample only"}}, {"id": "sample-size-guide-2", "type": "item", "settings": {"size": "M", "measurement": "102 cm, sample only"}}, {"id": "sample-size-guide-3", "type": "item", "settings": {"size": "L", "measurement": "108 cm, sample only"}}, {"id": "sample-size-guide-4", "type": "item", "settings": {"size": "XL", "measurement": "114 cm, sample only"}}]'::jsonb);
INSERT INTO public.aura_library_sections(section_id,page_key,section_type,name,default_position) VALUES('product.how-to-use','product','how-to-use','How To Use',7);
INSERT INTO public.aura_library_section_content(pack_id,section_id,page_key,position,settings,blocks) VALUES('c0010001-0000-4000-8000-000000000001','product.how-to-use','product',7,'{"enabled": true, "kicker": "MAKE IT YOUR OWN", "title": "Ways to wear"}'::jsonb,'[{"id": "sample-how-to-use-1", "type": "item", "settings": {"title": "Keep it simple", "text": "Pair a lighter shirt with an understated trouser to create a restrained starting point."}}, {"id": "sample-how-to-use-2", "type": "item", "settings": {"title": "Try another layer", "text": "Explore an overshirt or a contrasting texture when the occasion calls for another layer."}}, {"id": "sample-how-to-use-3", "type": "item", "settings": {"title": "Choose your proportion", "text": "Use the product''s fit details and measurements to decide how you prefer the garment to sit."}}]'::jsonb);
INSERT INTO public.aura_library_sections(section_id,page_key,section_type,name,default_position) VALUES('product.faq','product','faq','Faq',8);
INSERT INTO public.aura_library_section_content(pack_id,section_id,page_key,position,settings,blocks) VALUES('c0010001-0000-4000-8000-000000000001','product.faq','product',8,'{"enabled": true, "kicker": "PRODUCT QUESTIONS", "title": "A closer look"}'::jsonb,'[{"id": "sample-faq-1", "type": "item", "settings": {"question": "How should I check the fit?", "answer": "<p>Compare the verified garment measurements with something you already wear comfortably. Read any product-specific fit guidance before choosing a size.</p>"}}, {"id": "sample-faq-2", "type": "item", "settings": {"question": "Will the colour look exactly like the photograph?", "answer": "<p>Screen settings and lighting can affect how a colour appears. Use the store''s verified colour description alongside its product photographs.</p>"}}, {"id": "sample-faq-3", "type": "item", "settings": {"question": "How should I care for this garment?", "answer": "<p>Follow the product''s verified care information and the label attached to the garment.</p>"}}, {"id": "sample-faq-4", "type": "item", "settings": {"question": "Can I ask for more product information?", "answer": "<p>Use the brand''s published contact details and include the product name and your question.</p>"}}]'::jsonb);
INSERT INTO public.aura_library_sections(section_id,page_key,section_type,name,default_position) VALUES('product.related-products','product','related-products','Related Products',9);
INSERT INTO public.aura_library_section_content(pack_id,section_id,page_key,position,settings,blocks) VALUES('c0010001-0000-4000-8000-000000000001','product.related-products','product',9,'{"enabled": true, "kicker": "COMPLETE YOUR EDIT", "title": "Consider alongside", "limit": "4"}'::jsonb,'[]'::jsonb);
INSERT INTO public.aura_library_sections(section_id,page_key,section_type,name,default_position) VALUES('product.reviews','product','reviews','Reviews',10);
INSERT INTO public.aura_library_section_content(pack_id,section_id,page_key,position,settings,blocks) VALUES('c0010001-0000-4000-8000-000000000001','product.reviews','product',10,'{"enabled": false, "kicker": "PRODUCT EXPERIENCES", "title": "Customer reviews", "limit": 3}'::jsonb,'[]'::jsonb);
INSERT INTO public.aura_library_sections(section_id,page_key,section_type,name,default_position) VALUES('product.footer','product','footer','Footer',11);
INSERT INTO public.aura_library_section_content(pack_id,section_id,page_key,position,settings,blocks) VALUES('c0010001-0000-4000-8000-000000000001','product.footer','product',11,'{"enabled": true, "kicker": "", "brand_line": "A considered wardrobe, made personal.", "links": [], "social_links": []}'::jsonb,'[]'::jsonb);
INSERT INTO public.aura_library_sections(section_id,page_key,section_type,name,default_position) VALUES('cart.header','cart','header','Header',1);
INSERT INTO public.aura_library_section_content(pack_id,section_id,page_key,position,settings,blocks) VALUES('c0010001-0000-4000-8000-000000000001','cart.header','cart',1,'{"enabled": true, "kicker": "", "logo_position": "left", "links": [{"label": "Collection", "url": "/collections/all"}, {"label": "About", "url": "/pages/about"}, {"label": "Contact", "url": "/pages/contact"}]}'::jsonb,'[]'::jsonb);
INSERT INTO public.aura_library_sections(section_id,page_key,section_type,name,default_position) VALUES('cart.commerce','cart','commerce','Commerce',2);
INSERT INTO public.aura_library_section_content(pack_id,section_id,page_key,position,settings,blocks) VALUES('c0010001-0000-4000-8000-000000000001','cart.commerce','cart',2,'{"enabled": true, "kicker": "YOUR WARDROBE, TAKING SHAPE"}'::jsonb,'[]'::jsonb);
INSERT INTO public.aura_library_sections(section_id,page_key,section_type,name,default_position) VALUES('cart.shipping-info','cart','shipping-info','Shipping Info',3);
INSERT INTO public.aura_library_section_content(pack_id,section_id,page_key,position,settings,blocks) VALUES('c0010001-0000-4000-8000-000000000001','cart.shipping-info','cart',3,'{"enabled": true, "kicker": "BEFORE CHECKOUT", "title": "Shipping and returns", "body": "<p>Check the store''s published shipping and cancellation and refund policies before continuing. Review your selected products and quantities in the bag.</p>", "show_policy_links": true}'::jsonb,'[]'::jsonb);
INSERT INTO public.aura_library_sections(section_id,page_key,section_type,name,default_position) VALUES('cart.trust','cart','trust','Trust',4);
INSERT INTO public.aura_library_section_content(pack_id,section_id,page_key,position,settings,blocks) VALUES('c0010001-0000-4000-8000-000000000001','cart.trust','cart',4,'{"enabled": true, "kicker": "INFORMATION FOR YOUR ORDER"}'::jsonb,'[]'::jsonb);
INSERT INTO public.aura_library_sections(section_id,page_key,section_type,name,default_position) VALUES('cart.footer','cart','footer','Footer',5);
INSERT INTO public.aura_library_section_content(pack_id,section_id,page_key,position,settings,blocks) VALUES('c0010001-0000-4000-8000-000000000001','cart.footer','cart',5,'{"enabled": true, "kicker": "", "brand_line": "A considered wardrobe, made personal.", "links": [], "social_links": []}'::jsonb,'[]'::jsonb);
INSERT INTO public.aura_library_sections(section_id,page_key,section_type,name,default_position) VALUES('checkout.header','checkout','header','Header',1);
INSERT INTO public.aura_library_section_content(pack_id,section_id,page_key,position,settings,blocks) VALUES('c0010001-0000-4000-8000-000000000001','checkout.header','checkout',1,'{"enabled": true, "kicker": "", "logo_position": "left", "links": [{"label": "Collection", "url": "/collections/all"}, {"label": "About", "url": "/pages/about"}, {"label": "Contact", "url": "/pages/contact"}]}'::jsonb,'[]'::jsonb);
INSERT INTO public.aura_library_sections(section_id,page_key,section_type,name,default_position) VALUES('checkout.commerce','checkout','commerce','Commerce',2);
INSERT INTO public.aura_library_section_content(pack_id,section_id,page_key,position,settings,blocks) VALUES('c0010001-0000-4000-8000-000000000001','checkout.commerce','checkout',2,'{"enabled": true, "kicker": "THE FINAL DETAILS"}'::jsonb,'[]'::jsonb);
INSERT INTO public.aura_library_sections(section_id,page_key,section_type,name,default_position) VALUES('checkout.trust','checkout','trust','Trust',3);
INSERT INTO public.aura_library_section_content(pack_id,section_id,page_key,position,settings,blocks) VALUES('c0010001-0000-4000-8000-000000000001','checkout.trust','checkout',3,'{"enabled": true, "kicker": "HELP WITH YOUR ORDER"}'::jsonb,'[]'::jsonb);
INSERT INTO public.aura_library_sections(section_id,page_key,section_type,name,default_position) VALUES('checkout.footer','checkout','footer','Footer',4);
INSERT INTO public.aura_library_section_content(pack_id,section_id,page_key,position,settings,blocks) VALUES('c0010001-0000-4000-8000-000000000001','checkout.footer','checkout',4,'{"enabled": true, "kicker": "", "brand_line": "A considered wardrobe, made personal.", "links": [], "social_links": []}'::jsonb,'[]'::jsonb);
INSERT INTO public.aura_library_assets(asset_id,storage_provider,object_key,media_type,mime_type,width,height,alt_text,provenance,rights_note,status) VALUES('c0010001-0000-4000-8001-000000000001','worker_assets','/assets/img/aura-starters/c001-s001/v01/c001-s001-hero-desktop-v01.webp','image','image/webp',2000,1250,'Illustrative menswear campaign featuring an ecru shirt and sand trousers','ai_generated','Illustrative preview asset. Source provenance, upscaling and rights review notes are retained in the starter-pack report; not verified merchant imagery.','ready');
INSERT INTO public.aura_library_assets(asset_id,storage_provider,object_key,media_type,mime_type,width,height,alt_text,provenance,rights_note,status) VALUES('c0010001-0000-4000-8001-000000000002','worker_assets','/assets/img/aura-starters/c001-s001/v01/c001-s001-hero-mobile-v01.webp','image','image/webp',900,1200,'Portrait crop of the illustrative ecru-shirt menswear campaign','ai_generated','Illustrative preview asset. Source provenance, upscaling and rights review notes are retained in the starter-pack report; not verified merchant imagery.','ready');
INSERT INTO public.aura_library_assets(asset_id,storage_provider,object_key,media_type,mime_type,width,height,alt_text,provenance,rights_note,status) VALUES('c0010001-0000-4000-8001-000000000003','worker_assets','/assets/img/aura-starters/c001-s001/v01/c001-s001-product-p01-front-v01.webp','image','image/webp',1200,1600,'Sample ecru long-sleeve button-down shirt photographed from the front','ai_generated','Illustrative preview asset. Source provenance, upscaling and rights review notes are retained in the starter-pack report; not verified merchant imagery.','ready');
INSERT INTO public.aura_library_assets(asset_id,storage_provider,object_key,media_type,mime_type,width,height,alt_text,provenance,rights_note,status) VALUES('c0010001-0000-4000-8001-000000000004','worker_assets','/assets/img/aura-starters/c001-s001/v01/c001-s001-product-p02-front-v01.webp','image','image/webp',1200,1600,'Sample indigo long-sleeve shirt photographed from the front','ai_generated','Illustrative preview asset. Source provenance, upscaling and rights review notes are retained in the starter-pack report; not verified merchant imagery.','ready');
INSERT INTO public.aura_library_assets(asset_id,storage_provider,object_key,media_type,mime_type,width,height,alt_text,provenance,rights_note,status) VALUES('c0010001-0000-4000-8001-000000000005','worker_assets','/assets/img/aura-starters/c001-s001/v01/c001-s001-product-p03-front-v01.webp','image','image/webp',1200,1600,'Sample black crew-neck T-shirt photographed from the front','ai_generated','Illustrative preview asset. Source provenance, upscaling and rights review notes are retained in the starter-pack report; not verified merchant imagery.','ready');
INSERT INTO public.aura_library_assets(asset_id,storage_provider,object_key,media_type,mime_type,width,height,alt_text,provenance,rights_note,status) VALUES('c0010001-0000-4000-8001-000000000006','worker_assets','/assets/img/aura-starters/c001-s001/v01/c001-s001-product-p04-front-v01.webp','image','image/webp',1200,1600,'Sample sage overshirt with two chest pockets photographed from the front','ai_generated','Illustrative preview asset. Source provenance, upscaling and rights review notes are retained in the starter-pack report; not verified merchant imagery.','ready');
INSERT INTO public.aura_library_assets(asset_id,storage_provider,object_key,media_type,mime_type,width,height,alt_text,provenance,rights_note,status) VALUES('c0010001-0000-4000-8001-000000000007','worker_assets','/assets/img/aura-starters/c001-s001/v01/c001-s001-product-p05-front-v01.webp','image','image/webp',1200,1600,'Sample sand-coloured chinos photographed from the front','ai_generated','Illustrative preview asset. Source provenance, upscaling and rights review notes are retained in the starter-pack report; not verified merchant imagery.','ready');
INSERT INTO public.aura_library_assets(asset_id,storage_provider,object_key,media_type,mime_type,width,height,alt_text,provenance,rights_note,status) VALUES('c0010001-0000-4000-8001-000000000008','worker_assets','/assets/img/aura-starters/c001-s001/v01/c001-s001-product-p06-front-v01.webp','image','image/webp',1200,1600,'Sample charcoal short-sleeve polo photographed from the front','ai_generated','Illustrative preview asset. Source provenance, upscaling and rights review notes are retained in the starter-pack report; not verified merchant imagery.','ready');
INSERT INTO public.aura_library_assets(asset_id,storage_provider,object_key,media_type,mime_type,width,height,alt_text,provenance,rights_note,status) VALUES('c0010001-0000-4000-8001-000000000009','worker_assets','/assets/img/aura-starters/c001-s001/v01/c001-s001-product-p01-back-v01.webp','image','image/webp',1200,1600,'Back view of the same sample ecru button-down shirt','ai_generated','Illustrative preview asset. Source provenance, upscaling and rights review notes are retained in the starter-pack report; not verified merchant imagery.','ready');
INSERT INTO public.aura_library_assets(asset_id,storage_provider,object_key,media_type,mime_type,width,height,alt_text,provenance,rights_note,status) VALUES('c0010001-0000-4000-8001-000000000010','worker_assets','/assets/img/aura-starters/c001-s001/v01/c001-s001-product-p01-detail-v01.webp','image','image/webp',1200,1200,'Close-up of the sample ecru shirt collar, button and woven texture','ai_generated','Illustrative preview asset. Source provenance, upscaling and rights review notes are retained in the starter-pack report; not verified merchant imagery.','ready');
INSERT INTO public.aura_library_assets(asset_id,storage_provider,object_key,media_type,mime_type,width,height,alt_text,provenance,rights_note,status) VALUES('c0010001-0000-4000-8001-000000000011','worker_assets','/assets/img/aura-starters/c001-s001/v01/c001-s001-product-p01-model-v01.webp','image','image/webp',1200,1600,'Illustrative model wearing the sample ecru shirt with sand chinos','ai_generated','Illustrative preview asset. Source provenance, upscaling and rights review notes are retained in the starter-pack report; not verified merchant imagery.','ready');
INSERT INTO public.aura_library_assets(asset_id,storage_provider,object_key,media_type,mime_type,width,height,alt_text,provenance,rights_note,status) VALUES('c0010001-0000-4000-8001-000000000012','worker_assets','/assets/img/aura-starters/c001-s001/v01/c001-s001-lookbook-01-v01.webp','image','image/webp',1200,1600,'Illustrative everyday outfit with an ecru shirt and sand chinos','ai_generated','Illustrative preview asset. Source provenance, upscaling and rights review notes are retained in the starter-pack report; not verified merchant imagery.','ready');
INSERT INTO public.aura_library_assets(asset_id,storage_provider,object_key,media_type,mime_type,width,height,alt_text,provenance,rights_note,status) VALUES('c0010001-0000-4000-8001-000000000013','worker_assets','/assets/img/aura-starters/c001-s001/v01/c001-s001-lookbook-02-v01.webp','image','image/webp',1200,1600,'Illustrative layered outfit with a sage overshirt and black T-shirt','ai_generated','Illustrative preview asset. Source provenance, upscaling and rights review notes are retained in the starter-pack report; not verified merchant imagery.','ready');
INSERT INTO public.aura_library_assets(asset_id,storage_provider,object_key,media_type,mime_type,width,height,alt_text,provenance,rights_note,status) VALUES('c0010001-0000-4000-8001-000000000014','worker_assets','/assets/img/aura-starters/c001-s001/v01/c001-s001-lookbook-03-v01.webp','image','image/webp',1200,1600,'Illustrative casual outfit with a charcoal polo and sand chinos','ai_generated','Illustrative preview asset. Source provenance, upscaling and rights review notes are retained in the starter-pack report; not verified merchant imagery.','ready');
INSERT INTO public.aura_library_assets(asset_id,storage_provider,object_key,media_type,mime_type,width,height,alt_text,provenance,rights_note,status) VALUES('c0010001-0000-4000-8001-000000000015','worker_assets','/assets/img/aura-starters/c001-s001/v01/c001-s001-collection-shirts-v01.webp','image','image/webp',1200,1200,'Square crop of an illustrative ecru-shirt outfit','ai_generated','Illustrative preview asset. Source provenance, upscaling and rights review notes are retained in the starter-pack report; not verified merchant imagery.','ready');
INSERT INTO public.aura_library_assets(asset_id,storage_provider,object_key,media_type,mime_type,width,height,alt_text,provenance,rights_note,status) VALUES('c0010001-0000-4000-8001-000000000016','worker_assets','/assets/img/aura-starters/c001-s001/v01/c001-s001-collection-layers-v01.webp','image','image/webp',1200,1200,'Square crop showing an illustrative sage overshirt layered over a black tee','ai_generated','Illustrative preview asset. Source provenance, upscaling and rights review notes are retained in the starter-pack report; not verified merchant imagery.','ready');
INSERT INTO public.aura_library_assets(asset_id,storage_provider,object_key,media_type,mime_type,width,height,alt_text,provenance,rights_note,status) VALUES('c0010001-0000-4000-8001-000000000017','worker_assets','/assets/img/aura-starters/c001-s001/v01/c001-s001-collection-everyday-v01.webp','image','image/webp',1200,1200,'Square crop of an illustrative charcoal-polo outfit','ai_generated','Illustrative preview asset. Source provenance, upscaling and rights review notes are retained in the starter-pack report; not verified merchant imagery.','ready');
INSERT INTO public.aura_library_assets(asset_id,storage_provider,object_key,media_type,mime_type,width,height,alt_text,provenance,rights_note,status) VALUES('c0010001-0000-4000-8001-000000000018','worker_assets','/assets/img/aura-starters/c001-s001/v01/c001-s001-craft-fabric-v01.webp','image','image/webp',1200,900,'Illustrative close-up of ecru, indigo and sage woven fabrics','ai_generated','Illustrative preview asset. Source provenance, upscaling and rights review notes are retained in the starter-pack report; not verified merchant imagery.','ready');
INSERT INTO public.aura_library_assets(asset_id,storage_provider,object_key,media_type,mime_type,width,height,alt_text,provenance,rights_note,status) VALUES('c0010001-0000-4000-8001-000000000019','worker_assets','/assets/img/aura-starters/c001-s001/v01/c001-s001-craft-construction-v01.webp','image','image/webp',1200,900,'Illustrative close-up of an ecru shirt cuff, seam and button','ai_generated','Illustrative preview asset. Source provenance, upscaling and rights review notes are retained in the starter-pack report; not verified merchant imagery.','ready');
INSERT INTO public.aura_library_assets(asset_id,storage_provider,object_key,media_type,mime_type,width,height,alt_text,provenance,rights_note,status) VALUES('c0010001-0000-4000-8001-000000000020','worker_assets','/assets/img/aura-starters/c001-s001/v01/c001-s001-founder-portrait-v01.webp','image','image/webp',1000,1250,'Fictional designer portrait used only as starter-content illustration','ai_generated','Illustrative preview asset. Source provenance, upscaling and rights review notes are retained in the starter-pack report; not verified merchant imagery.','ready');
INSERT INTO public.aura_library_section_assets(pack_id,section_id,field_path,variant,asset_id) VALUES('c0010001-0000-4000-8000-000000000001','home.hero',ARRAY['settings','image']::text[],'desktop','c0010001-0000-4000-8001-000000000001');
INSERT INTO public.aura_library_section_assets(pack_id,section_id,field_path,variant,asset_id) VALUES('c0010001-0000-4000-8000-000000000001','home.hero',ARRAY['settings','image']::text[],'mobile','c0010001-0000-4000-8001-000000000002');
INSERT INTO public.aura_library_section_assets(pack_id,section_id,field_path,variant,asset_id) VALUES('c0010001-0000-4000-8000-000000000001','home.lookbook',ARRAY['blocks','0','settings','image']::text[],'default','c0010001-0000-4000-8001-000000000012');
INSERT INTO public.aura_library_section_assets(pack_id,section_id,field_path,variant,asset_id) VALUES('c0010001-0000-4000-8000-000000000001','home.lookbook',ARRAY['blocks','1','settings','image']::text[],'default','c0010001-0000-4000-8001-000000000013');
INSERT INTO public.aura_library_section_assets(pack_id,section_id,field_path,variant,asset_id) VALUES('c0010001-0000-4000-8000-000000000001','home.lookbook',ARRAY['blocks','2','settings','image']::text[],'default','c0010001-0000-4000-8001-000000000014');
INSERT INTO public.aura_library_section_assets(pack_id,section_id,field_path,variant,asset_id) VALUES('c0010001-0000-4000-8000-000000000001','home.craft',ARRAY['blocks','0','settings','image']::text[],'default','c0010001-0000-4000-8001-000000000018');
INSERT INTO public.aura_library_section_assets(pack_id,section_id,field_path,variant,asset_id) VALUES('c0010001-0000-4000-8000-000000000001','home.craft',ARRAY['blocks','1','settings','image']::text[],'default','c0010001-0000-4000-8001-000000000019');
INSERT INTO public.aura_library_section_assets(pack_id,section_id,field_path,variant,asset_id) VALUES('c0010001-0000-4000-8000-000000000001','home.founder',ARRAY['settings','portrait']::text[],'default','c0010001-0000-4000-8001-000000000020');

-- Existing owner, security mode and EXECUTE ACL are preserved.
CREATE OR REPLACE FUNCTION public.aura_validate_fields(p_fields jsonb,p_values jsonb,p_store uuid,p_enabled boolean DEFAULT true)
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
      IF jsonb_typeof(v) <> 'object' OR EXISTS (SELECT 1 FROM jsonb_object_keys(v) x WHERE x NOT IN ('url','alt','width','height','focalX','focalY','sources'))
        OR url IS NULL OR (url !~* ('^https://media\.lebrands\.store/stores/'||p_store::text||'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.'||
          CASE WHEN kind='video' THEN '(mp4|webm)$' ELSE '(png|jpe?g|svg|webp|avif)$' END)
          AND NOT (kind='image' AND url = ANY(ARRAY['/assets/img/aura-starters/c001-s001/v01/c001-s001-hero-desktop-v01.webp','/assets/img/aura-starters/c001-s001/v01/c001-s001-hero-mobile-v01.webp','/assets/img/aura-starters/c001-s001/v01/c001-s001-product-p01-front-v01.webp','/assets/img/aura-starters/c001-s001/v01/c001-s001-product-p02-front-v01.webp','/assets/img/aura-starters/c001-s001/v01/c001-s001-product-p03-front-v01.webp','/assets/img/aura-starters/c001-s001/v01/c001-s001-product-p04-front-v01.webp','/assets/img/aura-starters/c001-s001/v01/c001-s001-product-p05-front-v01.webp','/assets/img/aura-starters/c001-s001/v01/c001-s001-product-p06-front-v01.webp','/assets/img/aura-starters/c001-s001/v01/c001-s001-product-p01-back-v01.webp','/assets/img/aura-starters/c001-s001/v01/c001-s001-product-p01-detail-v01.webp','/assets/img/aura-starters/c001-s001/v01/c001-s001-product-p01-model-v01.webp','/assets/img/aura-starters/c001-s001/v01/c001-s001-lookbook-01-v01.webp','/assets/img/aura-starters/c001-s001/v01/c001-s001-lookbook-02-v01.webp','/assets/img/aura-starters/c001-s001/v01/c001-s001-lookbook-03-v01.webp','/assets/img/aura-starters/c001-s001/v01/c001-s001-collection-shirts-v01.webp','/assets/img/aura-starters/c001-s001/v01/c001-s001-collection-layers-v01.webp','/assets/img/aura-starters/c001-s001/v01/c001-s001-collection-everyday-v01.webp','/assets/img/aura-starters/c001-s001/v01/c001-s001-craft-fabric-v01.webp','/assets/img/aura-starters/c001-s001/v01/c001-s001-craft-construction-v01.webp','/assets/img/aura-starters/c001-s001/v01/c001-s001-founder-portrait-v01.webp']::text[])))
        OR jsonb_typeof(v->'alt') IS DISTINCT FROM 'string' OR length(btrim(v->>'alt'))=0 OR length(v->>'alt')>500 OR v->>'alt' ~ '[<>]' THEN
        RAISE EXCEPTION 'Invalid media or media belongs to another store' USING ERRCODE='22023';
      END IF;
      IF v ? 'sources' THEN
        IF kind<>'image' OR jsonb_typeof(v->'sources')<>'array' OR jsonb_array_length(v->'sources')>4
          OR NOT(v ? 'width' AND v ? 'height') THEN
          RAISE EXCEPTION 'Invalid responsive image sources' USING ERRCODE='22023';
        END IF;
        PERFORM public.aura_validate_sources(v,p_store);
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

-- Fail atomically if any seeded pilot page fails the installed Aura schema.
DO $$
DECLARE page text; layout jsonb;
BEGIN
  FOR page,layout IN
    SELECT page_key,jsonb_agg(jsonb_build_object(
      'id',replace(section_id,'.','-'),'type',split_part(section_id,'.',2),
      'settings',settings,'blocks',blocks) ORDER BY position)
    FROM public.aura_library_section_content
    WHERE pack_id='c0010001-0000-4000-8000-000000000001' GROUP BY page_key
  LOOP
    PERFORM public.aura_validate_layout('00000000-0000-4000-8000-000000000001',page,layout);
  END LOOP;
END $$;

CREATE FUNCTION public.pin_aura_starter_pack(p_store uuid,p_pack uuid,p_token text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE actor uuid; settings jsonb;
BEGIN
  IF p_store IS NULL OR p_store IS DISTINCT FROM NULLIF(current_setting('app.store_id',true),'')::uuid THEN
    RAISE EXCEPTION 'Store access denied' USING ERRCODE='42501';
  END IF;
  actor:=public.store_page_actor(p_store,p_token);
  SELECT s.settings INTO settings FROM public.store_setup s WHERE store_id=p_store;
  IF p_pack IS DISTINCT FROM 'c0010001-0000-4000-8000-000000000001'::uuid
    OR COALESCE(settings->>'category','') NOT IN ('fashion','fashion-and-apparel')
    OR COALESCE(settings->>'subcategory','')<>'mens-clothing'
    OR NOT EXISTS(SELECT 1 FROM public.aura_library_packs WHERE pack_id=p_pack AND status='published')
  THEN RAISE EXCEPTION 'Starter selection is not allowed' USING ERRCODE='42501'; END IF;
  INSERT INTO public.store_starter_packs(store_id,pack_id,applied_by) VALUES(p_store,p_pack,actor)
  ON CONFLICT(store_id) DO UPDATE SET pack_id=EXCLUDED.pack_id,applied_by=EXCLUDED.applied_by,applied_at=now();
END $$;
ALTER FUNCTION public.pin_aura_starter_pack(uuid,uuid,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.pin_aura_starter_pack(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pin_aura_starter_pack(uuid,uuid,text) TO lebrands_app;

-- No store_pages, store_setup, products or publications are changed.

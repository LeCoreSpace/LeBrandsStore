-- Authorised completion of the missing D2C type/subcategory links.
-- Additive reference data only. No merchant products or financial records.
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND (rolsuper OR rolbypassrls)) THEN
    RAISE EXCEPTION 'Run as an administrative BYPASSRLS role';
  END IF;
END $$;
CREATE TEMP TABLE d2c_membership_seed(payload jsonb NOT NULL) ON COMMIT DROP;
__D2C_TYPE_MEMBERSHIPS_V1__

-- Collision/retirement checks make this a reviewed import, not a bulk upsert
-- that could silently revive references an operator intentionally retired.
DO $$ BEGIN
  IF (SELECT count(DISTINCT a.type_key) FROM d2c_membership_seed,
    jsonb_to_recordset(payload->'assignments') a(type_key text)) <> 1698 THEN
    RAISE EXCEPTION 'Expected all 1698 source product types';
  END IF;
  IF EXISTS(SELECT 1 FROM d2c_membership_seed,
    jsonb_to_recordset(payload->'subcategories') n(subcategory_id bigint,category_id bigint,name text,slug text)
    JOIN public.catalogue_subcategories s
      ON s.subcategory_id=n.subcategory_id OR (s.category_id=n.category_id AND s.slug=n.slug)
    WHERE s.subcategory_id<>n.subcategory_id OR s.category_id<>n.category_id
      OR s.name<>n.name OR s.slug<>n.slug OR NOT s.is_active) THEN
    RAISE EXCEPTION 'New subcategory collides with existing or retired taxonomy';
  END IF;
  IF EXISTS(SELECT 1 FROM d2c_membership_seed,
    jsonb_to_recordset(payload->'subcategories') n(category_id bigint)
    LEFT JOIN public.catalogue_categories c ON c.category_id=n.category_id
    WHERE c.category_id IS NULL OR NOT c.is_active) THEN
    RAISE EXCEPTION 'New subcategory parent is unavailable';
  END IF;
  IF EXISTS(SELECT 1 FROM d2c_membership_seed,
    jsonb_to_recordset(payload->'assignments') a(type_key text)
    LEFT JOIN public.catalogue_product_types t USING(type_key)
    WHERE t.id IS NULL OR t.review_status='rejected'
      OR (t.review_status='approved' AND NOT t.is_active)) THEN
    RAISE EXCEPTION 'Missing or explicitly retired product type; review before importing';
  END IF;
END $$;

INSERT INTO public.catalogue_subcategories(subcategory_id,category_id,name,slug)
SELECT n.* FROM d2c_membership_seed,
  jsonb_to_recordset(payload->'subcategories') n(subcategory_id bigint,category_id bigint,name text,slug text)
ON CONFLICT(subcategory_id) DO NOTHING;

DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM d2c_membership_seed,
    jsonb_to_recordset(payload->'assignments') a(type_key text,subcategory_id bigint)
    LEFT JOIN public.catalogue_subcategories s USING(subcategory_id)
    LEFT JOIN public.catalogue_categories c ON c.category_id=s.category_id
    WHERE s.subcategory_id IS NULL OR NOT s.is_active OR NOT c.is_active) THEN
    RAISE EXCEPTION 'Membership references unavailable taxonomy';
  END IF;
  IF EXISTS(SELECT 1 FROM d2c_membership_seed,
    jsonb_to_recordset(payload->'assignments') a(type_key text,subcategory_id bigint)
    JOIN public.catalogue_product_types t USING(type_key)
    JOIN public.catalogue_subcategory_product_types m ON m.product_type_id=t.id AND m.subcategory_id=a.subcategory_id
    WHERE NOT m.is_active OR m.review_status<>'approved') THEN
    RAISE EXCEPTION 'Existing retired or unreviewed membership; do not overwrite it';
  END IF;
END $$;

INSERT INTO public.catalogue_subcategory_product_types(subcategory_id,product_type_id,review_status,is_active)
SELECT a.subcategory_id,t.id,'approved',true FROM d2c_membership_seed,
  jsonb_to_recordset(payload->'assignments') a(type_key text,subcategory_id bigint)
  JOIN public.catalogue_product_types t USING(type_key)
ON CONFLICT(subcategory_id,product_type_id) DO NOTHING;

UPDATE public.catalogue_product_types t SET review_status='approved',is_active=true,updated_at=now()
WHERE t.review_status='pending' AND NOT t.is_active AND EXISTS(
  SELECT 1 FROM d2c_membership_seed,
    jsonb_to_recordset(payload->'assignments') a(type_key text) WHERE a.type_key=t.type_key);

DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM d2c_membership_seed,
    jsonb_to_recordset(payload->'assignments') a(type_key text,subcategory_id bigint)
    JOIN public.catalogue_product_types t USING(type_key)
    LEFT JOIN public.catalogue_subcategory_product_types m ON m.product_type_id=t.id AND m.subcategory_id=a.subcategory_id
    WHERE m.product_type_id IS NULL OR NOT m.is_active OR m.review_status<>'approved' OR NOT t.is_active OR t.review_status<>'approved') THEN
    RAISE EXCEPTION 'Incomplete D2C membership activation';
  END IF;
END $$;

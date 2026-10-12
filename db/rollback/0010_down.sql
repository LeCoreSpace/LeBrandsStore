-- MANUAL ONLY. Never run this from the Worker or during deployment.
-- WARNING: removes every section draft, published layout, version-history row,
-- and responsive-rendition metadata introduced by 0010. Back these up first.
-- Existing stores, publications, products, media rows, invoices and R2 objects
-- are not deleted. This does not roll back 0011 or its financial/approval rules.
-- New video media must be dealt with explicitly before reverting to 0009:
-- the original upload_type constraint permits only logo/image.
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.media WHERE upload_type NOT IN ('logo', 'image')) THEN
    RAISE EXCEPTION '0010 rollback requires resolving video media first; no media is deleted automatically'
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

DROP TRIGGER guard_media_sources ON public.media;
DROP TRIGGER store_page_layout_guard ON public.store_pages;
DROP TRIGGER initialize_store_page_layouts ON public.stores;
DROP TRIGGER sync_wizard_page_slots ON public.store_setup;
DROP TRIGGER initialize_aura_product_image ON public.product_media;
DROP TRIGGER publish_store_page_layouts ON public.store_publications;

-- Explicit signatures and no CASCADE: unexpected external dependencies abort
-- the transaction instead of deleting objects outside this rollback's scope.
DROP FUNCTION public.publish_store_page_layouts();
DROP FUNCTION public.restore_store_page(uuid,text,integer,integer,text);
DROP FUNCTION public.save_store_page(uuid,text,jsonb,integer,text);
DROP FUNCTION public.store_page_actor(uuid,text);
DROP FUNCTION public.initialize_aura_product_image();
DROP FUNCTION public.sync_wizard_page_slots();
DROP FUNCTION public.initialize_store_page_layouts();
DROP FUNCTION public.guard_store_page_layout();
DROP FUNCTION public.aura_default_layout(text,jsonb);
DROP FUNCTION public.aura_section(text,jsonb,jsonb);
DROP FUNCTION public.aura_validate_layout(uuid,text,jsonb);
DROP FUNCTION public.aura_guard_media_sources();
DROP FUNCTION public.aura_validate_sources(jsonb,uuid);
DROP FUNCTION public.aura_validate_fields(jsonb,jsonb,uuid,boolean);
DROP FUNCTION public.aura_section_schemas();

DROP TABLE public.store_page_versions;
DROP TABLE public.store_pages;

-- Dropping the column also removes its column-specific UPDATE grant.
ALTER TABLE public.media DROP COLUMN renditions;
ALTER TABLE public.media DROP CONSTRAINT media_upload_type_check;
-- Exact constraint name and permitted values originally introduced by 0005.
ALTER TABLE public.media ADD CONSTRAINT media_upload_type_check
  CHECK (upload_type IN ('logo', 'image'));

-- Remove only this migration's bookkeeping so db:migrate can apply 0010 again.
-- All earlier migration records are retained.
DELETE FROM public.schema_migrations WHERE filename = '0010_store_pages.sql';

COMMIT;

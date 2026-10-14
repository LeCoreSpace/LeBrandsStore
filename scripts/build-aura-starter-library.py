"""Build the reviewed pilot data, bundled theme assets and staged migration.

Author-time only. Never connects to a database or changes merchant content.
"""
import csv
import json
import pathlib
import re
import zipfile
import subprocess

ROOT = pathlib.Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "src/public"
PREFIX = "/assets/img/aura-starters/c001-s001/v01/"


def csv_rows(name):
    with (ROOT / "attached_assets" / name).open() as stream:
        return list(csv.DictReader(stream))


def build():
    categories = sorted(
        [dict(id=int(r["id"]), name=r["name"], slug=r["slug"]) for r in csv_rows(
            "Supabase_Snippet_Untitled_query_(8)_1791952139924.csv"
        ) if r["brand_type"] == "product"], key=lambda r: r["id"]
    )
    ids = {r["id"] for r in categories}
    subs = []
    for filename in [
        "Supabase_Snippet_Untitled_query_(7)_1791950591202.csv",
        "Supabase_Snippet_Untitled_query_(9)_1791952199035.csv",
    ]:
        subs.extend(dict(id=int(r["id"]), category_id=int(r["category_id"]),
                         name=r["name"], slug=r["slug"])
                    for r in csv_rows(filename) if int(r["category_id"]) in ids)
    assert len(categories) == 17 and len(subs) == 340
    assert len({r["id"] for r in subs}) == 340
    assert all(sum(s["category_id"] == c["id"] for s in subs) == 20 for c in categories)
    taxonomy = dict(categories=categories, subcategories=sorted(subs, key=lambda s: s["id"]))
    (PUBLIC / "aura-taxonomy-data.js").write_text(
        "// Generated from the supplied product-only LeBrands.Space exports.\n"
        "export const TAXONOMY = " + json.dumps(taxonomy, ensure_ascii=False, indent=2) + ";\n")
    pack_zip = ROOT / "generated-artifacts/c001-s001-mens-clothing-v01-complete-preview.zip"
    with zipfile.ZipFile(pack_zip) as archive:
        root = "c001-s001-mens-clothing-v01/"
        content = json.loads(archive.read(root + "content.json"))
        manifest = json.loads(archive.read(root + "images-manifest.json"))
        target = PUBLIC / "img/aura-starters/c001-s001/v01"
        target.mkdir(parents=True, exist_ok=True)
        for image in manifest["images"]:
            (target / image["filename"]).write_bytes(archive.read(root + "images/" + image["filename"]))
    (PUBLIC / "aura-starter-data.js").write_text(
        "// Generated pilot exchange data. Samples never create sellable inventory.\n"
        "export const MENS_STARTER = " + json.dumps(dict(content=content, images=manifest["images"]),
                                                    ensure_ascii=False, indent=2) + ";\n")
    urls = [PREFIX + image["filename"] for image in manifest["images"]]
    (PUBLIC / "aura-starter-assets.js").write_text(
        "// Exact shared-image allow-list. Tenant media validation remains unchanged.\n"
        "export const STARTER_IMAGE_URLS = Object.freeze(" + json.dumps(urls, indent=2) + ");\n"
        "export const isStarterImage = url => STARTER_IMAGE_URLS.includes(url);\n")
    draft = (ROOT / "db/staged/aura_starter_library_draft.sql").read_text()
    draft = draft[draft.index("DO $$"):draft.rindex("COMMIT;")]
    draft = draft.replace("'r2','cloudinary','app_storage'", "'r2','cloudinary','app_storage','worker_assets'")
    sql = "-- STAGED: shared product taxonomy and Aura pilot. No store backfill or publication.\n" + draft
    quote = lambda value: "'" + str(value).replace("'", "''") + "'"
    j = lambda value: quote(json.dumps(value, ensure_ascii=False)) + "::jsonb"
    for c in categories:
        sql += f"\nINSERT INTO public.aura_library_categories(category_id,name,slug) VALUES({c['id']},{quote(c['name'])},{quote(c['slug'])});"
    for s in subs:
        sql += f"\nINSERT INTO public.aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES({s['id']},{s['category_id']},{quote(s['name'])},{quote(s['slug'])});"
    pack = "c0010001-0000-4000-8000-000000000001"
    sql += f"\nINSERT INTO public.aura_library_packs(pack_id,category_id,subcategory_id,version,name,status,published_at) VALUES('{pack}',1,1,1,'Mens Clothing preview starter','published',now());"
    normalized = json.loads(subprocess.check_output([
        "node", "--input-type=module", "-e",
        "import {starterLayouts} from './src/public/aura-skeleton.js';"
        "import {validateLayout} from './src/public/aura-layout.js';"
        "const data={aura_starter_enabled:true,settings:{category:'fashion-and-apparel',subcategory:'mens-clothing'},products:[],collections:[]};"
        "const layouts=starterLayouts(data);"
        "for(const [page,layout] of Object.entries(layouts))validateLayout(page,layout,{storeId:'00000000-0000-4000-8000-000000000001',productIds:new Set(),collectionIds:new Set()});"
        "console.log(JSON.stringify(layouts));",
    ], cwd=ROOT, text=True))
    for s in content["sections"]:
        sid, page, kind, position = s["section_id"], s["page_key"], s["section_type"], s["position"]
        sql += f"\nINSERT INTO public.aura_library_sections(section_id,page_key,section_type,name,default_position) VALUES({quote(sid)},{quote(page)},{quote(kind)},{quote(kind.replace('-', ' ').title())},{position});"
        section = next(part for part in normalized[page] if part["type"] == kind)
        sql += f"\nINSERT INTO public.aura_library_section_content(pack_id,section_id,page_key,position,settings,blocks) VALUES('{pack}',{quote(sid)},{quote(page)},{position},{j(section['settings'])},{j(section['blocks'])});"
    asset_ids = {}
    for index, image in enumerate(manifest["images"], 1):
        asset_id = f"c0010001-0000-4000-8001-{index:012d}"
        asset_ids[image["filename"]] = asset_id
        sql += f"\nINSERT INTO public.aura_library_assets(asset_id,storage_provider,object_key,media_type,mime_type,width,height,alt_text,provenance,rights_note,status) VALUES('{asset_id}','worker_assets',{quote(PREFIX+image['filename'])},'image','image/webp',{image['width']},{image['height']},{quote(image['alt'])},'ai_generated','Illustrative preview asset. Source provenance, upscaling and rights review notes are retained in the starter-pack report; not verified merchant imagery.','ready');"
    for s in content["sections"]:
        for media in s.get("media", []):
            path = "ARRAY[" + ",".join(map(quote, media["field_path"])) + "]::text[]"
            sql += f"\nINSERT INTO public.aura_library_section_assets(pack_id,section_id,field_path,variant,asset_id) VALUES('{pack}',{quote(s['section_id'])},{path},{quote(media['variant'])},'{asset_ids[media['filename']]}');"
    # Preserve all existing validator checks, adding only exact immutable image URLs.
    source = (ROOT / "db/migrations/0010_store_pages.sql").read_text()
    function = source[source.index("CREATE FUNCTION public.aura_validate_fields("):source.index("\nCREATE FUNCTION public.aura_validate_sources(")]
    function = function.replace("CREATE FUNCTION", "CREATE OR REPLACE FUNCTION", 1)
    old = """OR url IS NULL OR url !~* ('^https://media\\.lebrands\\.store/stores/'||p_store::text||'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.'||
          CASE WHEN kind='video' THEN '(mp4|webm)$' ELSE '(png|jpe?g|svg|webp|avif)$' END)"""
    assert old in function
    replacement = """OR url IS NULL OR (url !~* ('^https://media\\.lebrands\\.store/stores/'||p_store::text||'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.'||
          CASE WHEN kind='video' THEN '(mp4|webm)$' ELSE '(png|jpe?g|svg|webp|avif)$' END)
          AND NOT (kind='image' AND url = ANY(ARRAY[""" + ",".join(map(quote, urls)) + "]::text[])))"
    sql += "\n\n-- Existing owner, security mode and EXECUTE ACL are preserved.\n" + function.replace(old, replacement)
    sql += """
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
"""
    sql += "\n-- No store_pages, store_setup, products or publications are changed.\n"
    (ROOT / "db/staged/0015_aura_starter_library.sql").write_text(sql)
    print("Built 17 product categories, 340 subcategories, 43 section seeds and 20 shared images.")


if __name__ == "__main__":
    build()

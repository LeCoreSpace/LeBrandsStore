import {mediaUrl} from "../store/media.js";
import {capacityState} from "../billing/capacity.js";
import {commerceError} from "../public/commerce-rules.js";
import {STYLE_IDS} from "../public/aura-styles.js";
import {buildMediaSizeGuide,MEDIA_GUIDE_CATEGORIES} from "../public/media-placement-guide.js";
import {imagePlacements} from "../media-images/placements.js";

export function mediaLibraryFilters(url){
  const query=(url.searchParams.get("q")||"").trim();
  const type=url.searchParams.get("type")||"all";
  const raw=url.searchParams.get("offset")||"0";
  const tab=url.searchParams.get("tab")||"library";
  const guide_theme=url.searchParams.get("guide_theme")||"current";
  const guide_category=url.searchParams.get("guide_category")||"all";
  if(query.length>100||!["all","image","video","logo"].includes(type)||!/^(0|[1-9]\d{0,5})$/.test(raw))
    throw commerceError("Choose a valid search, media type and page.",undefined,400);
  if(!["library","sizes","ai"].includes(tab)||!(guide_theme==="current"||STYLE_IDS.includes(guide_theme))
    ||!(guide_category==="all"||MEDIA_GUIDE_CATEGORIES.some(c=>c.id===guide_category)))
    throw commerceError("Choose a valid media tab, theme and placement category.",undefined,400);
  return {query,type,offset:Number(raw),limit:36,tab,guide_theme,guide_category};
}
const decode=value=>typeof value==="string"?JSON.parse(value):value;
const number=value=>{
  const result=Number(value);
  if(!Number.isSafeInteger(result)||result<0)throw new Error("Invalid media accounting.");
  return result;
};

export async function mediaLibrary(tx,id,filters){
  const {query,type,offset,limit}=filters;
  const [store]=await tx`SELECT store_id,name,subdomain,status FROM public.stores WHERE store_id=${id}`;
  if(!store)throw commerceError("Store not found.",undefined,404);
  const [schema]=await tx`SELECT to_regclass('public.store_pages') IS NOT NULL AS pages,
    to_regclass('public.store_blog_drafts') IS NOT NULL AS blog_drafts,
    to_regclass('public.store_blog_publications') IS NOT NULL AS blog_publications`;
  const [summary]=await tx`SELECT count(*) AS total,coalesce(sum(size_bytes),0) AS used
    FROM public.media WHERE store_id=${id}`;
  const [setup]=await tx`SELECT settings FROM public.store_setup WHERE store_id=${id}`;
  const layouts=schema.pages
    ?await tx`SELECT page_key,draft_layout::text AS layout FROM public.store_pages WHERE store_id=${id} ORDER BY page_key`:[];
  const size_guide=buildMediaSizeGuide({settings:decode(setup?.settings)||{},
    layouts:layouts.map(l=>({page_key:l.page_key,layout:decode(l.layout)})),storeId:id,
    theme:filters.guide_theme,category:filters.guide_category});
  const capacity=await capacityState(tx,id);
  const where=tx`m.store_id=${id}
    AND (${type}='all' OR (${type}='logo' AND m.upload_type='logo')
      OR (${type}='image' AND m.kind='image' AND m.upload_type<>'logo')
      OR (${type}='video' AND m.kind='video'))
    AND (${query}='' OR strpos(lower(m.alt_text),lower(${query}))>0
      OR strpos(lower(m.object_key),lower(${query}))>0)`;
  const [count]=await tx`SELECT count(*) AS total FROM public.media m WHERE ${where}`;
  const pages=schema.pages?tx`EXISTS(SELECT 1 FROM public.store_pages p WHERE p.store_id=${id}
    AND (strpos(to_jsonb(p)::text,m.id::text)>0 OR strpos(to_jsonb(p)::text,m.object_key)>0))`:tx`false`;
  const drafts=schema.blog_drafts?tx`EXISTS(SELECT 1 FROM public.store_blog_drafts b WHERE b.store_id=${id}
    AND (strpos(to_jsonb(b)::text,m.id::text)>0 OR strpos(to_jsonb(b)::text,m.object_key)>0))`:tx`false`;
  const blogs=schema.blog_publications?tx`EXISTS(SELECT 1 FROM public.store_blog_publications b WHERE b.store_id=${id}
    AND (strpos(b.snapshot::text,m.id::text)>0 OR strpos(b.snapshot::text,m.object_key)>0))`:tx`false`;
  const rows=await tx`SELECT m.id,m.object_key,m.kind,m.upload_type,m.content_type,m.size_bytes,m.width,m.height,m.alt_text,m.created_at,
    (SELECT coalesce(json_agg(refs),'[]'::json)::text FROM(
      SELECT p.id,p.title FROM public.product_media pm
      JOIN public.products p ON p.store_id=pm.store_id AND p.id=pm.product_id
      WHERE pm.store_id=${id} AND pm.media_id=m.id ORDER BY p.title,p.id LIMIT 8
    ) refs) AS product_refs,
    (SELECT count(*) FROM public.product_media pm WHERE pm.store_id=${id} AND pm.media_id=m.id) AS product_count,
    EXISTS(SELECT 1 FROM public.store_setup s WHERE s.store_id=${id}
      AND (strpos(to_jsonb(s)::text,m.id::text)>0 OR strpos(to_jsonb(s)::text,m.object_key)>0)) AS setup_reference,
    EXISTS(SELECT 1 FROM public.store_publications s WHERE s.store_id=${id}
      AND (strpos(s.snapshot::text,m.id::text)>0 OR strpos(s.snapshot::text,m.object_key)>0)) AS published_reference,
    ${pages} AS page_reference,${drafts} AS blog_draft_reference,${blogs} AS blog_public_reference
    FROM public.media m WHERE ${where}
    ORDER BY m.created_at DESC,m.id DESC LIMIT ${limit+1} OFFSET ${offset}`;
  const root=`/stores/${id}`;
  const items=rows.slice(0,limit).map(m=>{
    // Only public tenant media metadata is returned, never private document keys,
    // configuration snapshots, product costs, credentials or R2 listings.
    const url=mediaUrl(m.object_key);
    if(!url||!m.object_key.startsWith(`stores/${id}/`))throw new Error("Invalid store media key.");
    const products=decode(m.product_refs)||[];
    const usage=products.map(p=>({label:`Product: ${p.title}`,href:`${root}/products/${p.id}`}));
    const more=number(m.product_count)-products.length;
    if(more>0)usage.push({label:`${more} more product references`,href:`${root}/products`});
    if(m.setup_reference)usage.push({label:"Store setup / design draft",href:`${root}/build/ann`});
    if(m.published_reference)usage.push({label:"Published storefront",href:`${root}/editor`});
    if(m.page_reference)usage.push({label:"Page sections (draft or published)",href:`${root}/editor`});
    if(m.blog_draft_reference)usage.push({label:"Blog drafts",href:`${root}/blog`});
    if(m.blog_public_reference)usage.push({label:"Published blog articles",href:`${root}/blog`});
    return {id:m.id,url,filename:m.object_key.split("/").pop(),kind:m.kind,upload_type:m.upload_type,
      content_type:m.content_type,size_bytes:number(m.size_bytes),width:m.width,height:m.height,
      alt_text:m.alt_text,created_at:m.created_at,usage,usage_checked:true};
  });
  return {store,items,total:number(count.total),library_total:number(summary.total),...filters,size_guide,
    image_placements:imagePlacements(decode(setup?.settings)||{},id),
    has_more:rows.length>limit,storage:{used:number(capacity?.used?.storage??summary.used),
      limit:capacity?.limits?.storage==null?null:number(capacity.limits.storage)}};
}

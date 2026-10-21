import {commerceError} from "../public/commerce-rules.js";
import {productHref} from "../public/commerce-options.js";
import {blogInput,blogRevision} from "./input.js";
import {blogArticle} from "./repository.js";
import {storeCanonicalOrigin} from "../store/discovery.js";

export const parseBlogJSON=value=>typeof value==="string"?JSON.parse(value):value;
export async function blogPublishingAvailable(tx) {
  const [row]=await tx`SELECT to_regclass('public.store_blog_publications') IS NOT NULL AS available`;
  return row?.available===true;
}
export async function blogOrigin(tx,id,store) {
  const [domain]=await tx`SELECT hostname FROM public.domains WHERE store_id=${id} AND status='active' AND is_primary=true ORDER BY hostname LIMIT 1`;
  return storeCanonicalOrigin({store},domain?.hostname);
}
export function publicationMeta(row,origin="") {
  return row?{slug:row.slug,revision:String(row.revision),first_published_at:row.first_published_at,
    updated_at:row.updated_at,url:origin?`${origin}/blog/${row.slug}`:""}:null;
}
export async function blogPublications(tx,id,{slug=null}={}) {
  if(!await blogPublishingAvailable(tx))return {blogs:[],blog_article:null};
  const blogs=await tx`SELECT article_id AS id,slug,snapshot->>'title' AS title,snapshot->>'summary' AS summary,
    snapshot->>'author' AS author,snapshot->>'category' AS category,(snapshot->'hero_image')::text AS hero_image,
    revision::text,first_published_at::text,updated_at::text FROM public.store_blog_publications
    WHERE store_id=${id} ORDER BY first_published_at DESC,article_id`;
  for(const row of blogs)row.hero_image=parseBlogJSON(row.hero_image);
  let article=null;
  if(slug){
    const [row]=await tx`SELECT snapshot::text AS snapshot,first_published_at::text,updated_at::text FROM public.store_blog_publications WHERE store_id=${id} AND slug=${slug}`;
    if(row)article={...parseBlogJSON(row.snapshot),first_published_at:row.first_published_at,updated_at:row.updated_at};
  }
  return {blogs,blog_article:article};
}
export async function changeBlogPublication(tx,id,articleId,input,action) {
  if(!await blogPublishingAvailable(tx))throw commerceError("Publishing needs its database update.",undefined,503);
  if(!input || Object.keys(input).some(k=>k!=="expected_revision"))throw commerceError("Use the saved article revision.",undefined,400);
  const expected=blogRevision(input.expected_revision), article=await blogArticle(tx,id,articleId);
  if(article.revision!==expected)throw commerceError("This article changed in another window. Reload the latest version before publishing.",undefined,409);
  if(action==="unpublish"){
    await tx`DELETE FROM public.store_blog_publications WHERE store_id=${id} AND article_id=${articleId}`;
    const rows=await tx`UPDATE public.store_blog_drafts SET revision=revision+1,updated_at=clock_timestamp()
      WHERE store_id=${id} AND id=${articleId} AND revision=${expected}::bigint RETURNING id`;
    if(!rows.length)throw commerceError("This article changed. Reload before continuing.",undefined,409);
    return;
  }
  const [store]=await tx`SELECT s.status,p.snapshot::text AS snapshot FROM public.stores s
    LEFT JOIN public.store_publications p ON p.store_id=s.store_id WHERE s.store_id=${id}`;
  if(store?.status!=="live" || !store.snapshot)throw commerceError("Make your store live before publishing an article.",undefined,400);
  const value=blogInput(Object.fromEntries(["title","slug","summary","author","category","hero_media_id","hero_alt","sections"].map(k=>[k,article[k]])));
  if(!value.summary.trim() || !value.sections.length)throw commerceError("Add a summary and at least one content section before publishing.",undefined,400);
  const imageIds=[...new Set([value.hero_media_id,...value.sections.map(s=>s.media_id)].filter(Boolean))];
  const rows=imageIds.length?await tx`SELECT id,object_key,alt_text,width,height FROM public.media WHERE store_id=${id}
    AND upload_type='image' AND id IN(SELECT value::uuid FROM jsonb_array_elements_text(${JSON.stringify(imageIds)}::jsonb) x(value))`:[];
  if(rows.length!==imageIds.length)throw commerceError("An article image is no longer available. Choose it again.",undefined,400);
  const media=rows.map(m=>({id:m.id,url:`https://media.lebrands.store/${m.object_key}`,alt:m.alt_text,width:m.width,height:m.height}));
  const current=parseBlogJSON(store.snapshot), products=[];
  for(const section of value.sections){
    if(["image","image_text"].includes(section.type)&&!section.media_id)throw commerceError("Choose an image for each image section.",undefined,400);
    if(["text","quote","faq"].includes(section.type)&&!section.body.trim())throw commerceError("Complete the text in each section before publishing.",undefined,400);
    if(section.type==="faq" && section.body.split(/\n{2,}/).some(pair=>pair.trim()&&pair.trim().split("\n").filter(line=>line.trim()).length<2))
      throw commerceError("Give each FAQ question an answer on the next line.",undefined,400);
    if(section.type==="cta"&&(!section.href || !section.heading.trim()))throw commerceError("Add a button label and link to the call to action.",undefined,400);
    if(section.type==="product"){
      const product=current.products?.find(p=>p.id===section.product_id&&(!p.status||["active","published"].includes(p.status)));
      if(!product)throw commerceError("Choose a currently published product for each product section.",undefined,400);
      products.push({id:product.id,name:product.title||product.name||"Product",href:productHref(product)});
    }
  }
  const hero=media.find(m=>m.id===value.hero_media_id);
  const snapshot={...value,id:articleId,media,products,hero_image:hero?{...hero,alt:value.hero_alt||hero.alt}:null};
  const [updated]=await tx`UPDATE public.store_blog_drafts SET published_slug=slug,first_published_at=COALESCE(first_published_at,clock_timestamp()),revision=revision+1,updated_at=clock_timestamp()
    WHERE store_id=${id} AND id=${articleId} AND revision=${expected}::bigint RETURNING revision::text,first_published_at::text`;
  if(!updated)throw commerceError("This article changed. Reload before publishing.",undefined,409);
  await tx`INSERT INTO public.store_blog_publications(store_id,article_id,slug,snapshot,revision,first_published_at)
    VALUES(${id},${articleId},${value.slug},${JSON.stringify(snapshot)}::jsonb,${updated.revision}::bigint,${updated.first_published_at}::timestamptz)
    ON CONFLICT(store_id,article_id) DO UPDATE SET snapshot=excluded.snapshot,revision=excluded.revision,updated_at=clock_timestamp()`;
}

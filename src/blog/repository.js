import {blogInput,blogRevision} from "./input.js";
import {commerceError} from "../public/commerce-rules.js";

const missing = () => commerceError("Article not found.",undefined,404);
const conflict = () => commerceError("This article changed in another session. Copy your changes, then reload the saved version.",undefined,409);
const parse = value => typeof value === "string" ? JSON.parse(value) : value;
export async function blogAvailable(tx) {
  const [row] = await tx`SELECT to_regclass('public.store_blog_drafts') IS NOT NULL AS available`;
  return row?.available === true;
}
export async function blogArticle(tx,id,articleId) {
  const [row] = await tx`SELECT id,title,slug,summary,author,category,hero_media_id,hero_alt,sections,
    revision::text AS revision,created_at::text AS created_at,updated_at::text AS updated_at
    FROM public.store_blog_drafts WHERE store_id=${id} AND id=${articleId}`;
  if (!row) throw missing();
  return {...row,sections:parse(row.sections)};
}
export async function blogDashboard(tx,id,{articleId=null,includeResources=false,offset=0}={}) {
  const [store] = await tx`SELECT store_id,name,subdomain,status FROM public.stores WHERE store_id=${id}`;
  const available = await blogAvailable(tx);
  const data = {store,available,articles:[],article:null,media:[],products:[],list_offset:offset};
  if (!available) return data;
  data.articles = await tx`SELECT id,title,summary,revision::text AS revision,updated_at::text AS updated_at
    FROM public.store_blog_drafts WHERE store_id=${id} ORDER BY updated_at DESC,id LIMIT 201 OFFSET ${offset}`;
  // Explicit list paging avoids silently hiding drafts on larger stores.
  data.has_more = data.articles.length > 200;
  data.articles = data.articles.slice(0,200);
  if (articleId) data.article = await blogArticle(tx,id,articleId);
  if (includeResources) {
    const rows = await tx`SELECT id,object_key,upload_type,alt_text,width,height FROM public.media
      WHERE store_id=${id} AND upload_type='image' ORDER BY created_at DESC,id DESC LIMIT 200`;
    data.media = rows.map(m=>({id:m.id,url:`https://media.lebrands.store/${m.object_key}`,type:m.upload_type,alt:m.alt_text,width:m.width,height:m.height}));
    // Select only frozen published catalogue evidence, not mutable product rows.
    const [publication] = await tx`SELECT snapshot FROM public.store_publications WHERE store_id=${id}`;
    const products = parse(publication?.snapshot)?.products || [];
    data.products = products.filter(p=>!p.status || ["active","published"].includes(p.status)).map(p=>({id:p.id,name:p.title || p.name || "Product"}));
    // Older chosen images must remain visible even outside the first media page.
    const chosen = [...new Set([data.article?.hero_media_id,...(data.article?.sections || []).map(s=>s.media_id)].filter(Boolean))];
    const missingMedia=chosen.filter(mediaId=>!data.media.some(m=>m.id===mediaId));
    if(missingMedia.length) {
      const rows = await tx`SELECT id,object_key,upload_type,alt_text,width,height FROM public.media
        WHERE store_id=${id} AND id IN(SELECT value::uuid FROM jsonb_array_elements_text(${JSON.stringify(missingMedia)}::jsonb) x(value))
        AND upload_type='image'`;
      data.media.push(...rows.map(m=>({id:m.id,url:`https://media.lebrands.store/${m.object_key}`,type:"image",alt:m.alt_text,width:m.width,height:m.height})));
    }
  }
  return data;
}
export async function saveBlogArticle(tx,id,articleId,input) {
  const value = blogInput(input);
  const revision = articleId ? blogRevision(input.expected_revision) : null;
  const images = [...new Set([value.hero_media_id,...value.sections.map(s=>s.media_id)].filter(Boolean))];
  if(images.length) {
    const media = await tx`SELECT id FROM public.media WHERE store_id=${id}
      AND id IN(SELECT value::uuid FROM jsonb_array_elements_text(${JSON.stringify(images)}::jsonb) x(value)) AND upload_type='image'`;
    if (media.length!==images.length) throw commerceError("Choose images uploaded to this store.",undefined,400);
  }
  const productIds = value.sections.map(s=>s.product_id).filter(Boolean);
  if (productIds.length) {
    const [row] = await tx`SELECT snapshot FROM public.store_publications WHERE store_id=${id}`;
    const products = parse(row?.snapshot)?.products || [];
    if (productIds.some(pid=>!products.some(p=>p.id===pid && (!p.status || ["active","published"].includes(p.status)))))
      throw commerceError("Choose a product from this store's published catalogue.",undefined,400);
  }
  let row;
  if (articleId) {
    [row] = await tx`UPDATE public.store_blog_drafts SET title=${value.title},slug=${value.slug},
      summary=${value.summary},author=${value.author},category=${value.category},
      hero_media_id=${value.hero_media_id},hero_alt=${value.hero_alt},sections=${JSON.stringify(value.sections)}::jsonb,
      revision=revision+1,updated_at=clock_timestamp()
      WHERE store_id=${id} AND id=${articleId} AND revision=${revision}::bigint RETURNING id`;
    if (!row) { await blogArticle(tx,id,articleId); throw conflict(); }
  } else {
    [row] = await tx`INSERT INTO public.store_blog_drafts(store_id,title,slug,summary,author,category,hero_media_id,hero_alt,sections)
      VALUES(${id},${value.title},${value.slug},${value.summary},${value.author},${value.category},${value.hero_media_id},
        ${value.hero_alt},${JSON.stringify(value.sections)}::jsonb) RETURNING id`;
  }
  return blogArticle(tx,id,row.id);
}
export async function deleteBlogArticle(tx,id,articleId,input) {
  const revision = blogRevision(input?.expected_revision);
  const rows = await tx`DELETE FROM public.store_blog_drafts WHERE store_id=${id} AND id=${articleId}
    AND revision=${revision}::bigint RETURNING id`;
  if (!rows.length) { await blogArticle(tx,id,articleId); throw conflict(); }
}

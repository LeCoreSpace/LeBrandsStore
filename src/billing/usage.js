import {marketingAvailable} from "../marketing/service.js";
import {capacityState} from "./capacity.js";

// Called only inside the owner-authorized, tenant-scoped billing transaction.
// One aggregate read, never provider calls, credentials or individual records.
export async function planUsage(tx, id) {
  const marketingReady = await marketingAvailable(tx);
  const social = marketingReady ? tx`(
    SELECT jsonb_build_object(
      'meta',meta_enabled AND meta_pixel_id<>'',
      'google',google_enabled AND ga4_measurement_id<>'',
      'meta_saved',meta_pixel_id<>'','google_saved',ga4_measurement_id<>'',
      'google_ads',google_enabled AND google_ads_id<>'' AND google_label_purchase<>'')
    FROM public.store_marketing_integrations WHERE store_id=${id}
  )` : tx`NULL::jsonb`;
  const [row] = await tx`
    WITH publication AS (
      SELECT coalesce((SELECT nullif(snapshot->'products','null'::jsonb) FROM public.store_publications
        WHERE store_id=${id}),'[]'::jsonb) AS products
    )
    SELECT jsonb_build_object(
      'available',true,'measured_at',statement_timestamp(),
      'published_products',jsonb_array_length(products),
      'published_skus',coalesce((SELECT sum(greatest(1,jsonb_array_length(
        coalesce(nullif(product->'variants','null'::jsonb),'[]'::jsonb))))
        FROM jsonb_array_elements(products) AS product),0),
      'public_media_bytes',(SELECT coalesce(sum(size_bytes),0) FROM public.media WHERE store_id=${id}),
      'additional_staff_seats',(SELECT count(*) FROM public.store_members WHERE store_id=${id} AND role<>'owner'),
      'monthly_order_soft_band',(SELECT count(*) FROM public.orders WHERE store_id=${id}
        AND created_at >= (date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')
        AND created_at <= statement_timestamp()),
      'payment',(SELECT jsonb_build_object('status',status,'enabled',metadata->>'enabled'='true',
        'mode',metadata->>'mode','verified',metadata->>'credentials_verified'='true' AND metadata->>'webhook_verified'='true')
        FROM public.integrations WHERE store_id=${id} AND provider='razorpay'),
      'delivery',(SELECT jsonb_build_object('status',status,'enabled',metadata->>'enabled'='true')
        FROM public.integrations WHERE store_id=${id} AND provider='shiprocket'),
      'domain',(SELECT jsonb_build_object('status',status,'hostname',hostname) FROM public.domains
        WHERE store_id=${id} AND status<>'disabled'
        ORDER BY (status='active') DESC,is_primary DESC,created_at DESC LIMIT 1),
      'social_available',${marketingReady}::boolean,'social',${social}
    ) AS usage FROM publication`;
  const usage = typeof row?.usage === "string" ? JSON.parse(row.usage) : row?.usage;
  if (!usage || usage.available !== true || ["published_products","published_skus","public_media_bytes",
    "additional_staff_seats","monthly_order_soft_band"].some(key=>!Number.isSafeInteger(usage[key])||usage[key]<0)) {
    throw Object.assign(new Error("Current plan usage could not be read."),{status:503});
  }
  const capacity=await capacityState(tx,id);
  return capacity?{...usage,capacity}:usage;
}

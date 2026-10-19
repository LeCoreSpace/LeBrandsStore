-- Read-only commerce reporting. No financial records, costs or invoices change.
DO $$ BEGIN
 IF to_regprocedure('public.catalogue_cost_actor(uuid,text)') IS NULL THEN
  RAISE EXCEPTION 'Apply and review 0041_catalogue_cogs.sql before commerce analytics';
 END IF;
END $$;

CREATE FUNCTION public.commerce_analytics_read(
 sid uuid,token text,from_date date,to_date date,zone text,ccy text,report text,page_limit integer,page_offset integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE result jsonb;
BEGIN
 PERFORM public.catalogue_cost_actor(sid,token);
 IF from_date IS NULL OR to_date IS NULL OR to_date<from_date OR to_date-from_date>365
  OR zone IS NULL OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name=zone)
  OR ccy IS NULL OR ccy!~'^[A-Z]{3}$' OR report IS NULL OR report NOT IN('sales','orders','products')
  OR page_limit IS NULL OR page_limit NOT BETWEEN 1 AND 10000 OR page_offset IS NULL OR page_offset NOT BETWEEN 0 AND 1000000 THEN
  RAISE EXCEPTION 'Use a valid report period, currency and pagination' USING ERRCODE='22023';
 END IF;
 WITH dated AS (
  SELECT o.*,o.status IN('confirmed_cod','confirmed','paid','processing','packed','shipped','delivered') AS eligible,
   o.status IN('returned','refunded') AS reversed,
   to_char(o.created_at AT TIME ZONE zone,'YYYY-MM-DD') AS day
  FROM public.orders o WHERE o.store_id=sid
   AND o.created_at>=(from_date::timestamp AT TIME ZONE zone)
   AND o.created_at<((to_date+1)::timestamp AT TIME ZONE zone)
 ), scoped AS (
  SELECT * FROM dated WHERE currency=ccy
 ), lines AS (
  SELECT i.id AS order_item_id,i.product_id,i.product_option_id,i.title,i.sku,i.quantity,
   i.unit_price_paise,i.total_paise AS line_total_paise,i.taxable_paise,
   o.id AS order_id,o.order_number,o.created_at,o.status,o.payment_method,o.currency,o.eligible,o.day,
   o.discount_paise AS order_discount_paise,o.total_paise AS order_total_paise,
   CASE WHEN c.currency=ccy THEN c.unit_cost_paise END AS unit_cost_paise,
   CASE WHEN c.cost_source='currency_mismatch' OR c.currency<>ccy THEN 'currency_mismatch'
    WHEN c.unit_cost_paise IS NULL THEN 'missing' ELSE 'known' END AS cost_status,
   (c.unit_cost_paise IS NOT NULL AND c.currency=ccy AND o.discount_paise=0
    AND i.taxable_paise>=0
    AND i.taxable_paise+i.cgst_paise+i.sgst_paise+i.igst_paise=i.total_paise
    AND i.cgst_paise+i.sgst_paise+i.igst_paise=i.tax_paise) AS comparable,
   (SELECT string_agg(CASE WHEN jsonb_typeof(v.value)='object'
       THEN concat_ws(': ',v.value->>'name',v.value->>'value') ELSE v.value#>>'{}' END,' / ' ORDER BY v.ordinality)
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(to_jsonb(i)->'option_snapshot')='array'
      THEN to_jsonb(i)->'option_snapshot' ELSE '[]'::jsonb END) WITH ORDINALITY v(value,ordinality)) AS variant_label
  FROM scoped o JOIN public.order_items i ON i.store_id=sid AND i.order_id=o.id
   LEFT JOIN public.order_item_costs c ON c.store_id=sid AND c.order_item_id=i.id
 ), costed AS (
  SELECT *,CASE WHEN eligible AND comparable THEN taxable_paise::numeric-unit_cost_paise::numeric*quantity END AS estimated_margin_paise
  FROM lines
 ), totals AS (
  SELECT count(*) AS all_orders,count(*) FILTER(WHERE eligible) AS orders,
   coalesce(sum(subtotal_paise) FILTER(WHERE eligible OR reversed),0) AS gross_merchandise_paise,
   coalesce(sum(discount_paise) FILTER(WHERE eligible OR reversed),0) AS discounts_paise,
   coalesce(sum(subtotal_paise-discount_paise) FILTER(WHERE reversed),0) AS reversals_paise,
   coalesce(sum(subtotal_paise-discount_paise) FILTER(WHERE eligible),0) AS net_merchandise_paise,
   coalesce(sum(total_paise) FILTER(WHERE eligible),0) AS booked_order_value_paise,
   coalesce(round(avg(total_paise) FILTER(WHERE eligible)),0) AS aov_paise,
   min(created_at) FILTER(WHERE eligible) AS first_sale_at
  FROM scoped
 ), costs AS (
  SELECT coalesce(sum(quantity),0) AS total_units,
   coalesce(sum(quantity) FILTER(WHERE cost_status='known'),0) AS known_units,
   coalesce(sum(quantity) FILTER(WHERE comparable),0) AS comparable_units,
   coalesce(sum(taxable_paise) FILTER(WHERE comparable),0) AS comparable_revenue_paise,
   coalesce(sum(unit_cost_paise::numeric*quantity) FILTER(WHERE comparable),0) AS captured_cost_paise,
   sum(estimated_margin_paise) FILTER(WHERE comparable) AS estimated_margin_paise
  FROM costed WHERE eligible
 ), order_days AS (
  SELECT o.day,count(o.id) FILTER(WHERE o.eligible) AS orders,count(o.id) AS all_orders,
   coalesce(sum(o.subtotal_paise) FILTER(WHERE o.eligible OR o.reversed),0) AS gross_merchandise_paise,
   coalesce(sum(o.discount_paise) FILTER(WHERE o.eligible OR o.reversed),0) AS discounts_paise,
   coalesce(sum(o.subtotal_paise-o.discount_paise) FILTER(WHERE o.reversed),0) AS reversals_paise,
   coalesce(sum(o.subtotal_paise-o.discount_paise) FILTER(WHERE o.eligible),0) AS net_merchandise_paise,
   coalesce(sum(o.total_paise) FILTER(WHERE o.eligible),0) AS booked_order_value_paise
  FROM scoped o GROUP BY o.day
 ), line_days AS (
  SELECT day,sum(quantity) AS units FROM costed WHERE eligible GROUP BY day
 ), daily AS (
  SELECT to_char(from_date+g,'YYYY-MM-DD') AS date,
   coalesce(o.orders,0) AS orders,coalesce(o.all_orders,0) AS all_orders,
   coalesce(o.gross_merchandise_paise,0) AS gross_merchandise_paise,coalesce(o.discounts_paise,0) AS discounts_paise,
   coalesce(o.reversals_paise,0) AS reversals_paise,coalesce(o.net_merchandise_paise,0) AS net_merchandise_paise,
   coalesce(o.booked_order_value_paise,0) AS booked_order_value_paise,coalesce(l.units,0) AS units
  FROM generate_series(0,to_date-from_date) g
   LEFT JOIN order_days o ON o.day=to_char(from_date+g,'YYYY-MM-DD')
   LEFT JOIN line_days l ON l.day=to_char(from_date+g,'YYYY-MM-DD')
 ), products AS (
  SELECT product_id,product_option_id,
   (array_agg(title ORDER BY created_at DESC,order_item_id DESC))[1] AS title,
   (array_agg(sku ORDER BY created_at DESC,order_item_id DESC))[1] AS sku,
   (array_agg(variant_label ORDER BY created_at DESC,order_item_id DESC))[1] AS variant_label,
   sum(quantity) AS units,count(DISTINCT order_id) AS orders,sum(line_total_paise) AS item_value_paise,
   coalesce(sum(quantity) FILTER(WHERE cost_status='known'),0) AS known_units,
   coalesce(sum(quantity) FILTER(WHERE comparable),0) AS comparable_units,
   round(100.0*coalesce(sum(quantity) FILTER(WHERE cost_status='known'),0)/nullif(sum(quantity),0),2) AS coverage_percent,
   coalesce(sum(taxable_paise) FILTER(WHERE comparable),0) AS comparable_revenue_paise,
   coalesce(sum(unit_cost_paise::numeric*quantity) FILTER(WHERE comparable),0) AS captured_cost_paise,
   sum(estimated_margin_paise) AS estimated_margin_paise
  FROM costed WHERE eligible
  GROUP BY product_id,product_option_id,
   CASE WHEN product_id IS NULL THEN title||':'||coalesce(sku,'') ELSE '' END
 ), sale_page AS (SELECT * FROM daily ORDER BY date LIMIT page_limit OFFSET page_offset),
 product_page AS (SELECT * FROM products ORDER BY item_value_paise DESC,title,product_id,product_option_id LIMIT page_limit OFFSET page_offset),
 order_page AS (
  SELECT order_item_id,order_id,order_number,created_at,status,payment_method,currency,eligible,
   product_id,product_option_id,title,sku,variant_label,quantity,unit_price_paise,line_total_paise,
   taxable_paise,order_discount_paise,order_total_paise,unit_cost_paise,cost_status,estimated_margin_paise
  FROM costed ORDER BY created_at DESC,order_id DESC,order_item_id DESC LIMIT page_limit OFFSET page_offset
 )
 SELECT jsonb_build_object(
  'available',true,'generated_at',clock_timestamp(),
  'summary',(SELECT to_jsonb(t)||jsonb_build_object('units',c.total_units) FROM totals t CROSS JOIN costs c),
  'costs',(SELECT to_jsonb(c)||jsonb_build_object(
    'coverage_percent',round(100.0*c.known_units/nullif(c.total_units,0),2),
    'margin_percent',round(100.0*c.estimated_margin_paise/nullif(c.comparable_revenue_paise,0),2)) FROM costs c),
  'daily',(SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY date),'[]'::jsonb) FROM daily d),
  'other_currency_orders',(SELECT count(*) FROM dated WHERE currency<>ccy),
  'table',jsonb_build_object('report',report,'limit',page_limit,'offset',page_offset,
    'total',CASE report WHEN 'sales' THEN (SELECT count(*) FROM daily) WHEN 'orders' THEN (SELECT count(*) FROM costed) ELSE (SELECT count(*) FROM products) END,
    'rows',CASE report WHEN 'sales' THEN (SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY date),'[]'::jsonb) FROM sale_page s)
     WHEN 'orders' THEN (SELECT coalesce(jsonb_agg(to_jsonb(o) ORDER BY created_at DESC,order_id DESC,order_item_id DESC),'[]'::jsonb) FROM order_page o)
     ELSE (SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY item_value_paise DESC,title,product_id,product_option_id),'[]'::jsonb) FROM product_page p) END)
 ) INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.commerce_analytics_read(uuid,text,date,date,text,text,text,integer,integer)
 FROM PUBLIC,lebrands_app,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.commerce_analytics_read(uuid,text,date,date,text,text,text,integer,integer) TO lebrands_app;

// Called only by the explicit operator command or synthetic tests.
export async function transitionAccountStores(tx,{apply=false,draft,keep,dates={}}={}) {
 const results=[];
 if(apply)await tx`SELECT s.store_id FROM public.stores s
  WHERE EXISTS(SELECT 1 FROM public.store_members m WHERE m.store_id=s.store_id AND m.role='owner')
  ORDER BY s.store_id FOR UPDATE`;
 if(draft||keep){
  if(!draft||!keep||draft===keep)throw new Error("Choose different draft and keep-live stores.");
  const [choice]=await tx`SELECT d.store_id AS draft_id,k.store_id AS keep_id,d.status AS draft_status,k.status AS keep_status
   FROM public.stores d JOIN public.stores k ON k.subdomain=${keep}
   WHERE d.subdomain=${draft} AND EXISTS(SELECT 1 FROM public.store_members dm
    JOIN public.store_members km ON km.user_id=dm.user_id
    WHERE dm.store_id=d.store_id AND km.store_id=k.store_id AND dm.role='owner' AND km.role='owner')`;
  if(!choice||choice.keep_status!=="live")throw new Error("The selected stores must share an owner and the retained store must already be live.");
  if(apply&&choice.draft_status!=="draft"){
   await tx`UPDATE public.stores SET status='draft' WHERE store_id=${choice.draft_id}`;
   await tx`INSERT INTO public.audit_log(store_id,actor_type,action,entity_type,entity_id,metadata)
    VALUES(${choice.draft_id},'platform_admin','account.store_transition','store',${choice.draft_id},
     jsonb_build_object('kept_live_store',${choice.keep_id}::text,'new_status','draft','source','approved_platform_transition'))`;
  }
  results.push({store:draft,result:apply?"draft":"would_become_draft",keep_live:keep});
 }
 const stores=await tx`SELECT s.store_id,s.subdomain,
  EXISTS(SELECT 1 FROM public.store_publications p WHERE p.store_id=s.store_id) AS published,
  EXISTS(SELECT 1 FROM public.billing_subscriptions b WHERE b.store_id=s.store_id AND
   (b.billing_interval='free' OR (b.billing_interval<>'free' AND b.mode='live' AND b.status IN ('active','grace','paused')))) AS preserve,
  (SELECT min(a.created_at)::text FROM public.audit_log a WHERE a.store_id=s.store_id AND a.action='store.published') AS first_evidence,
  s.status
  FROM public.stores s WHERE EXISTS(SELECT 1 FROM public.store_members m WHERE m.store_id=s.store_id AND m.role='owner')
  ORDER BY s.store_id`;
 for(const store of stores){
  const date=store.first_evidence||dates[store.subdomain]||null;
  if(!store.preserve&&!date&&(store.published||store.status==="live")){
   results.push({store:store.subdomain,result:"requires_original_publication_date"});continue;
  }
  if(apply){
   // Bind as text first: postgres.js otherwise serializes a parameter inferred
   // as timestamptz through Date, losing PostgreSQL fractional precision.
   const [row]=await tx`SELECT public.platform_transition_free(${store.store_id},${date}::text::timestamptz) AS result`;
   results.push({store:store.subdomain,result:row.result});
  }else results.push({store:store.subdomain,result:store.preserve?"existing_subscription_preserved":"would_assign_free",publication_evidence:date});
 }
 return results;
}

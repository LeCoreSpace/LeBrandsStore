import assert from "node:assert/strict";
export function pageIsolationChecks(fixtures, appTransaction, denied) {
  const a=fixtures.a.storeId,b=fixtures.b.storeId,token=fixtures.accountUsers[0].tokenHash;
  return [
    {name:"pages.own-read",reason:"Own draft/published page layouts are visible.",fn:()=>appTransaction(a,async tx=>{
      const rows=await tx`SELECT page_key FROM public.store_pages WHERE store_id=${a}`;
      assert.ok(rows.some(x=>x.page_key==="home"));
    })},
    ...["store_pages","store_page_versions"].map(table=>({
      name:`pages.cross-read.${table}`,reason:"Another store's layouts/history are invisible.",
      fn:()=>appTransaction(a,async tx=>assert.equal((await tx`SELECT * FROM public.${tx(table)} WHERE store_id=${b}`).length,0)),
    })),
    {name:"pages.published-write-denied",reason:"APP cannot directly overwrite published layouts; 42501.",
      fn:()=>denied(a,tx=>tx`UPDATE public.store_pages SET published_layout=draft_layout WHERE store_id=${a}`)},
    {name:"pages.history-write-denied",reason:"APP cannot erase version history; 42501.",
      fn:()=>denied(a,tx=>tx`DELETE FROM public.store_page_versions WHERE store_id=${a}`)},
    {name:"pages.cross-save-denied",reason:"Authenticated draft save cannot target another store; 42501.",
      fn:()=>denied(a,tx=>tx`SELECT * FROM public.save_store_page(${b},'home','[]'::jsonb,0,${token})`)},
    {name:"pages.invalid-layout",reason:"Invalid layout is rejected with 22023, not accepted.",
      fn:async()=>{
        try{await appTransaction(a,tx=>tx`SELECT * FROM public.save_store_page(${a},'home','[]'::jsonb,0,${token})`);}
        catch(error){assert.equal(error.code,"22023");return;}
        assert.fail("Invalid layout was accepted.");
      }},
  ];
}

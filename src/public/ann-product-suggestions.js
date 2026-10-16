// Candidate HS headings, not item-specific tax determinations. Exact material,
// construction and intended use can change classification. Merchants must
// confirm their applicable code and GST rate before creating catalogue items.
const MEN=[["Cotton knitted T-shirt","6109"],["Woven cotton shirt","6205"],["Men's woven trousers","6203"],["Knitted sweatshirt","6110"],["Knitted polo shirt","6105"]];
const WOMEN=[["Women's knitted T-shirt","6109"],["Women's woven blouse","6206"],["Women's woven trousers","6204"],["Knitted cardigan","6110"],["Woven dress","6204"]];
const SKIN=[["Cosmetic moisturiser","3304"],["Cosmetic face serum","3304"],["Cosmetic sunscreen","3304"],["Liquid skin-washing preparation","3401"],["Cosmetic lip preparation","3304"]];
const HOME=[["Candle","3406"],["Bed linen","6302"],["Non-porcelain ceramic tableware","6912"],["Cushion cover","6304"],["Wooden household article","4419"]];
export function productSuggestions(subcategory,attributes=[]) {
  const name=String(subcategory?.name||subcategory?.slug||"").toLowerCase();
  const rows=/men.?s clothing|^mens-clothing$/.test(name)&&!/women/.test(name)?MEN:/women.?s clothing|^womens-clothing$/.test(name)?WOMEN:/skincare|skin care/.test(name)?SKIN:/home decor|home décor/.test(name)?HOME:null;
  if(rows)return rows.map(([name,hsn_code])=>({name,hsn_code,hsn_note:"Suggested 4-digit heading only. Confirm the exact classification and GST rate for your product; this is not a verified tax code."}));
  return attributes.filter(a=>/^(product type|products|garment type|item type|type of product)$/i.test(a.name)).flatMap(a=>a.values||[]).slice(0,20).map(v=>({name:v.value,hsn_code:null,hsn_note:"Enter the HSN code confirmed for your product."}));
}

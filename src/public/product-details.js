// Pure shared projection. Live callers pass publication data, never live masters
// or draft rows. Labels and values are frozen when the product is published.
const list=value=>Array.isArray(value)?value:[];
const text=value=>typeof value==="string"?value.trim():"";
const key=value=>text(value).normalize("NFKC").toLowerCase();
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o||{},k);
const id=value=>Number.isSafeInteger(Number(value))&&Number(value)>0?Number(value):null;
const cleanRows=rows=>list(rows).slice(0,1000).filter(r=>text(r?.label)&&text(r?.value))
  // Up to 1,000 selected enum labels of 200 characters plus separators.
  // Text input is separately capped at 4,000 by the catalogue writer.
  .map(r=>({label:text(r.label).slice(0,200),value:text(r.value).slice(0,202000)}));

export function productDetailRows(product){
  if(own(product,"product_details"))return cleanRows(product.product_details);
  const selections=list(product?.classification?.descriptors);
  const references=list(product?.classification_reference?.descriptors);
  const rows=[];
  for(const selection of selections){
    const ref=references.find(r=>id(r.id)&&id(r.id)===id(selection.descriptor_id));
    if(!ref||!text(ref.name)||ref.name==="Saved detail")continue;
    let value="";
    if(["single_select","multi_select"].includes(ref.input_type)){
      value=list(selection.value_ids).map(selected=>list(ref.values).find(v=>id(v.id)&&id(v.id)===id(selected)))
        .map(v=>text(v?.value)).filter(v=>v&&v!=="Saved value").join(", ");
    }else if(ref.input_type==="text")value=text(selection.text_value);
    else if(ref.input_type==="number"&&typeof selection.number_value==="number"&&Number.isFinite(selection.number_value))
      value=`${selection.number_value}${text(ref.unit)?` ${text(ref.unit)}`:""}`;
    else if(ref.input_type==="boolean"&&typeof selection.boolean_value==="boolean")
      value=selection.boolean_value?"Yes":"No";
    if(value)rows.push({label:ref.name,value});
  }
  return cleanRows(rows);
}

// Real selected facts take precedence over same-label theme copy. Unrelated
// merchant-written features remain in their original order and are not rewritten.
export function productFeatureRows(product){
  const details=productDetailRows(product),names=new Set(details.map(r=>key(r.label)));
  return [...cleanRows(product?.content?.features).filter(r=>!names.has(key(r.label))),...details];
}

export function storefrontProduct(product,{detailsFrom=product}={}){
  const {classification,classification_reference,catalogue_revision,...publicProduct}=product;
  return {...publicProduct,product_details:productDetailRows(detailsFrom)};
}

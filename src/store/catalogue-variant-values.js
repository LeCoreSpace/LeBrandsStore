import {badInput} from "./input.js";
export async function addStoreVariantValue(tx,storeId,tokenHash,input) {
  if(!input||typeof input!=="object"||Array.isArray(input)||Object.keys(input).sort().join(",")!=="option_id,product_type_id,value"||
    !Number.isSafeInteger(input.product_type_id)||input.product_type_id<1||
    !Number.isSafeInteger(input.option_id)||input.option_id<1||typeof input.value!=="string")
    throw badInput("Select a product type and product option, then enter a value.");
  const value=input.value.trim().normalize("NFC");
  if(!value||[...value].length>200||/[\u0000-\u001f\u007f<>]/u.test(value))
    throw badInput("Enter a value of 1 to 200 characters without markup or control characters.");
  const [capability]=await tx`SELECT to_regprocedure('public.catalogue_add_variant_value(uuid,text,bigint,bigint,text)') IS NOT NULL AS enabled`;
  if(!capability?.enabled)throw Object.assign(new Error("Custom variant values are not available yet."),{status:409});
  try{
    const [row]=await tx`SELECT public.catalogue_add_variant_value(${storeId},${tokenHash},${input.product_type_id},${input.option_id},${value})::text AS result`;
    return JSON.parse(row.result);
  }catch(error){
    if(error.code==="22023")throw badInput("This value cannot be added. Check that the product type and option are available and that you have fewer than 500 custom values for this option.");
    if(error.code==="42501")throw Object.assign(new Error("You do not have permission to add values to this store."),{status:403});
    throw error;
  }
}

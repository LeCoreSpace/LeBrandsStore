import {INDIAN_STATES,commerceError} from "../public/commerce-rules.js";
const normal=value=>String(value||"").toLowerCase().replace(/[^a-z]/g,"");
const aliases={orissa:"odisha",pondicherry:"puducherry",uttaranchal:"uttarakhand",
  nctofdelhi:"delhi",andamanandnicobarislands:"andamanandnicobarislands"};
export async function pincodeLocation(code,fetcher=fetch){
  if(!/^[1-9]\d{5}$/.test(code||""))throw commerceError("Enter a valid six-digit PIN code.");
  let result;
  try{
    const response=await fetcher(`https://api.postalpincode.in/pincode/${code}`,{redirect:"manual",signal:AbortSignal.timeout(7000)});
    if(!response.ok)throw new Error();
    result=await response.json();
  }catch{throw commerceError("PIN lookup is unavailable. Enter your city and state manually.",undefined,503);}
  const offices=Array.isArray(result)?result[0]?.PostOffice:null;
  if(!Array.isArray(offices)||!offices.length)throw commerceError("PIN code not found. Check it or enter city and state manually.",undefined,404);
  const office=offices.find(o=>String(o.Pincode)===code&&o.BranchType==="Head Post Office")||
    offices.find(o=>String(o.Pincode)===code)||offices[0];
  const mapped=aliases[normal(office.State)]||normal(office.State);
  const state=INDIAN_STATES.find(s=>normal(s.name)===mapped);
  if(!state)throw commerceError("Choose your state manually for this PIN code.",undefined,422);
  const city=String(office.Name||office.District||"").trim();
  if(!city||city.length>100)throw commerceError("Enter your city manually.",undefined,422);
  return{pincode:code,city,state:state.code,state_name:state.name,
    localities:[...new Set(offices.map(o=>String(o.Name||"").slice(0,100)).filter(Boolean))].slice(0,30)};
}

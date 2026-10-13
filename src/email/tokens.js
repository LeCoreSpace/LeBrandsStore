import {randomToken} from "../auth/passwords.js";
export async function platformDeliveryKey(env,hash){
 if(!env.SESSION_SECRET||!/^[a-f0-9]{64}$/.test(hash))throw new Error("Email delivery key is unavailable");
 const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(env.SESSION_SECRET),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
 const bytes=new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(`email-delivery-v1:${hash}`)));
 return [...bytes].map(value=>value.toString(16).padStart(2,"0")).join("");
}
const encode=value=>btoa(value).replaceAll("+","-").replaceAll("/","_").replaceAll("=","");
const decode=value=>atob(value.replaceAll("-","+").replaceAll("_","/"));
async function signature(env,value){
  if(!env.SESSION_SECRET)throw new Error("Token signing is not configured.");
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(env.SESSION_SECRET),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(`email-v1:${value}`)));
}
export async function signedEmailToken(env,purpose,seconds,now=Date.now()){
  const value=encode(JSON.stringify({purpose,nonce:randomToken(),expires:Math.floor(now/1000)+seconds}));
  return `${value}.${encode(String.fromCharCode(...await signature(env,value)))}`;
}
export async function verifyEmailToken(env,token,purpose,now=Date.now()){
  try{
    if(typeof token!=="string"||token.length>600||!/^[a-z0-9_-]+\.[a-z0-9_-]+$/i.test(token))return false;
    const[value,mac]=token.split("."),actual=new Uint8Array([...decode(mac)].map(v=>v.charCodeAt(0))),expected=await signature(env,value);
    if(actual.length!==expected.length)return false;
    let mismatch=0;expected.forEach((v,i)=>mismatch|=v^actual[i]);if(mismatch)return false;
    const data=JSON.parse(decode(value));
    return data.purpose===purpose&&typeof data.nonce==="string"&&/^[a-f0-9]{64}$/.test(data.nonce)&&Number.isInteger(data.expires)&&data.expires>Math.floor(now/1000);
  }catch{return false;}
}

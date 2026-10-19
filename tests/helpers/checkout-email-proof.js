// Signed identity for isolated legacy checkout unit fixtures. Real challenge,
// delivery and verification paths are tested in checkout-email-auth.test.js.
export async function fixtureEmailProof(secret,store,email){
  const encoded=btoa(JSON.stringify({v:1,store,email:String(email).trim().toLowerCase(),
    exp:Math.floor(Date.now()/1000)+1800,nonce:crypto.randomUUID()}));
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const signature=new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(`checkout-proof:v1:${encoded}`)));
  return `${encoded}.${[...signature].map(v=>v.toString(16).padStart(2,"0")).join("")}`;
}

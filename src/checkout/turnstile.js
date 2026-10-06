import { commerceError } from "../public/commerce-rules.js";
export async function verifyTurnstile(request,env,body,fetcher = fetch) {
  if (!env.TURNSTILE_SECRET_KEY || !env.TURNSTILE_SITE_KEY) throw commerceError("Checkout security is not configured. Please contact this store.",undefined,503);
  if (typeof body.turnstile_token !== "string" || body.turnstile_token.length < 1 || body.turnstile_token.length > 2048) throw commerceError("Complete the security check before placing your order.",{turnstile_token:"Complete the security check."});
  let result;
  try {
    const response = await fetcher("https://challenges.cloudflare.com/turnstile/v0/siteverify",{
      method:"POST",headers:{"content-type":"application/json"},signal:AbortSignal.timeout(8000),
      body:JSON.stringify({secret:env.TURNSTILE_SECRET_KEY,response:body.turnstile_token,
        remoteip:request.headers.get("cf-connecting-ip") || undefined,idempotency_key:body.idempotency_key}),
    });
    if (!response.ok) throw new Error("Unsuccessful verification");
    result = await response.json();
  } catch { throw commerceError("The security check is temporarily unavailable. Please try again.",undefined,503); }
  if (!result.success || result.hostname !== new URL(request.url).hostname || result.action !== "checkout") throw commerceError("The security check expired or failed. Please try again.",{turnstile_token:"Complete a new security check."});
}

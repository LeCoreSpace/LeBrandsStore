import test from "node:test";
import assert from "node:assert/strict";
import {nativePreviewBindings,nativeAccountPath} from "../src/preview-node.js";
import {oauthAvailable} from "../src/connections/razorpay-oauth.js";

test("native preview forwards OAuth configuration without administrator, billing or unrelated secrets",()=>{
  const runtime={
    SUPABASE_APP_DB_URL:"synthetic-restricted-connection",PASSWORD_PEPPER:"synthetic-pepper",
    SESSION_SECRET:"synthetic-session-secret-only",GSTIN_KEY:"synthetic-gstin",
    REPLIT_DEV_DOMAIN:"example.replit.dev",RAZORPAY_OAUTH_MODE:"test",
    RAZORPAY_OAUTH_CLIENT_ID:"synthetic-application-id",RAZORPAY_OAUTH_CLIENT_SECRET:"synthetic-application-secret",
    RAZORPAY_OAUTH_REDIRECT_URI:"https://example.replit.dev/integrations/razorpay/callback",
    RAZORPAY_OAUTH_WEBHOOK_SECRET:"synthetic-test-signing-secret-only",
    SUPABASE_DB_URL:"must-not-forward",CLOUDFLARE_API_TOKEN:"must-not-forward",
    PLATFORM_ADMIN_PASSWORD:"must-not-forward",RAZORPAY_KEY_SECRET:"must-not-forward",
  };
  const env=nativePreviewBindings(runtime);
  assert.equal(env.PREVIEW_LIVE_DATABASE,"enabled");
  assert.equal(oauthAvailable(env),true);
  for(const key of ["RAZORPAY_OAUTH_CLIENT_ID","RAZORPAY_OAUTH_CLIENT_SECRET","RAZORPAY_OAUTH_MODE",
    "RAZORPAY_OAUTH_REDIRECT_URI","RAZORPAY_OAUTH_WEBHOOK_SECRET"])
    assert.equal(env[key],runtime[key],key);
  for(const key of ["SUPABASE_DB_URL","CLOUDFLARE_API_TOKEN","PLATFORM_ADMIN_PASSWORD","RAZORPAY_KEY_SECRET"])
    assert.equal(Object.hasOwn(env,key),false,key);
  assert.equal(oauthAvailable(nativePreviewBindings({})),false);
});
test("native adapter handles callback and OAuth actions on the same session/database path",()=>{
  for(const path of ["/integrations/razorpay/callback","/login","/verify-email","/reset-password","/invite",
    "/dashboard","/__database-status","/plans","/api/stores/example/razorpay/oauth/start"])
    assert.equal(nativeAccountPath(path),true,path);
  for(const path of ["/","/pricing","/blog","/integrations/razorpay/callback/other"])
    assert.equal(nativeAccountPath(path),false,path);
});

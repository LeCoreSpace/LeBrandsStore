import { audit } from "../dashboard/repository.js";
import { cloudflareAvailable, sealCredentials, verifyRazorpay, verifyShiprocket,
  domainHostname, provisionDomain, checkDomain, domainEvidence } from "../connections/providers.js";
import { runtimeAvailable } from "../connections/payments.js";
import { connection, shiprocketClient } from "../connections/runtime-client.js";
import { shippingSettings, pickupLocations } from "../connections/shipping.js";
import { domainPlatform } from "../connections/domain-platform.js";

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const plain = v => v !== null && typeof v === "object" && !Array.isArray(v);
const parse = v => typeof v === "string" ? JSON.parse(v) : v;
const defaults = { address: "included", payments: "cod", delivery: "manual" };
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
async function rows(tx, id) {
  const [schema] = await tx`SELECT to_regclass('public.store_launch_setup') IS NOT NULL AS ready`;
  if (!schema?.ready) fail("Store connections need the launch-setup migration. You can still use your included address, Cash on Delivery and manual shipping.", 503);
  const [saved] = await tx`SELECT preferences::text,domain_evidence::text,revision FROM public.store_launch_setup WHERE store_id=${id}`;
  const providers = await tx`SELECT provider,status,metadata::text FROM public.integrations WHERE store_id=${id}`;
  const [domain] = await tx`SELECT id,hostname,status,is_primary,cloudflare_hostname_id FROM public.domains
    WHERE store_id=${id} AND status<>'disabled' ORDER BY is_primary DESC,created_at DESC LIMIT 1`;
  return { saved, preferences: saved ? parse(saved.preferences) : { ...defaults }, evidence: saved ? parse(saved.domain_evidence) : {},
    revision: saved?.revision || 0, providers, domain };
}
export async function prepareAnnLaunch(tx, id, userId, env = {}) {
  const state = await rows(tx, id);
  const execution_available=await runtimeAvailable(tx);
  const [member] = await tx`SELECT role FROM public.store_members WHERE store_id=${id} AND user_id=${userId}`;
  const [store] = await tx`SELECT subdomain FROM public.stores WHERE store_id=${id}`;
  const providers = {};
  for (const provider of ["razorpay", "shiprocket"]) {
    const row = state.providers.find(r => r.provider === provider), meta = row ? parse(row.metadata) : {};
    providers[provider] = { verified: row?.status === "connected" && meta.credentials_verified === true,
      checked_at: meta.checked_at || null, runtime_ready: execution_available && row?.status==="connected" && meta.enabled===true &&
        meta.credentials_verified===true && (provider==="razorpay"?meta.mode==="live" && meta.webhook_verified===true:Boolean(meta.shipping)),
      ...(provider === "razorpay" ? { mode: meta.mode || null, webhook_verified: meta.webhook_verified===true,
        webhook_url:`https://app.lebrands.store/webhooks/razorpay/${id}` } : { pickup_count: meta.pickup_count || 0,
        shipping:meta.shipping||null,pickup_locations:meta.pickup_locations||[] }) };
  }
  const jobs=execution_available?await tx`SELECT j.id,o.order_number,j.kind,j.status,j.last_error,j.updated_at FROM public.commerce_jobs j
    JOIN public.orders o ON o.store_id=j.store_id AND o.id=j.order_id WHERE j.store_id=${id} ORDER BY j.updated_at DESC LIMIT 20`:[];
  return { revision: state.revision,execution_available,jobs, can_edit: member?.role === "owner", included_address: store?.subdomain ? `${store.subdomain}.lebrands.store` : null,
    preferences: state.preferences, providers, optional: true,
    domain: state.domain ? { id: state.domain.id, hostname: state.domain.hostname, status: state.domain.status,
      primary: state.domain.is_primary, ...state.evidence } : null,
    platform: { domains_available: cloudflareAvailable(env),
      domain_activation_available: cloudflareAvailable(env),
      diagnostics:state.evidence.platform_diagnostics||[{label:"Cloudflare credentials and zone configured",complete:cloudflareAvailable(env)}] } };
}
export async function saveAnnLaunch(tx, id, userId, env, body, fetcher = fetch) {
  const [member] = await tx`SELECT role FROM public.store_members WHERE store_id=${id} AND user_id=${userId}`;
  if (member?.role !== "owner") fail("Only the store owner can manage domain and provider connections.", 403);
  const fields = {
    choose: ["preferences"], "razorpay-connect": ["credentials"], "shiprocket-connect": ["credentials"],
    disconnect: ["provider"], "domain-add": ["hostname"], "domain-check": ["id"],
    "domain-activate": ["id", "provider_domain_confirmed"], "domain-remove": ["id"],
    activate:["provider","enabled","provider_domain_confirmed"],"shipping-settings":["shipping"],
    "retry-job":["id","provider_absence_confirmed"],"refresh-provider":["provider"],
  };
  if (!plain(body) || !Object.hasOwn(fields, body.action) || body.confirm !== true ||
      !Number.isSafeInteger(body.expected_revision) || body.expected_revision < 0 ||
      Object.keys(body).some(k => !["action", "confirm", "expected_revision", ...fields[body.action]].includes(k)))
    fail("Use the connection form and confirm this change.");
  const current = await rows(tx, id);
  if (current.revision !== body.expected_revision) fail("Connections changed in another window. Reload their status, review your choice and try again.", 409);
  if (current.revision >= 2147483646) fail("Connection history needs platform assistance.", 409);
  let preferences = { ...current.preferences }, evidence = { ...current.evidence };
  if (["activate","shipping-settings","retry-job","refresh-provider"].includes(body.action)) {
    if (!await runtimeAvailable(tx)) fail("Apply the commerce-runtime migration before activating these connections.",503);
    if (body.action==="retry-job") {
      if (!UUID.test(body.id||"") || (body.provider_absence_confirmed!==undefined && typeof body.provider_absence_confirmed!=="boolean")) fail("Choose a job to retry.");
      const [j]=await tx`SELECT payload::text,status FROM public.commerce_jobs WHERE store_id=${id} AND id=${body.id} FOR UPDATE`;
      if (!j || !["attention","waiting"].includes(j.status)) fail("This job cannot be retried right now.",409);
      const payload=JSON.parse(j.payload);
      if (body.provider_absence_confirmed===true) {
        for (const flag of ["refund_attempted","create_attempted","awb_attempted","pickup_attempted"]) delete payload[flag];
      }
      await tx`UPDATE public.commerce_jobs SET status='waiting',attempts=0,lease_until=NULL,last_error=NULL,next_attempt_at=now(),updated_at=now(),
        payload=${JSON.stringify(payload)}::text::jsonb WHERE store_id=${id} AND id=${body.id}`;
    } else {
      const provider=body.action==="shipping-settings"?"shiprocket":body.provider;
      if (!["razorpay","shiprocket"].includes(provider)) fail("Choose a supported provider.");
      const c=await connection(tx,id,provider,env),meta={...c.metadata};
      if (body.action==="shipping-settings" || body.action==="refresh-provider") {
        if (provider!=="shiprocket") fail("Use the payment webhook status to verify Razorpay.");
        const locations=await pickupLocations(shiprocketClient(c.credentials,fetcher));
        meta.pickup_locations=locations;meta.pickup_count=locations.length;
        if (body.action==="shipping-settings") {
          const s=shippingSettings(body.shipping);
          if (!locations.some(p=>p.name===s.pickup_location && p.pincode===s.pickup_pincode)) fail("Choose an existing, verified Shiprocket pickup address.");
          meta.shipping=s;
        }
      } else {
        if (typeof body.enabled!=="boolean" || (body.enabled && body.provider_domain_confirmed!==true)) fail("Confirm provider approval and any automatic booking charges.");
        if (body.enabled && (meta.credentials_verified!==true || (provider==="razorpay" &&
          (meta.mode!=="live" || meta.webhook_verified!==true)))) fail("Use live credentials and verify the signed Razorpay webhook before enabling payments.",409);
        if (body.enabled && provider==="shiprocket") {
          const s=shippingSettings(meta.shipping);
          const locations=await pickupLocations(shiprocketClient(c.credentials,fetcher));
          if (!locations.some(p=>p.name===s.pickup_location && p.pincode===s.pickup_pincode)) fail("The selected pickup address is no longer available.");
        }
        meta.enabled=body.enabled;meta.activated_at=body.enabled?new Date().toISOString():null;
        const key=provider==="razorpay"?"payments":"delivery";
        if(preferences[key]!=="both")preferences[key]=body.enabled?provider:(provider==="razorpay"?"cod":"manual");
      }
      await tx`UPDATE public.integrations SET metadata=${JSON.stringify(meta)}::text::jsonb,updated_at=now() WHERE store_id=${id} AND provider=${provider}`;
    }
  }
  if (body.action === "choose") {
    const p = body.preferences;
    if (!plain(p) || Object.keys(p).length !== 3 || !["included", "custom"].includes(p.address) ||
        !["cod", "razorpay", "both"].includes(p.payments) || !["manual", "shiprocket", "both"].includes(p.delivery) ||
        Object.keys(p).some(k => !Object.hasOwn(defaults, k))) fail("Choose a store address, payment preference and delivery preference.");
    if (p.address === "custom" && current.domain?.status !== "active") fail("Activate a verified custom domain first, or keep your included address.");
    // Intention can be saved before connecting. Activation still requires verified
    // live credentials, payment webhooks or shipping settings and explicit consent.
    preferences = { ...p };
    if (current.domain?.status === "active") {
      await tx`UPDATE public.domains SET is_primary=${p.address === "custom"} WHERE store_id=${id} AND id=${current.domain.id}`;
    }
  } else if (body.action.endsWith("-connect")) {
    const provider = body.action === "razorpay-connect" ? "razorpay" : "shiprocket";
    const allowed = provider === "razorpay" ? ["key_id", "key_secret", "webhook_secret"] : ["email", "password"];
    if (!plain(body.credentials) || Object.keys(body.credentials).length !== allowed.length ||
      Object.keys(body.credentials).some(k => !allowed.includes(k))) fail("Use the provider's secure credential fields.");
    // Check storage availability before sending credentials to a provider.
    await sealCredentials(env.INTEGRATION_ENCRYPTION_KEY || env.SESSION_SECRET, id, provider, {});
    const verified = await (provider === "razorpay" ? verifyRazorpay(body.credentials, fetcher) : verifyShiprocket(body.credentials, fetcher));
    const ciphertext = await sealCredentials(env.INTEGRATION_ENCRYPTION_KEY || env.SESSION_SECRET, id, provider, verified.credentials);
    await tx`INSERT INTO public.integrations(store_id,provider,status,credentials_ciphertext,metadata)
      VALUES(${id},${provider},'connected',${ciphertext},${JSON.stringify(verified.metadata)}::text::jsonb)
      ON CONFLICT(store_id,provider) DO UPDATE SET status='connected',credentials_ciphertext=EXCLUDED.credentials_ciphertext,metadata=EXCLUDED.metadata,updated_at=now()`;
  } else if (body.action === "disconnect") {
    if (!["razorpay", "shiprocket"].includes(body.provider)) fail("Choose a supported provider.");
    await tx`UPDATE public.integrations SET status='disconnected',credentials_ciphertext='',metadata='{}'::jsonb,updated_at=now()
      WHERE store_id=${id} AND provider=${body.provider}`;
    if (body.provider === "razorpay") preferences.payments = "cod"; else preferences.delivery = "manual";
  } else if (body.action === "domain-add") {
    const hostname = domainHostname(body.hostname);
    if (current.domain) fail("Check or remove the existing domain before adding another.", 409);
    if (!cloudflareAvailable(env)) fail("Custom-domain provisioning needs platform configuration. Keep your included address for now.", 503);
    const [reserved] = await tx`INSERT INTO public.domains(store_id,hostname,status) VALUES(${id},${hostname},'pending')
      ON CONFLICT(hostname) DO UPDATE SET status='pending'
      WHERE public.domains.store_id=${id} AND public.domains.status='disabled' RETURNING id,cloudflare_hostname_id`;
    if (!reserved) fail("That domain cannot be connected to this store.", 409);
    // A locally removed hostname remains in Cloudflare. Reuse only the ID
    // already owned by this store, never adopt another account's hostname.
    const result = reserved.cloudflare_hostname_id
      ? await checkDomain(env, reserved.cloudflare_hostname_id, hostname, fetcher)
      : await provisionDomain(env, hostname, fetcher);
    if (result.hostname !== hostname) fail("Cloudflare did not return the requested hostname.", 502);
    await tx`UPDATE public.domains SET cloudflare_hostname_id=${result.id} WHERE store_id=${id} AND id=${reserved.id}`;
    evidence = domainEvidence(result, env);
  } else if (body.action.startsWith("domain-")) {
    const domain = current.domain;
    if (typeof body.id !== "string" || !UUID.test(body.id) || !domain || domain.id !== body.id) fail("This domain does not belong to this store.", 404);
    if (body.action === "domain-remove") {
      await tx`UPDATE public.domains SET status='disabled',is_primary=false WHERE store_id=${id} AND id=${domain.id}`;
      preferences.address = "included"; evidence = {};
    } else {
      // Always recheck provider and DNS on activation. Never trust browser statuses.
      const result = await checkDomain(env, domain.cloudflare_hostname_id, domain.hostname, fetcher);
      evidence = domainEvidence(result, env);
      const platform=await domainPlatform(env,fetcher);
      evidence.platform_diagnostics=platform.diagnostics;
      if (body.action === "domain-check" && domain.status === "active" &&
          (evidence.hostname_status !== "active" || evidence.ssl_status !== "active" || !evidence.cname_verified)) {
        await tx`UPDATE public.domains SET status='failed',is_primary=false WHERE store_id=${id} AND id=${domain.id}`;
        preferences.address = "included";
      }
      if (body.action === "domain-activate") {
        if (!platform.ready) fail("Domain routing still needs platform configuration. Your included address stays active.", 503);
        if (evidence.hostname_status !== "active" || evidence.ssl_status !== "active" || !evidence.cname_verified)
          fail("DNS ownership, CNAME routing and SSL must all be verified before activation.");
        if (current.providers.some(p => p.provider === "razorpay" && p.status === "connected") && body.provider_domain_confirmed !== true)
          fail("Confirm that this domain is approved in your Razorpay account before activating it.");
        await tx`UPDATE public.domains SET status='active',is_primary=true WHERE store_id=${id} AND id=${domain.id}`;
        preferences.address = "custom";
      }
    }
  }
  await tx`INSERT INTO public.store_launch_setup(store_id,preferences,domain_evidence,revision)
    VALUES(${id},${JSON.stringify(preferences)}::text::jsonb,${JSON.stringify(evidence)}::text::jsonb,${current.revision + 1})
    ON CONFLICT(store_id) DO UPDATE SET preferences=EXCLUDED.preferences,domain_evidence=EXCLUDED.domain_evidence,
      revision=EXCLUDED.revision,updated_at=now()`;
  await audit(tx, id, userId, "ann.connection_setup", "store", id, { action: body.action });
  return prepareAnnLaunch(tx, id, userId, env);
}

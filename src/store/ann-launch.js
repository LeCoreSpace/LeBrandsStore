import { audit } from "../dashboard/repository.js";
import { cloudflareAvailable, sealCredentials, verifyRazorpay, verifyShiprocket,
  domainHostname, provisionDomain, checkDomain, domainEvidence } from "../connections/providers.js";

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
  const [member] = await tx`SELECT role FROM public.store_members WHERE store_id=${id} AND user_id=${userId}`;
  const [store] = await tx`SELECT subdomain FROM public.stores WHERE store_id=${id}`;
  const providers = {};
  for (const provider of ["razorpay", "shiprocket"]) {
    const row = state.providers.find(r => r.provider === provider), meta = row ? parse(row.metadata) : {};
    providers[provider] = { verified: row?.status === "connected" && meta.credentials_verified === true,
      checked_at: meta.checked_at || null, runtime_ready: false,
      ...(provider === "razorpay" ? { mode: meta.mode || null, webhook_verified: false } : { pickup_count: meta.pickup_count || 0 }) };
  }
  return { revision: state.revision, can_edit: member?.role === "owner", included_address: store?.subdomain ? `${store.subdomain}.lebrands.store` : null,
    preferences: state.preferences, providers, optional: true,
    domain: state.domain ? { id: state.domain.id, hostname: state.domain.hostname, status: state.domain.status,
      primary: state.domain.is_primary, ...state.evidence } : null,
    platform: { domains_available: cloudflareAvailable(env),
      domain_activation_available: cloudflareAvailable(env) && env.CUSTOM_DOMAINS_ROUTING_READY === "true" } };
}
export async function saveAnnLaunch(tx, id, userId, env, body, fetcher = fetch) {
  const [member] = await tx`SELECT role FROM public.store_members WHERE store_id=${id} AND user_id=${userId}`;
  if (member?.role !== "owner") fail("Only the store owner can manage domain and provider connections.", 403);
  const fields = {
    choose: ["preferences"], "razorpay-connect": ["credentials"], "shiprocket-connect": ["credentials"],
    disconnect: ["provider"], "domain-add": ["hostname"], "domain-check": ["id"],
    "domain-activate": ["id", "provider_domain_confirmed"], "domain-remove": ["id"],
  };
  if (!plain(body) || !Object.hasOwn(fields, body.action) || body.confirm !== true ||
      !Number.isSafeInteger(body.expected_revision) || body.expected_revision < 0 ||
      Object.keys(body).some(k => !["action", "confirm", "expected_revision", ...fields[body.action]].includes(k)))
    fail("Use the connection form and confirm this change.");
  const current = await rows(tx, id);
  if (current.revision !== body.expected_revision) fail("Connections changed in another window. Reload their status, review your choice and try again.", 409);
  if (current.revision >= 2147483646) fail("Connection history needs platform assistance.", 409);
  let preferences = { ...current.preferences }, evidence = { ...current.evidence };
  if (body.action === "choose") {
    const p = body.preferences;
    if (!plain(p) || Object.keys(p).length !== 3 || !["included", "custom"].includes(p.address) ||
        !["cod", "razorpay"].includes(p.payments) || !["manual", "shiprocket"].includes(p.delivery) ||
        Object.keys(p).some(k => !Object.hasOwn(defaults, k))) fail("Choose a store address, payment preference and delivery preference.");
    if (p.address === "custom" && current.domain?.status !== "active") fail("Activate a verified custom domain first, or keep your included address.");
    for (const [key, provider] of [["payments", "razorpay"], ["delivery", "shiprocket"]]) {
      if (p[key] === provider && !current.providers.some(r => r.provider === provider && r.status === "connected" && parse(r.metadata).credentials_verified === true))
        fail(`Verify your ${provider === "razorpay" ? "Razorpay" : "Shiprocket"} account first, or keep the available option.`);
    }
    // Preferences are intentions, not activation of unsupported checkout/carrier code.
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
  } else {
    const domain = current.domain;
    if (typeof body.id !== "string" || !UUID.test(body.id) || !domain || domain.id !== body.id) fail("This domain does not belong to this store.", 404);
    if (body.action === "domain-remove") {
      await tx`UPDATE public.domains SET status='disabled',is_primary=false WHERE store_id=${id} AND id=${domain.id}`;
      preferences.address = "included"; evidence = {};
    } else {
      // Always recheck provider and DNS on activation. Never trust browser statuses.
      const result = await checkDomain(env, domain.cloudflare_hostname_id, domain.hostname, fetcher);
      evidence = domainEvidence(result, env);
      if (body.action === "domain-check" && domain.status === "active" &&
          (evidence.hostname_status !== "active" || evidence.ssl_status !== "active" || !evidence.cname_verified)) {
        await tx`UPDATE public.domains SET status='failed',is_primary=false WHERE store_id=${id} AND id=${domain.id}`;
        preferences.address = "included";
      }
      if (body.action === "domain-activate") {
        if (env.CUSTOM_DOMAINS_ROUTING_READY !== "true") fail("Domain routing still needs platform configuration. Your included address stays active.", 503);
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

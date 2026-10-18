import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {PRICING_PLANS} from "../src/public/pricing-plans.js";
import {SECTION_SCHEMAS} from "../src/public/sections/index.js";

const config=JSON.parse(readFileSync(
  new URL("../docs/subscription-commercial.proposed.json",import.meta.url),"utf8"));
const plan=code=>config.plans.find(p=>p.code===code);

test("commercial planning confirmation never enables live offers or billing",()=>{
  assert.equal(config.approval_status,"confirmed_for_implementation_planning");
  assert.equal(config.phase_1_status,"baseline_finalised_with_open_items");
  assert.equal(config.live_offer_authorised,false);
  assert.equal(config.billing_enabled,false);
  assert.equal(config.live_charges_enabled,false);
  assert(config.paid_launch_blockers.includes("explicit_live_offer_and_payment_activation_approval"));
  assert.equal(config.tax.review_required_before_charging,true);
  assert.equal(config.tax.rate_basis_points,null);
});

test("India prices match the public proposal and use integer minor units",()=>{
  assert.equal(config.launch_market.country_code,"IN");
  assert.equal(config.launch_market.currency,"INR");
  assert.equal(config.launch_market.additional_markets_enabled,false);
  assert.equal(config.launch_market.automatic_fx_conversion,false);
  assert.equal(new Set(config.plans.map(p=>p.code)).size,5);
  for(const code of ["launch","grow","scale"]){
    const p=plan(code),advertised=PRICING_PLANS.find(p=>p.name.toLowerCase()===code);
    assert.equal(p.monthly_amount_minor,advertised.monthlyFee*100);
    assert.equal(p.annual_amount_minor,advertised.annualFee*100);
    assert.equal(p.annual_amount_minor,p.monthly_amount_minor*10);
    for(const key of ["monthly_amount_minor","annual_amount_minor","published_products",
      "published_skus","additional_staff_seats","public_media_bytes"]){
      assert(Number.isSafeInteger(p[key]),`${code}: ${key} must be an integer`);
      assert(p[key]>0,`${code}: ${key} must be positive`);
    }
  }
  assert.equal(plan("flagship").price_kind,"accepted_quote_required");
  assert.equal(plan("flagship").self_service_amount_minor,null);
  assert.equal(plan("flagship").checkout_enabled,false);
});

test("Free preserves its approved catalogue allowance and publication-based clock",()=>{
  const free=plan("free");
  assert.equal(free.monthly_amount_minor,0);
  assert.equal(free.published_products,100);
  assert.equal(free.published_skus,1000);
  assert.equal(free.live_days,30);
  assert.equal(free.timer_starts,"first_successful_publication");
  assert.equal(free.payment_mandate_required,false);
  assert.equal(free.custom_domain,false);
  assert(plan("launch").published_skus>=free.published_skus);
  assert.equal(config.common_rules.variant_option_types_per_product,3);
  assert.equal(config.common_rules.variants_per_product,200);
  assert.equal(config.common_rules.order_band_blocks_checkout,false);
  assert.equal(config.common_rules.upgrades_reset_ai_allowance,false);
});

test("all plans include store features while Space placement is paid-only",()=>{
  const required=["ann_and_theme_editor",
    "branded_customisable_checkout","per_page_seo_metadata","transactional_emails",
    "payment_partner_integration","delivery_partner_integration",
    "conversion_section_library","data_export"];
  const catalog=new Map(config.feature_catalog.map(f=>[f.key,f]));
  assert.equal(catalog.size,config.feature_catalog.length,"Feature keys must be unique");
  for(const p of config.plans){
    const included=config.feature_sets[p.core_feature_set];
    assert(Array.isArray(included),`${p.code} needs an explicit feature-set mapping`);
    for(const key of required)assert(included.includes(key),`${p.code} missing ${key}`);
    assert.equal(included.includes("lebrands_space_placement"),p.code!=="free",
      `${p.code}: Space placement must be paid-only`);
    for(const key of included){
      assert(catalog.has(key),`Undefined feature ${key}`);
      assert(catalog.get(key).implementation_readiness,`${key} needs a readiness status`);
    }
  }
  for(const type of catalog.get("conversion_section_library").native_section_types)
    assert(SECTION_SCHEMAS[type],`Unregistered native section ${type}`);
  assert.equal(catalog.get("per_page_seo_metadata").preserve_private_and_commerce_page_noindex,true);
  assert.equal(catalog.get("data_export").downloadable_media_archive_available,false);
  assert.equal(config.common_rules.add_further_sellable_features_only_after_implementation,true);
});

test("Free has no Space placement while the provider decision stays unresolved",()=>{
  assert.equal(plan("free").lebrands_space_package,"none");
  assert.equal(config.feature_catalog.find(f=>f.key==="lebrands_space_placement").free_package,"none");
  assert.equal(plan("launch").lebrands_space_package,"starter");
  assert.equal(plan("grow").lebrands_space_package,"premium");
  assert.equal(plan("scale").lebrands_space_package,"freedom");
  assert.equal(config.provider.user_requested,"razorpay");
  assert.equal(config.provider.approved,null);
  assert.equal(config.provider.account_eligibility_verified,false);
  assert.equal(config.provider.existing_merchant_checkout_unchanged,true);
  assert(!config.open_items.includes("free_lebrands_space_package"));
  assert(config.open_items.includes("platform_subscription_provider_setup"));
});

test("initial paid billing is test-only planning with manual renewal and secret references only",()=>{
  const lifecycle=config.proposed_lifecycle;
  assert.equal(lifecycle.collection_mode,"one_time_payment_manual_renewal");
  assert.equal(lifecycle.automatic_renewal_enabled,false);
  assert.equal(lifecycle.recurring_payments_enabled,false);
  assert.equal(lifecycle.recurring_payments_scope,"deferred");
  assert.equal(lifecycle.payment_mandate_required,false);
  assert.equal(lifecycle.renewal,"owner_initiated_checkout_after_explicit_amount_confirmation");
  assert.equal(config.provider.requested_initial_mode,"test");
  assert.deepEqual(config.provider.test_credential_secret_references,{
    key_id:"RAZORPAY_KEY_ID",key_secret:"RAZORPAY_KEY_SECRET"
  });
  assert.equal(config.provider.credential_validity_verified,false);
  assert.equal(config.provider.platform_checkout_implemented,false);
  assert.equal(config.provider.recurring_support_required_for_initial_release,false);
  assert.equal(config.billing_enabled,false);
  assert.equal(config.live_charges_enabled,false);
});

test("Free enrolment and legacy transition cannot approve business evidence or delete data",()=>{
  assert.equal(config.common_rules.explicit_free_activation_required,true);
  assert.equal(config.common_rules.plan_modal_position,"ann_after_store_name_confirmation");
  assert.equal(config.common_rules.subscription_does_not_override_business_restrictions,true);
  assert.equal(config.common_rules.paid_upgrade_requires_business_approval,true);
  assert.equal(config.proposed_lifecycle.automatic_deletion_authorised,false);
  assert.equal(config.proposed_legacy_transition.rewrite_historical_publication_dates,false);
  assert.equal(config.proposed_legacy_transition.automatic_business_approval,false);
  assert.equal(config.proposed_legacy_transition.concession_repeatable,false);
});

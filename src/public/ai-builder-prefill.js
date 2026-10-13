// Build editable defaults from the current tenant's draft, never account identity.
export const blankProduct = () => ({ name: "", description: "", price: "", compare: "", gst_rate: "", hsn: "", stock: "", photo_ids: [], material: "", variants: "", care: "", features: "", how_to_use: "", sizes: "", ai_images: 0, image_styles: [] });
const plain = (value) => String(value ?? "").replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
  .replace(/<\/(?:p|li|div)>|<br\s*\/?>/gi, "\n").replace(/<[^>]*>/g, "")
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/[<>]/g, "").trim();
const money = (value) => value == null ? "" : String(Number(value) / 100);
const real = (m) => m?.id && !m.ai_generated && !m.source_media_id && !["pending", "discarded"].includes(m.approval_status);
export function existingProductBrief(p, media = []) {
  const c = p.content || {}, ids = new Set(media.filter(m => real(m) && m.type === "image").map(m => m.id));
  return { ...blankProduct(), id: p.id, locked: true, name: p.title || p.name || "",
    description: plain(p.description || c.description_features),
    price: money(p.price_paise), compare: money(p.compare_at_paise), gst_rate: p.gst_rate ?? "",
    hsn: p.hsn_code || p.hsn || "", stock: p.stock ?? "",
    photo_ids: (p.images || []).map(m => m.id || m.media_id).filter(id => ids.has(id)).slice(0, 5),
    features: Array.isArray(c.features) ? c.features.map(f => plain([f.label, f.value].filter(Boolean).join(": "))).join("\n") : "",
    care: plain(c.materials_care), sizes: Array.isArray(c.size_guide) ? c.size_guide.map(s => `${s.size}: ${s.measurement}`).join("\n") : "",
    how_to_use: Array.isArray(c.how_to_use) ? c.how_to_use.map(s => plain([s.title, s.text].filter(Boolean).join(": "))).join("\n") : "",
  };
}
export function prefillBrief(draft = {}, saved = null) {
  const s = draft.settings || {}, media = draft.media || [];
  const defaults = {
    brand: { name: s.brand_name || draft.store?.name || "", tagline: s.tagline || "", category: s.category || "",
      subcategory: "", sells: plain(s.description), audience: "", differentiators: "", founder_story: "", year_started: "",
      city: s.business_city || "", vibe: "", reference_words: "", colours: /^#[0-9a-f]{6}$/i.test(s.accent_color || "") ? s.accent_color : "",
      logo_id: media.some(m => real(m) && m.type === "logo" && m.id === s.logo_media_id) ? s.logo_media_id : "", language: "English" },
    selling: { delivery_time: "", free_shipping_threshold: "", cod: false, returns_window: "", returns_conditions: "",
      contact_email: s.support_email || "", phone: s.support_phone || "", whatsapp: "", address: s.address || "",
      first_order_offer: "", prepaid_discount: "" },
    products: (draft.products || []).filter(p => p?.id && p.status !== "archived" && !p.archived_at).slice(0, 5).map(p => existingProductBrief(p, media)),
    confirmed: false, _prefill_touched: saved?._prefill_touched || [],
  };
  if (!defaults.products.length) defaults.products = [blankProduct()];
  for (const [group, prefix] of [["brand", "b"], ["selling", "s"]]) {
    for (const [key, value] of Object.entries(saved?.[group] || {})) {
      if (value !== "" && value != null || defaults._prefill_touched.includes(`${prefix}.${key}`)) defaults[group][key] = value;
    }
  }
  // A merchant-selected product list, including an intentionally emptied list,
  // must not be repopulated on reload.
  if (Array.isArray(saved?.products) && (saved.products.some(p => p.id || Object.entries(p).some(([k, v]) =>
    !["ai_images", "image_styles", "photo_ids", "locked"].includes(k) && v !== "" && v != null)) ||
    defaults._prefill_touched.includes("products"))) {
    defaults.products = saved.products.map(p => {
      const original = (draft.products || []).find(item => item.id === p.id);
      return { ...blankProduct(), ...(original ? existingProductBrief(original, media) : {}), ...p };
    });
  }
  defaults.confirmed = saved?.confirmed === true;
  return defaults;
}

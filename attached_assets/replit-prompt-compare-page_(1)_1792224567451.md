# Replit prompt — LeBrands.Store "Compare & Choose" page

Paste everything below the line into Replit Agent inside the `lebrands-store` project.

---

## Goal

Build a new page at `/compare` on the lebrands.store marketing site. Title: **"Which store platform is right for you?"**

The page helps an Indian D2C founder choose an online store platform, even when the answer is not LeBrands.Store. It does three jobs:

1. **Guide**: a short quiz asks about their stage, traffic, budget preference and needs, then recommends the best-fit platforms with plain reasons.
2. **Calculate**: a cost calculator shows what each platform would cost them per month at their sales level.
3. **Compare**: a filterable comparison table and platform cards show prices, fees and features side by side.

The tone is honest and neutral, like a buying guide. Trust is the selling point: when another platform genuinely fits better, the page says so. LeBrands.Store wins on its real strengths — 0% commission, brand-owned customer data and accounts, and India-first COD/RTO tools — not by talking others down.

## Tech and design

- Use the project's existing stack, routing, components, fonts, colours and Light/Dark toggle. Match the current header (Features, Pricing, FAQ, Log in, "Open your store") and footer.
- The marketing site may use rich motion and React components. Keep it mobile-first: everything must work at 360px width with no horizontal page scroll. Tables become stacked cards on mobile.
- Keep **all platform data in one file**, `src/data/platforms.ts` (or `.json`), so prices can be updated without touching components. Every price carries a `sourceUrl` and a `checkedOn` date.
- No competitor logos or brand artwork. Show competitor names as plain text only.
- Add the page to the header nav as "Compare" and link to it from the Pricing page ("Not sure? Compare platforms").
- SEO: title "Compare Shopify, ShopDeck, Dukaan & more | LeBrands.Store"; a meta description; FAQPage schema for the FAQ section; server-rendered or pre-rendered content so the table is crawlable.

## Page sections, in order

### 1. Hero
- H1: "Which store platform is right for you?"
- Subline: "Compare 12 platforms Indian brands use: what they cost at your sales level, what they include, and who they suit. We'll tell you when someone else fits better."
- Three proof chips under the subline: "Build with Ann, in Hindi or English" · "0% commission" · "Free LeBrands.Space mall placement with paid plans".
- Two buttons: "Take the 2-minute quiz" (scrolls to the quiz) and "Jump to the comparison".
- A small line: "Prices checked 17 Oct 2026 from each platform's own site. Always confirm before you sign up."

### 2. "Three ways to run an online store" explainer
Three cards, so founders understand the business models before comparing names:

| Model | How you pay | Who runs growth | Examples |
|---|---|---|---|
| **Revenue share (done for you)** | Nothing upfront; a % of every delivered order | The platform's team runs ads, pricing and RTO | ShopDeck |
| **Per-order fee (DIY)** | Low or zero monthly fee plus a % or fee on each order | You | Dukaan, Instamojo, Shopify (on online payments), Fynd |
| **Flat fee, 0% commission (DIY)** | A fixed monthly plan; nothing on your sales | You | LeBrands.Store, Zoho Commerce, Wix, BigCommerce |

One line under each card on who it suits:
- Revenue share: "No traffic yet and want experts to run ads? You pay more as you grow."
- Per-order fee: "Testing an idea on a tiny budget. Fees add up past a few hundred orders."
- Flat fee: "Already selling, or have your own audience. Every rupee of growth stays yours."

### 2b. Key differences (the five platforms founders compare most)
A focused table directly under the explainer, before the quiz. Columns: **LeBrands.Store** (pinned, lightly highlighted) · Shopify · Zoho Commerce · ShopDeck · Dukaan. On mobile, show one platform per swipeable card with the same rows, LeBrands.Store first. Keep these rows as data in `src/data/keyDifferences.ts` so they can be edited without touching components; each competitor cell carries the `sourceUrl` of its platform.

| Row | LeBrands.Store | Shopify | Zoho Commerce | ShopDeck | Dukaan |
|---|---|---|---|---|---|
| How easy to build | Ann guides one flow, from GST check to store address, style, products and review, with a live desktop and mobile preview | AI store from a prompt, then theme setup; many brands hire help to finish | Drag-and-drop builder, done yourself | ShopDeck's team sets it up in month 1 | Basic store in minutes from a phone |
| Language while building | `ANN_LANGUAGES` joined, e.g. "English, हिन्दी" | English admin | English | Their team helps you | Hindi support |
| GST verification | Built into Ann's first step; legal name and address auto-filled | Manual | Manual | During setup by their team | Manual |
| Hiring needed | No | Often, in practice | No | No | No |
| Theme options | 4 themes: Editorial, Modern Boutique, Bold Architectural, Minimal | Free and paid themes in the Theme Store | Ready templates | Multiple customisable themes (their claim) | 7 free; 14+ on Growth |
| Customisation | Click any text or photo to edit in place; add, remove and reorder sections; menus; full theme editor | Very high: theme editor, code, thousands of apps | Moderate: drag-and-drop | Their claim: endless customisation | Theme editor on Growth and above |
| Payment, delivery, domain | Your own Razorpay, courier and custom domain, connected from the dashboard any time | Own gateway; 2% fee on online payments; couriers through apps | Own gateway and shipping | Run through ShopDeck | Dukaan Pay or your Razorpay; Dukaan Delivery or your own |
| Discovery and traffic | **Free LeBrands.Space mall placement** with every paid plan | Shop app; AI chats (ChatGPT selling is for US buyers) | None built in | Managed paid ads (you pay the ad spend) | None built in |
| Commission on sales | 0% | 2% / 1% / 0.6% on online payments; 0% on COD | 0% | 3% + GST on delivered orders | 4.99%–0.99% per order, capped ₹200, COD included |
| Monthly cost at ₹2 lakh sales | Pulled live from the calculator at ₹2,00,000 | same | same | same | same |
| Paid extras | Common app features built into every plan | Paid apps and premium themes | Books, Inventory, CRM sold separately | Ad spend on top | More plugins on higher plans |
| COD and RTO tools | "Coming soon" tag until live: COD return reasons, RTO tracking | COD yes; RTO through apps | COD yes | RTO managed by their team; partial COD; early COD payout | COD yes |
| You own customer data | Yes, full export | Yes | Yes | Not stated | Yes |
| Who runs marketing | You, with free mall placement | You or an agency | You | ShopDeck's team | You |
| Mobile app | Shown only if `SHOW_MOBILE_APP_ADDON` | Third-party apps, paid | Not advertised | Free Android app | App file on some plans |

Under the table, one line: "Every competitor cell comes from that platform's own website, checked 17 Oct 2026. ShopDeck's customisation entry is their own claim."

### 3. The quiz (intent-based guide)
A one-question-per-screen stepper with a progress bar, a Back button and a "Skip to results" link. 7 questions, single choice unless noted. Store answers in component state only (no login, no network calls). Also save them to `localStorage`, wrapped in try/catch, so a refresh keeps progress.

1. **Where is your brand today?**
   - Idea / no sales yet
   - Selling up to ₹50,000 a month
   - ₹50,000 – ₹5 lakh a month
   - ₹5 lakh – ₹25 lakh a month
   - Over ₹25 lakh a month
2. **Where do your customers come from now?**
   - Nowhere yet
   - My own Instagram / WhatsApp / community
   - Marketplaces (Amazon, Flipkart, Meesho, Myntra)
   - Paid ads I run myself
3. **Who will run marketing and growth?**
   - I want a team to run ads and pricing for me
   - I'll run it myself
   - I have an agency or in-house team
4. **How do you prefer to pay?**
   - Only when I sell (commission is fine)
   - A fixed monthly fee, 0% on my sales
   - Whatever is cheapest right now
5. **What share of your orders are Cash on Delivery?**
   - Under 25% / 25–50% / Over 50% / Not sure yet
6. **Which of these do you need?** (multi-select)
   - Help getting discovered by new shoppers
   - I own my customer data and can contact my buyers
   - Selling internationally
   - B2B / wholesale or multi-vendor marketplace
   - Physical store / POS alongside online
   - I already use Zoho (Books, Inventory, CRM)
   - I already have a Shopify store
7. **Average order value?**
   - Under ₹500 / ₹500–1,500 / Over ₹1,500

#### Recommendation logic
Write it as a pure, unit-tested function `recommend(answers) → {primary, alternatives[], lebrandsPlan, reasons[], notFor[]}` in `src/lib/recommend.ts`.

Start every platform at 0 points and apply these rules:

- **Wants a team to run growth** (Q3) **and** "Nowhere yet" or "Idea" → ShopDeck +5. Reason: "You want experts to run ads and pricing, and pay only on delivered orders. Expect about 3% + GST of delivered sales."
- **Prefers commission** (Q4) and sales under ₹50,000 → ShopDeck +2, Dukaan +2, Instamojo +2.
- **Cheapest right now** and Idea/under ₹50k → Dukaan +3, Instamojo +2, Zoho Commerce +2, LeBrands.Store +1 (mention the free 30 days).
- **Prefers fixed fee / 0%** → LeBrands.Store +4, Zoho Commerce +3, Wix +1, BigCommerce +1.
- **Sales ₹50k – ₹25 lakh** and "my own audience" or "paid ads I run" → LeBrands.Store +4. Reason: "At your sales level a percentage fee costs more than a flat plan; see the calculator."
- **Needs discovery** → LeBrands.Store +4. Reason: "Every paid plan includes free placement in the LeBrands.Space mall, where shoppers discover D2C brands by category, with no ad spend." ShopDeck +2 (through paid ads you fund).
- **No traffic yet** (Q2 "Nowhere yet") and runs it myself → LeBrands.Store +2, with the same mall reason.
- **Owns customer data** → LeBrands.Store +3, Shopify +2, Zoho Commerce +2.
- **COD over 50%** → LeBrands.Store +2 (COD/RTO tools), ShopDeck +2 (RTO management). Note on Shopify: its 2% fee does not apply to COD orders.
- **International** → Shopify +5, BigCommerce +2.
- **B2B / multi-vendor** → StoreHippo +5, Shopify +1.
- **POS / physical store** → Shopify +3, Fynd +3.
- **Already on Zoho** → Zoho Commerce +5.
- **Already on Shopify** → Shopify +3 **and** LeBrands.Store +3, with the special result "Keep Shopify, add LeBrands.Store Launch as a second sales channel with its own discovery, no custom domain needed."
- **Over ₹25 lakh/month** → Shopify +2, LeBrands.Store +2 (Flagship), StoreHippo +1.

Then:
- `primary` = highest score; `alternatives` = next two. Ties go to the lower estimated monthly cost from the calculator at the user's sales level.
- Always return 2–3 short `reasons` per platform built from the matched rules — never generic praise.
- If LeBrands.Store is not primary or an alternative, show a separate "Where LeBrands.Store fits" note with its `notFor` line, e.g. "LeBrands.Store isn't the best fit if you want someone else to run your ads. Come back once you have your own audience."
- The "Already on Shopify" special result overrides the scores whenever that option is ticked.
- **LeBrands.Store plan pick** by estimated monthly orders = sales ÷ AOV. Use the calculator's values if the user set them; otherwise the midpoints of their answers (sales: ₹25k, ₹2.75L, ₹15L, ₹40L; AOV: ₹400, ₹1,000, ₹2,000): ≤300 → Launch; ≤1,500 → Grow; ≤7,500 → Scale; above → Flagship. Idea stage → "Start free for 30 days".

#### Results screen
- A "Best fit" card for the primary platform: name, model, estimated monthly cost at their sales level (from the calculator), 2–3 reasons, and a button. For LeBrands.Store the button is "Start free for 30 days" → existing sign-up. For others it is "Visit {name}" → their `sourceUrl`, opening in a new tab with `rel="noopener nofollow"`.
- Two "Also consider" cards.
- A "Why we said this" expander listing each answer and how it affected the result.
- "Retake quiz" and "Compare all platforms" links.

### 4. Cost calculator
Inputs (sliders plus number fields, pre-filled from quiz answers when available):
- Monthly sales (₹): 10,000 – 50,00,000, default ₹2,00,000
- Average order value (₹): default ₹800
- Prepaid share (%): default 60 (rest is COD)
- Payment gateway fee on prepaid (%): default 2.0

Output:
- A horizontal bar chart of **estimated monthly cost (₹, before GST)** per platform, sorted cheapest first, LeBrands.Store highlighted in the brand colour and all others in neutral grey. Label each bar with its rupee value.
- Under each bar, the plan the calculator picked (e.g. "Shopify Grow").
- A line under the chart: "LeBrands.Store saves you ₹X/month vs the average percentage-fee platform at this sales level." Show this only when the saving is positive.
- Disclaimer: "Estimates from published prices; excludes GST, themes, apps, shipping and ad spend. Your actual bill may differ."

Formulas — monthly, before GST. `S` = sales, `AOV`, `O = S / AOV` orders, `P` = prepaid share, `G` = gateway % on prepaid. `gateway = S × P × G`. For each platform with several plans, compute every plan and pick the cheapest that the order volume allows.

| Platform | Formula |
|---|---|
| LeBrands.Store | plan fee by orders (Launch ₹1,499 ≤300, Grow ₹3,499 ≤1,500, Scale ₹7,999 ≤7,500, Flagship ₹19,999) + gateway |
| ShopDeck | 3% × S + gateway |
| Shopify | min over [₹1,499 + 2%, ₹5,599 + 1%, ₹22,680 + 0.6%] of (fee + rate × S × P) + gateway — COD orders carry no Shopify fee |
| Dukaan | min over [Starter ₹299 / 3.99%, Growth ₹999 / 1.99%, Infinity ₹5,999 / 0.99%] of (fee + O × min(rate × AOV, ₹200)) + gateway — fee applies to COD orders too |
| Instamojo | min over [Starter ₹6,999/yr ÷ 12 with 5% + ₹3, Growth ₹14,999/yr ÷ 12 with 2% + ₹3] of (fee + O × P × (rate × AOV + 3)) — gateway already included, do not add `gateway` |
| Zoho Commerce | ₹599 (Standard, annual) + gateway |
| Fynd | min over [₹22,222/yr ÷ 12 + 2%, ₹33,333/yr ÷ 12 + 1.5%] of (fee + rate × S) + gateway (Basic plan excluded: no custom domain) |
| StoreHippo | ₹15,000 + 1% × S + gateway |
| Wix | $29 × USD_INR + gateway |
| BigCommerce | $29 if yearly sales ≤ $50k, $79 ≤ $180k, else $299; × USD_INR + gateway |

`USD_INR = 90`, stored as a constant in the data file. Put the calculator in `src/lib/costs.ts` as pure functions with unit tests. The expected outputs at S = ₹5,00,000, AOV ₹800, P 60%, G 2% are approximately: LeBrands.Store ₹9,499 · ShopDeck ₹21,000 · Shopify ₹13,499 · Dukaan ₹16,949 · Instamojo ₹8,375 · Zoho ₹6,599 · Fynd ₹16,278 · StoreHippo ₹26,000 · Wix ₹8,610 · BigCommerce ₹13,110.

### 5. Comparison table
Columns: Platform · Model · Starting price · Fee on your sales · Free trial · Custom domain · COD & RTO tools · You own customer data · Built-in shopper discovery · Best for.

- Filter chips above it: "0% commission", "Done for you", "Free plan", "India-first", "International".
- A sort toggle: "Cheapest at my sales" (uses the calculator inputs) or "A–Z".
- Pin LeBrands.Store as the first row with a light highlight; keep its cells as factual as everyone else's.
- Use ✓ / ✗ / "Partial" with a tooltip explaining each "Partial".
- Each platform name links to its card below.

### 6. Platform cards
One card per platform: name, one-line summary, pricing list, fee, "What's included" (from `includes`), "Good for", "Watch out for", "Source · checked 17 Oct 2026" link. Show `priceNote` as a small caution line under the prices. Show `vendorClaims` under a "They say" label, clearly marked as the vendor's own figures. ShopDeck's card also shows its `journey`. Keep "Watch out for" factual and sourced; no opinions about any company's intentions.

### 7. FAQ
At least these, with FAQPage schema:
- What does "0% commission" really mean? (Platform takes nothing from sales; your payment gateway still charges its own fee.)
- Is revenue share better than a monthly fee? (Depends on sales; link to calculator. Revenue share costs more once you pass about ₹50,000/month.)
- Who owns my customer data on each platform?
- Can I use LeBrands.Store alongside Shopify?
- What is the free LeBrands.Space mall placement? (Every paid plan includes a LeBrands.Space plan: Launch → Starter, Grow → Premium, Scale → Freedom, Flagship → Freedom and extras. Your brand gets a digital shop on India's D2C brand search engine, where shoppers browse by category and niche. There's no ad spend and no commission on orders it brings. The 30-day free trial does not include mall placement; it starts when you choose a paid plan. Orders from the mall appear under "Orders by source" in your dashboard.)
- Zoho Commerce is cheaper. Why choose LeBrands.Store? (Honest answer: if you already run on Zoho, choose Zoho. LeBrands.Store is built only for D2C brands, with COD/RTO analytics in every plan, brand-owned payment and courier accounts, and an AI store builder.)
- Do you ever use my customers' data? (Answer with the data pledge below.)
- Why would you recommend a competitor? ("Because a brand on the wrong platform doesn't stay anywhere. We'd rather earn your trust.")
- How often are these prices updated?

### 7b. Our data pledge
A short highlighted block, before Methodology:
- "Your customers are yours. Their names, phones and orders sit under your brand, in your account."
- "Export everything, any time."
- "We never sell your data, share it, or use it to launch or back products that compete with you."
- "Payments go to your own Razorpay account and shipping runs on your own courier account."

Only publish lines that match how the product works today; drop any that don't.

### 8. Methodology and sources
A short block: how prices were collected (each vendor's own pricing page, 17 Oct 2026), the calculator's assumptions, the list of source links from the data file, and a "Spotted an error? Tell us" link to the existing contact page.

### 9. Final CTA
"Ready to keep 100% of your sales?" → "Start free for 30 days". Secondary: "Talk to us".

## Data file (`src/data/platforms.ts`)

Use this as the starting data. Keep the shape; fill any missing fields with `null`, never invented values.

```ts
export const CHECKED_ON = "2026-10-17";
export const USD_INR = 90;
export const SHOW_DISCOVERY_FEATURE = true; // free LeBrands.Space mall placement is shown on this page
export const SHOW_MOBILE_APP_ADDON = false; // turn on when the store mobile app add-on is ready to sell
export const ANN_LANGUAGES = ["English", "हिन्दी"]; // fill with every language in Ann's live dropdown

export const platforms = [
  {
    id: "lebrands", name: "LeBrands.Store", model: "flat",
    summary: "India-first store builder with 0% commission and brand-owned payments, shipping and customer data.",
    plans: [
      { name: "Free", price: 0, period: "30 days", mallPlan: null, notes: "Up to 100 products / 1,000 SKUs, yourbrand.lebrands.store address, no custom domain, no LeBrands.Space mall placement" },
      { name: "Launch", price: 1499, annual: 14990, maxOrders: 300, staff: 2, support: "Email", mallPlan: "Starter" },
      { name: "Grow", price: 3499, annual: 34990, maxOrders: 1500, staff: 5, support: "WhatsApp, priority", mallPlan: "Premium" },
      { name: "Scale", price: 7999, annual: 79990, maxOrders: 7500, staff: 15, support: "Account manager", mallPlan: "Freedom" },
      { name: "Flagship", priceFrom: 19999, annual: null, maxOrders: null, staff: null, support: "Dedicated team", mallPlan: "Freedom and extras" }
    ],
    feeOnSales: "0%", freeTrial: "30 days", customDomain: "Paid plans",
    codRto: "planned", ownsCustomerData: true,
    discovery: "Free LeBrands.Space mall placement with every paid plan: a digital shop on India's D2C brand search engine (300,000+ brands indexed), where shoppers browse by category and niche, follow brands and claim offers. No ad spend, no commission on those orders.",
    themes: ["Editorial", "Modern Boutique", "Bold Architectural", "Minimal"],
    buildFlow: "Ann guides one flow: business and GST check, store address, style, colours, fonts, category, collections, products, brand story, review, with a live desktop and mobile preview",
    editing: "Click any text or photo to edit in place; add, remove and reorder sections; edit menus; full theme editor",
    connections: "Own Razorpay, delivery partner and custom domain, connected from the dashboard any time; optional to launch",
    mobileApp: "Store mobile app add-on (shown only if SHOW_MOBILE_APP_ADDON)",
    goodFor: ["Brands already selling or with their own audience", "Founders who want 0% commission and full ownership", "Shopify brands adding a second channel"],
    watchOut: ["You run your own marketing", "Plans are sized by monthly orders"],
    sourceUrl: "https://lebrands.store/pricing"
  },
  {
    id: "shopdeck", name: "ShopDeck", model: "revenueShare",
    summary: "Free store plus a team that runs your marketing, pricing and RTO, paid as a share of delivered orders.",
    plans: [{ name: "Standard", price: 0, notes: "₹0 subscription and setup" }],
    feeOnSales: "3% + GST on delivered orders", freeTrial: "No upfront cost", customDomain: null,
    codRto: true, ownsCustomerData: null, discovery: false,
    includes: ["Website with themes, flexible checkout (COD, online, partial COD)", "Growth consultants for marketing strategy, pricing and RTO", "Free Android app for the brand", "Early COD remittance, reconciliation, GST-ready invoices", "50+ analytics dashboards"],
    journey: "Month 1 setup (website, ad account, campaigns, payment gateway, pricing); months 2–3 optimise campaigns and RTO",
    vendorClaims: ["Over 40% of brands reach profitability after an average spend of ₹42k (ShopDeck's own figure)", "Over 75% of sellers are from tier-2 and tier-3 cities"],
    goodFor: ["First-time sellers with no traffic", "Marketplace sellers moving to D2C", "Founders who want experts to run ads"],
    watchOut: ["Cost grows with every order", "Growth know-how sits with the platform's team", "Ad spend is on top of the 3%"],
    sourceUrl: "https://shopdeck.com/"
  },
  {
    id: "shopify", name: "Shopify", model: "perOrder",
    summary: "Global platform with the largest app ecosystem; adds a fee on online payments in India.",
    plans: [
      { name: "Basic", price: 1499, monthlyBilling: 1994, rate: 0.02 },
      { name: "Grow", price: 5599, monthlyBilling: 7447, rate: 0.01 },
      { name: "Advanced", price: 22680, monthlyBilling: 30164, rate: 0.006 },
      { name: "Plus", priceFrom: 175000, rate: 0.002 }
    ],
    feeOnSales: "2% / 1% / 0.6% / 0.2% on third-party gateway payments (not on COD)",
    freeTrial: "3 days, then ₹20/month for 3 months", customDomain: true,
    codRto: "Partial", ownsCustomerData: true, discovery: "Partial",
    includes: ["Selling in AI chats such as ChatGPT and Copilot (merchant stays merchant of record)", "Sidekick AI assistant", "Staff accounts: none on Basic, 5 on Grow, 15 on Advanced", "10 inventory locations", "POS Pro add-on ₹7,000/month per location"],
    goodFor: ["International selling", "Brands that need many apps"],
    watchOut: ["Shopify Payments isn't available in India, so the extra fee applies to online payments", "Paid apps add up"],
    sourceUrl: "https://www.shopify.com/in/pricing"
  },
  {
    id: "dukaan", name: "Dukaan", model: "perOrder",
    summary: "Phone-first store builder for small sellers, with a service fee on every order.",
    plans: [
      { name: "Free", price: 0, rate: 0.0499 },
      { name: "Starter", price: 299, rate: 0.0399 },
      { name: "Growth", price: 999, rate: 0.0199 },
      { name: "Infinity", price: 5999, rate: 0.0099 }
    ],
    priceNote: "Third-party listings disagree on plan prices (₹299/999/5,999 vs ₹1,499/3,899/14,490). Confirm on Dukaan's site.",
    feeOnSales: "4.99% to 0.99% service fee, capped ₹200/order, plus gateway; applies to COD too (except Infinity)",
    freeTrial: "Free plan", customDomain: "Paid plans",
    codRto: "Partial", ownsCustomerData: true, discovery: false,
    goodFor: ["Testing an idea for free", "Very small catalogues"],
    watchOut: ["Per-order fee grows with sales"],
    sourceUrl: "https://help.mydukaan.io/article/1014-dukaan-service-fee-payment-gateway-charges"
  },
  {
    id: "instamojo", name: "Instamojo", model: "perOrder",
    summary: "Payments company with a simple built-in store; its fee includes the payment gateway.",
    plans: [
      { name: "Lite", price: 0, period: "year", rate: 0.05, fixed: 3 },
      { name: "Starter", price: 6999, period: "year", rate: 0.05, fixed: 3 },
      { name: "Growth", price: 14999, period: "year", rate: 0.02, fixed: 3 }
    ],
    priceNote: "Instamojo's pricing page shows two sets of yearly prices (₹6,999/₹14,999 and ₹3,999/₹9,999). Confirm before publishing.",
    feeOnSales: "5% + ₹3 or 2% + ₹3 per online payment (gateway included)",
    freeTrial: "Free plan; 14-day money-back on paid", customDomain: "Paid plans",
    codRto: false, ownsCustomerData: true, discovery: false,
    goodFor: ["Digital products", "Small catalogues"],
    watchOut: ["Basic store design options"],
    sourceUrl: "https://www.instamojo.com/pricing/"
  },
  {
    id: "zoho", name: "Zoho Commerce", model: "flat",
    summary: "Store builder from Chennai's Zoho, 0% transaction fee, tied into Zoho Books, Inventory and CRM.",
    plans: [
      { name: "Standard", price: 999, annual: 599 * 12 },
      { name: "Professional", price: 2999, annual: 1799 * 12 },
      { name: "Premium", price: 3999, annual: 3499 * 12 },
      { name: "Plus", price: 5999, annual: 4999 * 12 }
    ],
    feeOnSales: "0%", freeTrial: "Yes", customDomain: true,
    codRto: "Partial", ownsCustomerData: true, discovery: false,
    goodFor: ["Businesses already on Zoho"],
    watchOut: ["Best value only if you use other Zoho apps"],
    sourceUrl: "https://www.zoho.com/commerce/plan-comparison/"
  },
  {
    id: "fynd", name: "Fynd", model: "perOrder",
    summary: "Reliance-backed omnichannel platform for online and offline retail.",
    plans: [
      { name: "Basic", price: 11111, period: "year", rate: 0.02, notes: "fynd.io domain only" },
      { name: "Pro", price: 22222, period: "year", rate: 0.02 },
      { name: "Premium", price: 33333, period: "year", rate: 0.015 }
    ],
    feeOnSales: "2% / 2% / 1.5%", freeTrial: "30 days", customDomain: "Pro and above",
    codRto: "Partial", ownsCustomerData: true, discovery: false,
    includes: ["Staff accounts: 2 / 5 / 10", "Inventory locations: 1 / 2 / 5", "WhatsApp integration on Premium only"],
    goodFor: ["Brands with physical stores", "Marketplace syncing"],
    watchOut: ["Transaction fee on every plan"],
    sourceUrl: "https://platform.fynd.com/pricing"
  },
  {
    id: "storehippo", name: "StoreHippo", model: "perOrder",
    summary: "Enterprise platform for B2B, multi-vendor and multi-store businesses.",
    plans: [
      { name: "Business", price: 15000, rate: 0.01 },
      { name: "Enterprise", price: 30000, rate: 0.005 },
      { name: "Platinum", priceFrom: 120000 }
    ],
    priceNote: "10% off annual, 20% off two-year plans paid upfront; Platinum needs a 1-year minimum term.",
    feeOnSales: "1% / 0.5% per order", freeTrial: "Demo", customDomain: true,
    codRto: "Partial", ownsCustomerData: true, discovery: false,
    goodFor: ["B2B and multi-vendor marketplaces"],
    watchOut: ["High entry price for D2C brands"],
    sourceUrl: "https://www.storehippo.com/pricing"
  },
  {
    id: "wix", name: "Wix", model: "flat", currency: "USD",
    summary: "Global website builder; selling needs the Core plan or higher.",
    plans: [{ name: "Core", priceUsd: 29 }, { name: "Business", priceUsd: 39 }, { name: "Business Elite", priceUsd: 159 }],
    feeOnSales: "0%", freeTrial: "Free plan (no selling)", customDomain: true,
    codRto: false, ownsCustomerData: true, discovery: false,
    goodFor: ["Design-led sites with a small shop"],
    watchOut: ["Priced in USD", "Limited Indian payment and COD support"],
    sourceUrl: "https://www.wix.com/plans"
  },
  {
    id: "bigcommerce", name: "BigCommerce", model: "flat", currency: "USD",
    summary: "Global platform; plans move up automatically as yearly sales grow.",
    plans: [
      { name: "Standard", priceUsd: 29, maxYearlySalesUsd: 50000 },
      { name: "Plus", priceUsd: 79, maxYearlySalesUsd: 180000 },
      { name: "Pro", priceUsd: 299, maxYearlySalesUsd: 400000 }
    ],
    feeOnSales: "0%", freeTrial: "Yes", customDomain: true,
    codRto: false, ownsCustomerData: true, discovery: false,
    goodFor: ["High-volume international stores"],
    watchOut: ["Priced in USD", "Forced upgrade as sales grow"],
    sourceUrl: "https://www.bigcommerce.com/essentials/pricing/"
  },
  {
    id: "squarespace", name: "Squarespace", model: "flat", currency: "USD", inCalculator: false,
    summary: "Design-focused website builder.",
    plans: [{ name: "Basic", priceUsd: 16, rate: 0.02 }, { name: "Core", priceUsd: 23 }, { name: "Plus", priceUsd: 39 }, { name: "Advanced", priceUsd: 99 }],
    feeOnSales: "2% on Basic, 0% above", freeTrial: "Yes", customDomain: true,
    codRto: false, ownsCustomerData: true, discovery: false,
    goodFor: ["Portfolio-style brand sites"],
    watchOut: ["No Indian payment gateways or COD", "The Plus plan exists only where Squarespace Payments is available"],
    sourceUrl: "https://www.squarespace.com/pricing"
  },
  {
    id: "ecwid", name: "Ecwid", model: "flat", currency: "USD", inCalculator: false,
    summary: "Adds a store to a website you already have.",
    plans: [{ name: "Starter", priceUsd: 5 }, { name: "Venture", priceUsd: 35 }, { name: "Business", priceUsd: 65 }, { name: "Unlimited", priceUsd: 149 }],
    feeOnSales: "0%", freeTrial: "No free plan since 2025", customDomain: "Uses your site",
    codRto: false, ownsCustomerData: true, discovery: false,
    goodFor: ["Adding a shop to an existing site"],
    watchOut: ["Priced in USD"],
    sourceUrl: "https://www.ecwid.com/pricing"
  }
];
```

**Leave out** StoreBase, QPe, Billionbiz and BuildaBazaar: their pricing or live status couldn't be confirmed. Leave Zopping out until its current price is confirmed on its own pricing page.

## Honesty and legal guardrails (must follow)
- Every competitor fact comes from the data file and shows its source link and `checkedOn` date. No claim about a competitor that isn't in the data file.
- Neutral wording only: no "hidden fees", "scam", "rip-off", or guesses about how others use data. "Watch out for" lines state facts, not motives.
- `ownsCustomerData: null` renders as "Not stated" — never ✗.
- Wherever mall placement is mentioned (hero chip, table, quiz reasons, FAQ), say "with paid plans"; never imply the free trial includes it.
- Mall placement copy describes what the brand gets (a digital shop and placement on the search engine). Never promise a number of visitors, orders or sales from it.
- LeBrands.Store features that are not live yet are flagged in the data (`status: "coming soon"`) and shown with a "Coming soon" tag, never as available. Before launch, check each LeBrands feature against what is actually shipped.
- Footer disclaimer: "All trademarks belong to their owners. LeBrands.Store is not affiliated with the platforms listed. Prices are from each platform's public website on 17 Oct 2026 and may have changed."

## Done when
- `/compare` renders on mobile and desktop in Light and Dark themes.
- The quiz returns a sensible result for these test cases (add them as unit tests):
  1. Idea stage, no traffic, wants a team, prefers commission → ShopDeck first; the "Where LeBrands.Store fits" note appears.
  2. ₹50k–₹5 lakh/month, own Instagram audience, runs it myself, prefers fixed fee, AOV ₹500–1,500 → LeBrands.Store first, plan "Launch".
  3. Already on Zoho, ₹1 lakh/month → Zoho Commerce first.
  4. Sells internationally → Shopify first.
  5. Already on Shopify, ₹5 lakh/month → "Keep Shopify + add LeBrands.Store Launch".
  6. Under ₹50k/month, no traffic yet, runs it myself, ticks "Help getting discovered" → LeBrands.Store first, with the free mall placement as a reason.
- Any LeBrands value set to `"planned"` renders as a "Coming soon" tag, never a ✓.
- Calculator unit tests match the expected outputs above within ±₹5.
- Lighthouse accessibility ≥ 95: labelled inputs, keyboard-usable quiz and sliders, chart has a text alternative listing each platform's cost.

import { PRICING } from "../config/pricing.js";
import { escapeHtml, layout, brandMark, footer } from "./layout.js";

const price = (rupees) => `₹${Number(rupees).toLocaleString("en-IN")}`;

export function renderHome() {
  const plans = PRICING.plans.map((plan, index) => `
    <article class="price-plan ${index === 1 ? "price-plan-featured" : ""}">
      <div class="plan-kicker">${index === 1 ? "A little room to grow" : index === 0 ? "Start with one" : "For your next idea"}</div>
      <div class="plan-shops">${plan.shops} ${plan.shops === 1 ? "store" : "stores"}</div>
      <div class="plan-price"><span>${price(plan.foundingPrice)}</span><small>/ month + GST</small></div>
      <div class="plan-standard">Usually ${price(plan.listPrice)} / month</div>
      <div class="plan-rule"></div>
      <p>Founding member price, held while places remain.</p>
      <a class="button ${index === 1 ? "" : "button-outline"}" href="https://app.lebrands.store/signup">Choose ${plan.shops} ${plan.shops === 1 ? "store" : "stores"} <span aria-hidden="true">↗</span></a>
    </article>`).join("");
  const faqs = [
    ["Can I use a domain I already own?", "Yes. Connect a domain you own, or start with your LeBrands.Store address. Your store includes SSL either way."],
    ["How do online payments work?", "Your Razorpay account is connected to your store, so payments settle to you. Cash on Delivery is available from day one."],
    ["Can I sell with Cash on Delivery?", "Yes. COD is ready as soon as your store is live. You can offer it alongside online payments."],
    ["Are GST invoices included?", "Yes. Your store can issue GST invoices for orders using the details you provide."],
    ["Who owns my customer and order data?", "You do. Your data belongs to your brand and is exportable whenever you need it."],
    ["What if I move away later?", "Your domain, payment relationship and data remain yours. You can export your data and take your domain with you."],
    ["What does zero commission mean?", "We do not take a percentage of your sales. You pay your plan price, setup fee where applicable, and your own payment provider fees."],
  ].map(([q, a]) => `<details class="faq-item"><summary>${escapeHtml(q)}<span class="faq-plus" aria-hidden="true">+</span></summary><p>${escapeHtml(a)}</p></details>`).join("");

  const body = `
  <style>
    .home-hero{position:relative;overflow:hidden;padding:73px 0 84px;background:var(--paper)}
    .hero-grid{display:grid;grid-template-columns:1.04fr .96fr;align-items:center;gap:40px;min-height:455px}
    .hero-copy{position:relative;z-index:1;padding:22px 0}
    .hero-copy h1{font:500 clamp(56px,7.2vw,92px)/.98 var(--serif);letter-spacing:-.06em;max-width:660px;margin:22px 0 25px}
    .hero-copy h1 em{font-weight:500;color:#a35d45}
    .hero-lede{font-size:16px;line-height:1.65;max-width:420px;color:var(--muted);margin:0 0 28px}
    .hero-actions{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
    .hero-note{display:flex;gap:10px;align-items:center;margin-top:36px;color:var(--muted);font-size:11px;letter-spacing:.04em}
    .hero-note:before{content:"";width:28px;height:1px;background:var(--coral)}
    .hero-art{min-height:440px;position:relative;display:flex;align-items:center;justify-content:center}
    .hero-art:before{content:"";position:absolute;width:min(420px,90%);aspect-ratio:1;border-radius:50%;background:#e9dfc9;top:50%;left:50%;transform:translate(-47%,-50%)}
    .orbit{position:absolute;border:1px solid rgba(33,74,61,.18);border-radius:50%;width:96%;aspect-ratio:1;transform:rotate(-19deg)}
    .orbit:after{content:"";width:13px;height:13px;border-radius:50%;background:var(--coral);position:absolute;top:18%;left:15%}
    .store-scene{position:relative;z-index:1;width:min(390px,90%);background:#fffaf1;border:1px solid rgba(32,62,52,.12);box-shadow:0 28px 60px rgba(61,61,43,.15);transform:rotate(2deg)}
    .scene-top{height:38px;border-bottom:1px solid #e8e0d3;display:flex;align-items:center;gap:5px;padding:0 14px}
    .scene-top i{display:block;width:6px;height:6px;border-radius:50%;background:#d3cbbd}
    .scene-address{margin-left:11px;height:17px;width:57%;border-radius:9px;background:#f0ece4}
    .scene-inner{padding:23px 25px 27px}
    .scene-nav{display:flex;align-items:center;justify-content:space-between;font-size:8px;letter-spacing:.13em;text-transform:uppercase;color:#647269}
    .scene-nav b{font:600 14px var(--serif);letter-spacing:-.03em;color:var(--green)}
    .scene-cover{height:172px;margin-top:20px;background:#dfd0b2;position:relative;overflow:hidden;display:grid;place-items:center}
    .scene-cover:before{content:"";position:absolute;inset:0;background:linear-gradient(120deg,transparent 46%,rgba(255,255,255,.22) 47%,transparent 70%)}
    .scene-sun{width:104px;height:104px;border-radius:50%;background:#df876c;position:absolute;right:31px;top:26px}
    .scene-vase{position:absolute;width:54px;height:95px;border-radius:45% 45% 24% 24%;bottom:-4px;left:87px;background:#557062}
    .scene-vase:before{content:"";position:absolute;width:20px;height:71px;background:#6c836f;left:17px;top:-46px;border-radius:60% 0 60% 0;transform:rotate(20deg)}
    .scene-pot{position:absolute;width:78px;height:44px;border-radius:8px 8px 20px 20px;bottom:0;right:75px;background:#bc8e6c}
    .scene-caption{margin-top:16px;font:500 22px var(--serif);letter-spacing:-.03em}
    .scene-foot{font-size:9px;color:#7d8479;margin-top:5px}
    .float-tag{position:absolute;z-index:2;background:#fffaf1;padding:13px 16px;box-shadow:0 12px 34px rgba(61,61,43,.12);font-size:10px;letter-spacing:.08em;text-transform:uppercase}
    .float-tag strong{display:block;font:500 18px var(--serif);letter-spacing:-.02em;text-transform:none;margin-top:3px}
    .tag-live{right:-2%;top:16%;transform:rotate(4deg)}
    .tag-you{left:-2%;bottom:16%;transform:rotate(-4deg);background:var(--green);color:#fffaf1}
    .tag-you small{color:#c5d2b7}
    .how-section{background:var(--green);color:#fff9ee;padding:92px 0 102px}
    .how-section .eyebrow{color:#c2cbbd}.how-section .eyebrow:before{background:var(--sun)}
    .how-section .section-heading p{color:#c5cec2}
    .steps{display:grid;grid-template-columns:repeat(3,1fr);border-top:1px solid rgba(255,255,255,.27)}
    .step{padding:25px 30px 0 0;min-height:160px;position:relative}
    .step:not(:last-child):after{content:"";position:absolute;right:27px;top:25px;width:1px;height:105px;background:rgba(255,255,255,.18)}
    .step-no{font:500 12px var(--sans);color:var(--sun);letter-spacing:.12em}
    .step h3{font:500 26px/1.1 var(--serif);margin:20px 0 9px}
    .step p{color:#c5cec2;font-size:13px;margin:0;max-width:260px}
    .included-section{background:#eee6d8}
    .included-layout{display:grid;grid-template-columns:.85fr 1.15fr;gap:9vw;align-items:start}
    .included-layout .section-heading{position:sticky;top:32px}
    .feature-list{border-top:1px solid #cfc6b7}
    .feature{display:grid;grid-template-columns:39px 1fr;gap:12px;padding:18px 0;border-bottom:1px solid #cfc6b7;align-items:start}
    .feature-num{font-size:10px;color:#a35d45;letter-spacing:.1em;padding-top:3px}
    .feature h3{font-size:14px;margin:0 0 4px}
    .feature p{font-size:12px;color:var(--muted);margin:0;max-width:440px}
    .why-section{background:var(--paper);overflow:hidden}
    .why-head{display:flex;justify-content:space-between;align-items:end;gap:24px;margin-bottom:45px}
    .why-head .section-heading{margin:0}
    .why-side{font:500 16px var(--serif);color:#9a5b45;max-width:160px;transform:rotate(-5deg)}
    .why-points{display:grid;grid-template-columns:1fr 1fr;border-top:1px solid var(--line);border-left:1px solid var(--line)}
    .why-point{min-height:183px;padding:30px 34px;border-right:1px solid var(--line);border-bottom:1px solid var(--line);display:flex;flex-direction:column;justify-content:space-between}
    .why-point span{font-size:10px;color:var(--muted);letter-spacing:.12em}
    .why-point h3{font:500 clamp(22px,3vw,32px)/1.1 var(--serif);letter-spacing:-.03em;margin:24px 0 0;max-width:400px}
    .why-point:nth-child(2){background:#e8dfcb}.why-point:nth-child(3){background:#e6ead9}.why-point:nth-child(4){background:#df876c;color:#fffaf0}.why-point:nth-child(4) span{color:#f6ded4}
    .pricing-section{background:#e8eadb}
    .pricing-top{display:flex;justify-content:space-between;gap:30px;align-items:end;margin-bottom:39px}
    .pricing-top .section-heading{margin:0}
    .founding-stamp{border:1px solid #899572;padding:14px 18px;font-size:10px;line-height:1.45;letter-spacing:.09em;text-transform:uppercase;transform:rotate(2deg);color:#4a5f45}
    .founding-stamp b{display:block;font:500 21px var(--serif);letter-spacing:0;text-transform:none}
    .price-plans{display:grid;grid-template-columns:repeat(3,1fr);gap:13px}
    .price-plan{background:#f8f4ea;border:1px solid #d6ddc6;padding:27px 24px 24px;min-height:326px;display:flex;flex-direction:column}
    .price-plan-featured{background:var(--green);color:#fffaf0;border-color:var(--green);transform:translateY(-9px)}
    .plan-kicker{font-size:10px;text-transform:uppercase;letter-spacing:.12em;color:#768164}
    .price-plan-featured .plan-kicker{color:#d2d9c8}
    .plan-shops{font:500 26px var(--serif);margin:17px 0 9px}
    .plan-price{display:flex;align-items:baseline;gap:7px;flex-wrap:wrap}
    .plan-price span{font:500 37px/1 var(--serif);letter-spacing:-.04em}
    .plan-price small,.plan-standard{font-size:10px;color:var(--muted)}
    .price-plan-featured .plan-price small,.price-plan-featured .plan-standard{color:#c5cec2}
    .plan-standard{margin-top:7px;text-decoration:line-through;text-decoration-color:#b8b8a5}
    .plan-rule{height:1px;background:#d8d9c9;margin:20px 0 14px}
    .price-plan-featured .plan-rule{background:rgba(255,255,255,.25)}
    .price-plan p{font-size:12px;color:var(--muted);margin:0 0 18px}
    .price-plan-featured p{color:#d8dfd3}
    .price-plan .button{margin-top:auto}
    .pricing-foot{margin-top:23px;font-size:11px;color:var(--muted)}
    .pricing-foot strong{color:var(--ink)}
    .faq-section{background:#f7f1e7}
    .faq-layout{display:grid;grid-template-columns:.72fr 1.28fr;gap:8vw}
    .faq-layout .section-heading{margin:0}
    .faq-list{border-top:1px solid var(--line)}
    .faq-item{border-bottom:1px solid var(--line)}
    .faq-item summary{list-style:none;cursor:pointer;padding:20px 0;display:flex;justify-content:space-between;gap:20px;align-items:center;font-size:14px;font-weight:600}
    .faq-item summary::-webkit-details-marker{display:none}
    .faq-plus{width:25px;height:25px;border:1px solid var(--line);border-radius:50%;display:grid;place-items:center;font-size:17px;font-weight:400;flex:none;transition:transform .2s ease}
    .faq-item[open] .faq-plus{transform:rotate(45deg)}
    .faq-item p{font-size:13px;color:var(--muted);max-width:600px;margin:-3px 36px 20px 0}
    .closing-cta{background:#e3d5bb;padding:70px 0}
    .closing-inner{display:flex;justify-content:space-between;align-items:center;gap:30px}
    .closing-inner h2{font:500 clamp(38px,5vw,59px)/1 var(--serif);letter-spacing:-.045em;max-width:590px;margin:14px 0 0}
    .closing-inner .button{flex:none}
    @media(max-width:850px){.hero-grid{grid-template-columns:1fr .85fr;gap:8px}.hero-copy h1{font-size:64px}.hero-art{min-height:380px}.scene-inner{padding:17px}.scene-cover{height:145px}.included-layout{gap:5vw}.price-plan{padding:22px 17px}.plan-price span{font-size:31px}}
    @media(max-width:680px){.home-hero{padding:42px 0 55px}.hero-grid{grid-template-columns:1fr;gap:12px}.hero-copy{padding:10px 0 0}.hero-copy h1{font-size:clamp(54px,14vw,75px);max-width:550px}.hero-lede{font-size:15px}.hero-art{min-height:355px;margin:0 auto;width:min(100%,450px)}.store-scene{width:min(345px,84%)}.tag-live{right:0;top:10%}.tag-you{left:0;bottom:9%}.section-heading{margin-bottom:32px}.how-section{padding:70px 0}.steps{grid-template-columns:1fr}.step{min-height:0;padding:19px 0 21px 48px;border-bottom:1px solid rgba(255,255,255,.18)}.step:not(:last-child):after{display:none}.step-no{position:absolute;left:0;top:22px}.step h3{font-size:24px;margin:0 0 7px}.included-layout,.faq-layout{grid-template-columns:1fr;gap:15px}.included-layout .section-heading{position:static}.why-head,.pricing-top{align-items:flex-start;flex-direction:column}.why-side{display:none}.why-points{grid-template-columns:1fr}.why-point{min-height:145px;padding:23px}.price-plans{grid-template-columns:1fr;gap:10px}.price-plan{min-height:0}.price-plan-featured{transform:none;order:-1}.founding-stamp{align-self:flex-start}.faq-layout .section-heading{margin-bottom:10px}.faq-item summary{font-size:13px}.closing-inner{align-items:flex-start;flex-direction:column}.closing-inner h2{font-size:45px}.closing-cta{padding:56px 0}}
    @media(prefers-reduced-motion:reduce){.faq-plus{transition:none}}
  </style>
  <header><div class="wrap site-header">${brandMark()}<nav class="nav" aria-label="Main navigation">
    <a href="#how">How it works</a><a href="#pricing">Pricing</a><a href="#faq">Questions</a><a class="nav-login" href="https://app.lebrands.store/login">Sign in</a>
  </nav></div></header>
  <main>
    <section class="home-hero"><div class="wrap hero-grid">
      <div class="hero-copy"><div class="eyebrow">Your brand, on its own terms</div>
        <h1>Make your online brand <em>dream</em> come true.</h1>
        <p class="hero-lede">Your store, already connected. From your brand name to a live store in 10 minutes.</p>
        <div class="hero-actions"><a class="button" href="https://app.lebrands.store/signup">Create your store <span aria-hidden="true">↗</span></a><a class="button button-outline" href="#how">See how it works <span aria-hidden="true">↓</span></a></div>
        <div class="hero-note">For the next generation of Indian independent brands</div>
      </div>
      <div class="hero-art" aria-label="Illustration of an independent brand's online store">
        <div class="orbit"></div>
        <div class="store-scene"><div class="scene-top"><i></i><i></i><i></i><div class="scene-address"></div></div><div class="scene-inner">
          <div class="scene-nav"><b>moru studio</b><span>Objects&nbsp;&nbsp; About&nbsp;&nbsp; Bag 0</span></div>
          <div class="scene-cover"><div class="scene-sun"></div><div class="scene-vase"></div><div class="scene-pot"></div></div>
          <div class="scene-caption">Made for slower mornings.</div><div class="scene-foot">SMALL-BATCH OBJECTS, MADE IN JAIPUR</div>
        </div></div>
        <div class="float-tag tag-live">Your own storefront<strong>moru.in</strong></div>
        <div class="float-tag tag-you"><small>Your brand. Your rules.</small><strong>All yours.</strong></div>
      </div>
    </div></section>
    <section class="how-section section-pad" id="how"><div class="wrap">
      <div class="section-heading"><div class="eyebrow">A simple start</div><h2>Three small steps.<br>One big open door.</h2><p>Skip the maze of plugins and setup. Start with the parts that make your brand yours.</p></div>
      <div class="steps">
        <article class="step"><span class="step-no">01 / START</span><h3>Tell us about your brand</h3><p>Give your store a name and claim its address.</p></article>
        <article class="step"><span class="step-no">02 / MAKE IT YOURS</span><h3>Pick a theme and add products</h3><p>Bring your point of view, your products and your prices.</p></article>
        <article class="step"><span class="step-no">03 / OPEN SHOP</span><h3>Go live with Cash on Delivery</h3><p>Your storefront is ready to meet its first customer.</p></article>
      </div>
    </div></section>
    <section class="included-section section-pad"><div class="wrap included-layout">
      <div class="section-heading"><div class="eyebrow">The whole shop, connected</div><h2>Everything behind a good first impression.</h2><p>One place for your storefront, your orders and the tools that keep the business moving.</p></div>
      <div class="feature-list">
        <article class="feature"><span class="feature-num">01</span><div><h3>A complete online store</h3><p>Home, collections, product pages, cart and checkout.</p></div></article>
        <article class="feature"><span class="feature-num">02</span><div><h3>Cash on Delivery from day one</h3><p>Give customers a familiar way to place an order.</p></div></article>
        <article class="feature"><span class="feature-num">03</span><div><h3>Your own Razorpay for online payments</h3><p>Connect your payment account and keep the relationship yours.</p></div></article>
        <article class="feature"><span class="feature-num">04</span><div><h3>Shiprocket delivery</h3><p>Connect fulfilment for shipping across India.</p></div></article>
        <article class="feature"><span class="feature-num">05</span><div><h3>GST invoices</h3><p>Issue invoices with your business details.</p></div></article>
        <article class="feature"><span class="feature-num">06</span><div><h3>Orders and customers dashboard</h3><p>Keep a clear view of the people and purchases behind your brand.</p></div></article>
        <article class="feature"><span class="feature-num">07</span><div><h3>Your own domain with SSL</h3><p>Bring your domain and make your address unmistakably yours.</p></div></article>
        <article class="feature"><span class="feature-num">08</span><div><h3>Your data, exportable anytime</h3><p>Keep a copy of your business data, whenever you need it.</p></div></article>
      </div>
    </div></section>
    <section class="why-section section-pad"><div class="wrap">
      <div class="why-head"><div class="section-heading"><div class="eyebrow">Built around the owner</div><h2>You run the brand.<br>We run the store.</h2></div><div class="why-side">For founders who want more than a rented corner of the internet.</div></div>
      <div class="why-points">
        <article class="why-point"><span>01 / KEEP WHAT YOU EARN</span><h3>Zero commission on your sales.</h3></article>
        <article class="why-point"><span>02 / KEEP WHAT IS YOURS</span><h3>Your domain, your payments, your data. We run the store.</h3></article>
        <article class="why-point"><span>03 / GROW WITHOUT THE TOLL</span><h3>Built-in discovery, so you're not paying for every visitor.</h3></article>
        <article class="why-point"><span>04 / GET BACK TO THE GOOD PART</span><h3>Stop building websites. Start selling.</h3></article>
      </div>
    </div></section>
    <section class="pricing-section section-pad" id="pricing"><div class="wrap">
      <div class="pricing-top"><div class="section-heading"><div class="eyebrow">Plain-spoken pricing</div><h2>Make room to grow.</h2><p>Choose how many stores you need. Pay a predictable plan price, not a cut of every sale.</p></div>
        <div class="founding-stamp"><b>Founding offer</b>${PRICING.foundingLimit} early brands only</div>
      </div>
      <div class="price-plans">${plans}</div>
      <p class="pricing-foot"><strong>Every plan:</strong> monthly price + ${PRICING.gstPercent}% GST. One-time setup ${price(PRICING.setupFee)}, waived on annual billing. Founding price is a limited offer for the first ${PRICING.foundingLimit} brands.</p>
    </div></section>
    <section class="faq-section section-pad" id="faq"><div class="wrap faq-layout">
      <div class="section-heading"><div class="eyebrow">Good questions</div><h2>Before you open the doors.</h2><p>The important details, without the small print dance.</p></div>
      <div class="faq-list">${faqs}</div>
    </div></section>
    <section class="closing-cta"><div class="wrap closing-inner"><div><div class="eyebrow">Your next step starts here</div><h2>Give your brand a place of its own.</h2></div><a class="button" href="https://app.lebrands.store/signup">Create your store <span aria-hidden="true">↗</span></a></div></section>
  </main>${footer()}`;

  return layout({
    title: "LeBrands.Store | Your brand, on its own terms",
    description: "A complete online store for Indian D2C founders. Own your domain, payments and data, with zero commission on your sales.",
    canonical: "https://lebrands.store/",
    body,
  });
}

export function renderLegal(kind) {
  const key = ["terms", "privacy", "contact"].includes(kind) ? kind : "terms";
  const details = {
    terms: ["Terms", "A clear home for the terms that guide your use of LeBrands.Store."],
    privacy: ["Privacy", "A clear home for how LeBrands.Store handles your information."],
    contact: ["Contact", "The best place to reach the LeBrands.Store team."],
  };
  const [title, description] = details[key];
  const body = `<header><div class="wrap site-header">${brandMark()}<nav class="nav"><a href="https://lebrands.store">Home</a><a class="nav-login" href="https://app.lebrands.store/signup">Create your store</a></nav></div></header>
    <main class="wrap legal-page"><span class="draft-tag">Draft: to be reviewed</span><div class="eyebrow" style="margin-top:23px">LeBrands.Store / ${escapeHtml(key)}</div><h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p>${key === "contact" ? '<p>For help with your account, write to <a href="mailto:support@lebrands.store">support@lebrands.store</a>.</p>' : "<p>This page is a draft and will be reviewed before publication.</p>"}</main>${footer()}`;
  return layout({
    title: `${title} | LeBrands.Store`,
    description,
    canonical: `https://lebrands.store/${key}`,
    body,
  });
}

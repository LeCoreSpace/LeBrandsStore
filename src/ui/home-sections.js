// Homepage storyboard (SC00 to SC08). Pure markup; styles are scoped with the h- prefix in marketing.css.
const frame = (inner, url = "example-studio.lebrands.store") => `<div class="h-browser"><div class="h-bar" aria-hidden="true"><i></i><i></i><i></i><span>${url}</span></div><div class="h-shot">${inner}</div></div>`;

export function homeSections({ img, M, SIGNUP, LOGIN, FAQ }) {
  // Deterministic per render: the counter lives inside this call.
  let uid = 0;
  const tabs = (label, items, panels, cls = "") => {
    const id = `ht${++uid}`;
    return `<div class="h-tabs ${cls}" data-h-tabs>
  <div class="h-tablist" role="tablist" aria-label="${label}">${items.map((t, i) => `<button type="button" role="tab" class="h-tab" id="${id}-t${i}" aria-controls="${id}-p${i}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}" data-h-tab><b>${t[0]}</b><small>${t[1]}</small></button>`).join("")}</div>
  <div class="h-panels">${panels.map((p, i) => `<div class="h-panel" role="tabpanel" id="${id}-p${i}" aria-labelledby="${id}-t${i}"${i ? " hidden" : ""}>${p}</div>`).join("")}</div>
</div>`;
  };
  // Optional current captures supplied by the media manifest; fall back to a supplied sample if absent.
  const opt = (key, fallback) => (M[key] && M[key].available ? img(M[key]) : fallback);
  const faq = FAQ.map(([q, a]) => `<details class="m-faq-item m-reveal"><summary>${q}</summary><p>${a}</p></details>`).join("\n");

  const annTabs = tabs("Ann language", [["English", "Modern Boutique"], ["Hindi", "Modern Boutique"]], [
    frame(img(M.annBuilder), "app.lebrands.store"),
    frame(img(M.annBuilderHindi), "app.lebrands.store")
  ], "h-tabs-ann");

  const looks = tabs("Store looks", [["Modern Boutique", "Soft and editorial"], ["Bold Architectural", "Strong and graphic"]], [
    `<div class="h-look-pair">${frame(img(M.exampleDesktop))}<div class="h-look-phone">${img(M.exampleMobile)}</div></div>`,
    frame(img(M.annBuilderHindi), "app.lebrands.store")
  ], "h-tabs-looks");

  const desk = tabs("Business desk", [["Overview", "Your day at a glance"], ["Private costs", "Per size"], ["Reports", "Your business in numbers"], ["Orders and returns", "From placed to delivered"]], [
    frame(img(M.dashboard), "app.lebrands.store"),
    `<div class="h-cost-grid"><div class="h-shot-plain">${opt("catalogue", img(M.productPhoto))}</div>
      <div class="h-variant" data-h-variants aria-label="Illustrative size demo"><div class="h-vrow" role="group" aria-label="Choose size">
        <button type="button" class="is-on" data-h-var data-price="Rs. 899" data-sku="DEW-30" data-stock="42 in stock" data-cost="Rs. 312">30 ml</button>
        <button type="button" data-h-var data-price="Rs. 1,399" data-sku="DEW-50" data-stock="17 in stock" data-cost="Rs. 468">50 ml</button>
        <button type="button" data-h-var data-price="Rs. 2,199" data-sku="DEW-100" data-stock="Only 3 left" data-cost="Rs. 790">100 ml</button></div>
        <dl class="h-vout"><div><dt>Price</dt><dd data-h-out="price">Rs. 899</dd></div><div><dt>SKU</dt><dd data-h-out="sku">DEW-30</dd></div><div><dt>Stock</dt><dd data-h-out="stock">42 in stock</dd></div><div class="is-private"><dt>Your cost, only you</dt><dd data-h-out="cost">Rs. 312</dd></div></dl>
        <p class="h-fine">Track stock for each size.</p></div></div>`,
    `<div class="h-report"><div class="h-shot-plain">${opt("analytics", `<div class="h-report-crop" role="img" aria-label="A closer look at your business dashboard">${img(M.dashboard)}</div>`)}</div><div class="h-defs"><span><b>Booked order value</b> from orders placed</span><span><b>Cost coverage</b> accepted units with a cost</span><span><b>Estimated margin</b> not net profit</span><span>Download reports: CSV, Excel or print</span></div></div>`,
    `${frame(img(M.orders), "app.lebrands.store")}<ul class="h-pillrow" aria-label="Order desk capabilities"><li>Customers</li><li>Pack and dispatch</li><li>COD returns and RTO</li><li>Returns and refunds</li></ul>`
  ], "h-tabs-ops");

  return `
  <section class="h-sec h-pain h-first" id="why" aria-labelledby="h-pain-title">
    <div class="m-wrap">
      <div class="h-head h-head-wide m-reveal"><span class="m-kicker">Sound familiar?</span><h2 id="h-pain-title"><span>Getting a website that <em class="h-conv">converts</em> is one thing.</span> <span>Connecting payments, delivery, your domain and ads is another.</span></h2></div>
      <div class="h-fcards">
        <article class="h-fc m-reveal"><div class="h-fc-photo"><img src="/img/home-founder-opening-portrait.webp" width="512" height="640" loading="eager" fetchpriority="high" decoding="async" alt="Founder working through her website setup on a laptop"></div><div class="h-fc-body"><span class="h-founder-stage">I just started my brand</span><ul class="h-fc-qs"><li>I do not know coding. Do I have to hire someone?</li><li>Does every small change mean calling my developer again?</li><li>Where do I even start?</li></ul></div></article>
        <article class="h-fc h-fc-b m-reveal"><div class="h-fc-photo"><img src="/img/home-founder-man.webp" width="512" height="512" loading="eager" fetchpriority="high" decoding="async" alt="Indian homeware founder in his product studio"></div><div class="h-fc-body"><span class="h-founder-stage">I am already selling online</span><ul class="h-fc-qs"><li>Why lose a cut of every sale?</li><li>Why pay extra every month just for the basics?</li><li>How do I connect payments, delivery and my web address?</li></ul></div></article>
      </div>
    </div>
  </section>

  <section class="h-sec h-presence" id="your-store" aria-labelledby="h-presence-title">
    <div class="m-wrap">
      <div class="h-head h-head-wide m-reveal">
        <p class="h-presence-lead">Your product is ready.</p>
        <p class="h-presence-lead">Now let’s give it an online presence.</p>
        <h2 id="h-presence-title">A store that tells your brand story and sells.</h2>
        <p class="h-presence-note">Not charging on every sale. Not holding your customer data and payments.</p>
      </div>
    </div>
  </section>

  <section class="h-sec h-show" aria-label="Ann, looks and the business desk" data-h-show>
    <div class="m-wrap">
      <div class="h-show-nav" data-h-show-nav hidden>
        <div class="h-show-tabs" role="group" aria-label="Choose a slide"><button type="button" class="h-show-tab" data-h-show-tab aria-controls="features"><i aria-hidden="true">1</i><span>Meet Ann</span></button><button type="button" class="h-show-tab" data-h-show-tab aria-controls="ann"><i aria-hidden="true">2</i><span>Languages</span></button><button type="button" class="h-show-tab" data-h-show-tab aria-controls="storefront"><i aria-hidden="true">3</i><span>Looks</span></button><button type="button" class="h-show-tab" data-h-show-tab aria-controls="business"><i aria-hidden="true">4</i><span>After the order</span></button></div>
        <div class="h-show-step"><button type="button" class="h-show-arrow" data-h-show-prev aria-label="Previous slide"><span aria-hidden="true">&larr;</span></button><span class="h-show-count" data-h-show-count aria-live="polite">1 of 4</span><button type="button" class="h-show-arrow" data-h-show-next aria-label="Next slide"><span aria-hidden="true">&rarr;</span></button></div>
      </div>
      <div class="h-show-stage" data-h-show-stage>
    <div class="h-slide h-answer" id="features" data-h-slide data-slide-name="Meet Ann" role="group" aria-roledescription="slide" aria-labelledby="h-answer-title">
      <div class="h-answer-head m-reveal"><h2 class="h-ann-intro">Meet Ann.</h2><h1 id="h-answer-title">Your conversational store builder.</h1><p>Beautiful themes, designed and optimised to sell.</p><p class="h-sub">Guided, not generated. Every choice is yours.</p><div class="h-final-cta"><a class="m-cta" href="${SIGNUP}">Start free</a><a class="m-text-link" href="/pricing">See pricing</a></div></div>
      <figure class="h-relief m-reveal"><div class="h-relief-img"><img src="/img/home-founder-ann-laptop.webp" width="1024" height="1024" loading="lazy" decoding="async" alt="Founder working with Ann on her laptop"></div><figcaption><span>Answer a few questions. Watch your store appear.</span></figcaption></figure>
    </div>
    <div class="h-slide h-ann" id="ann" data-h-slide data-slide-name="Languages" role="group" aria-roledescription="slide" aria-labelledby="h-ann-title">
      <div class="h-head h-head-wide m-reveal"><span class="m-kicker">Ann, your store guide</span><h2 id="h-ann-title">Ann speaks your language.</h2></div>
      <ul class="h-pillrow m-reveal"><li>Five languages</li><li>Guided questions and choices</li><li>Live preview beside every step</li></ul>
      <p class="h-hint m-reveal">English, Hindi, Tamil, Marathi and Telugu. Choose a conversation preview below.</p>
      <div class="m-reveal">${annTabs}</div>
      <p class="h-fine">Speak to Ann in your language. Your product names and business details stay exactly as you enter them.</p>
    </div>
    <div class="h-slide h-store" id="storefront" data-h-slide data-slide-name="Looks" role="group" aria-roledescription="slide" aria-labelledby="h-store-title">
      <div class="h-head h-head-wide m-reveal"><span class="m-kicker">Try a look</span><h2 id="h-store-title">Find the look that feels like your brand.</h2></div>
      <p class="h-hint m-reveal">Tap a look to preview it.</p>
      <div class="m-reveal">${looks}</div>
      <ul class="h-pillrow h-pillrow-soft m-reveal" aria-label="More looks in the style library"><li>Editorial</li><li>Minimal</li><li>Vintage</li><li>Social Pop</li><li>Creator Feed</li><li>Proof &amp; Detail</li></ul>
      <p class="h-fine">Try looks on sample products and collections. Your real catalogue stays separate until you choose to use it.</p>
    </div>
    <div class="h-slide h-ops" id="business" data-h-slide data-slide-name="After the order" role="group" aria-roledescription="slide" aria-labelledby="h-ops-title">
      <div class="h-head h-head-wide m-reveal"><span class="m-kicker">After the order</span><h2 id="h-ops-title">Run the whole business from one desk.</h2></div>
      <p class="h-hint m-reveal">Everything you need, in one place.</p>
      <div class="m-reveal">${desk}</div>
    </div>
      </div>
    </div>
  </section>

  <section class="h-sec h-connect" id="connections" aria-labelledby="h-conn-title">
    <div class="m-wrap">
      <div class="h-head h-head-wide m-reveal"><span class="m-kicker">When you are ready</span><h2 id="h-conn-title">Four things to connect, whenever you choose.</h2><p>Your store works without them. Add each one when it suits you.</p></div>
      <div class="h-conn-grid h-conn-four">
        <article class="h-conn h-cc h-cc-domain m-reveal" data-h-cycle data-h-labels="Address added|Being checked|Secure connection ready|Live">
          <div class="h-cc-art"><div class="h-mini h-mini-dom"><span class="h-lock" data-h-lock aria-hidden="true"></span><b>www.yourbrand.in</b><span class="h-chip" data-h-state>Address added</span></div>
          <ol class="h-flow h-flow-live" aria-label="Sample address progress"><li class="is-done">Added</li><li>Checking</li><li>Secure</li><li>Live</li></ol></div>
          <span class="h-cc-tag">Custom domain</span>
          <h3>Your own web address</h3>
          <p>Give your store your own web address. Your included address keeps working while we check and prepare your new one.</p>
          <button type="button" class="h-btn-line" data-h-cycle-next>Preview the steps</button>
        </article>
        <article class="h-conn h-cc h-cc-mkt m-reveal m-reveal-delay">
          <div class="h-cc-art"><div class="h-evt h-evt-col" role="img" aria-label="Sample: store events passed to your own Meta or Google account"><span>Product viewed</span><i aria-hidden="true"></i><span>Added to cart</span><i aria-hidden="true"></i><span class="is-end">Order confirmed</span></div></div>
          <span class="h-cc-tag">Social marketing</span>
          <h3>Meta and Google</h3>
          <p>Connect Meta, Google Analytics and Google Ads with your own IDs. Track store activity with shopper consent. Reports and campaigns stay in your accounts.</p>
        </article>
        <article class="h-conn h-cc h-cc-pay m-reveal">
          <div class="h-cc-art"><div class="h-pay"><span>Your Razorpay account</span><i aria-hidden="true"></i><span class="is-end">Your store checkout</span></div></div>
          <span class="h-cc-tag">Razorpay</span>
          <h3>Your own Razorpay</h3>
          <p>Connect your approved Razorpay account to accept online payments directly. Your payment settings stay separate from your LeBrands.Store plan.</p>
        </article>
        <article class="h-conn h-cc h-cc-del m-reveal m-reveal-delay" data-h-seg>
          <div class="h-cc-art"><div class="h-mini h-mini-del"><span>Order 1042</span><span class="h-chip is-ok" data-h-seg-out>You deliver it yourself</span></div>
          <div class="h-offer" role="group" aria-label="Sample delivery mode"><button type="button" class="is-on" data-h-seg-btn="You deliver it yourself">Manual</button><button type="button" data-h-seg-btn="Shiprocket, where set up for your brand">Shiprocket</button></div></div>
          <span class="h-cc-tag">Delivery partner</span>
          <h3>Ship your way</h3>
          <p>Deliver orders yourself, or use Shiprocket where it is approved and configured for your brand.</p>
        </article>
      </div>
      <p class="h-fine">Explore the previews above. Connect services from your store dashboard when you are ready.</p>
    </div>
  </section>

  <section class="h-sec h-grow" id="built-in" aria-labelledby="h-grow-title">
    <div class="m-wrap">
      <div class="h-head m-reveal"><h2 id="h-grow-title">Help and trust, built in.</h2></div>
      <ul class="h-strip">
        <li class="m-reveal"><i class="h-ico" aria-hidden="true"><svg viewBox="0 0 32 32" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8a3 3 0 0 1 3-3h16a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H15l-6 5v-5H8a3 3 0 0 1-3-3z"/><path d="M11 11h10M11 15h6"/></svg></i><b>Help before and after launch</b><span>Support tickets: Created, Pending or Closed. Emails when a request opens and closes.</span></li>
        <li class="m-reveal"><i class="h-ico" aria-hidden="true"><svg viewBox="0 0 32 32" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="11" r="4"/><circle cx="22" cy="12" r="3"/><path d="M4 26c0-5 3.6-8 8-8s8 3 8 8M20 19c4 0 8 2 8 7"/></svg></i><b>Team roles</b><span>Owner, admin or editor.</span></li>
        <li class="m-reveal"><i class="h-ico" aria-hidden="true"><svg viewBox="0 0 32 32" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3h11l6 6v20H8z"/><path d="M19 3v6h6"/><rect x="12" y="16" width="9" height="7" rx="1.5"/><path d="M14 16v-2a2.5 2.5 0 0 1 5 0v2"/></svg></i><b>Private documents</b><span>Seen only by you and our review team.</span></li>
        <li class="m-reveal"><i class="h-ico" aria-hidden="true"><svg viewBox="0 0 32 32" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="7" width="24" height="18" rx="3"/><path d="M4 13h24M9 20h6"/></svg></i><b>Plan in Ann</b><span>Choose a plan as you build. <a href="/pricing">See pricing</a></span></li>
      </ul>
    </div>
  </section>

  <section class="h-sec h-find" id="discovery" aria-labelledby="h-find-title">
    <div class="m-wrap h-find-grid">
      <div class="m-reveal"><span class="m-kicker">Be found</span><h2 id="h-find-title">Your store. Part of something bigger.</h2><p class="h-sub">Free discovery on LeBrands.Space for all approved stores.</p>
        <div class="h-links"><a href="/pricing">Pricing</a><a href="/compare">Compare</a><a href="/blog">Blog and guides</a><a href="/support">Support</a></div></div>
      <figure class="h-space m-reveal m-reveal-delay"><div class="h-browser"><div class="h-bar" aria-hidden="true"><i></i><i></i><i></i><span>lebrands.space</span></div><a class="h-shot" href="https://lebrands.space/" target="_blank" rel="noopener noreferrer" aria-label="Visit LeBrands.Space (opens in a new tab)">${M.discovery && M.discovery.available ? img(M.discovery) : '<img src="/img/REPLACE-lebrands-space-homepage.webp" width="1600" height="900" loading="lazy" decoding="async" alt="LeBrands.Space virtual mall homepage">'}</a></div></figure>
    </div>
    <div class="m-wrap h-brand-promises m-reveal">
      <div class="hp-zero"><i class="h-ico" aria-hidden="true"><svg viewBox="0 0 32 32" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="16" cy="16" r="12"/><path d="M9 23L23 9"/><circle cx="12" cy="12" r="1.8"/><circle cx="20" cy="20" r="1.8"/></svg></i><b>0%</b><span>Sales commission</span></div>
      <div class="hp-yours"><i class="h-ico" aria-hidden="true"><svg viewBox="0 0 32 32" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="16" r="6"/><path d="M17 16h12M24 16v5M28 16v3"/></svg></i><b>Yours.</b><span>Your domain, payments and customer data</span></div>
      <div class="hp-always"><i class="h-ico" aria-hidden="true"><svg viewBox="0 0 32 32" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4l10 4v8c0 6-4 10-10 12C10 26 6 22 6 16V8z"/><path d="M11 16l4 4 6-8"/></svg></i><b>Always.</b><span>We never market to your customers.</span></div>
    </div>
  </section>

  <section class="h-sec h-faq m-faq" id="faq" aria-labelledby="h-faq-title">
    <div class="m-wrap m-faq-inner"><h2 id="h-faq-title" class="m-reveal">Good to know.</h2><div class="m-faq-list">${faq}</div></div>
  </section>`;
}

export function homeFooter(SIGNUP, LOGIN) {
  const year = new Date().getFullYear();
  return `<footer class="m-footer m-footer-home">
  <div class="m-wrap">
    <div class="hf-top m-reveal">
      <div class="hf-brand"><a class="m-wordmark" href="https://lebrands.store" aria-label="LeBrands.Store home"><img class="m-logo-footer" src="/img/REPLACE-lebrands-hero-transparent.png" width="900" height="320" alt=""></a><p>Your products. Your flagship store.</p><a class="m-cta" href="${SIGNUP}">Open your store</a></div>
      <nav class="hf-cols" aria-label="Footer">
        <div><h2>Explore</h2><a href="#features">Features</a><a href="/pricing">Pricing</a><a href="/compare">Compare</a><a href="/blog">Blog</a><a href="#faq">FAQ</a></div>
        <div><h2>Help</h2><a href="/contact">Contact</a><a href="/support">Support</a><a href="${LOGIN}">Log in</a></div>
        <div><h2>Legal</h2><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/refund-policy">Refund policy</a></div>
      </nav>
    </div>
    <p class="h-fine">Store previews use example products and figures.</p>
    <div class="m-footer-bottom m-reveal m-reveal-delay"><span>LeBrandsSpace Digital Private Limited, Chennai.</span><span>© ${year} LeBrands.Store</span></div>
  </div>
</footer>`;
}

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

  const annTabs = tabs("Ann language", [["English", "Modern Boutique"], ["Hindi", "Bold Architectural"]], [
    frame(img(M.annBuilder), "app.lebrands.store"),
    frame(img(M.annBuilderHindi), "app.lebrands.store")
  ], "h-tabs-ann");

  const looks = tabs("Store looks", [["Modern Boutique", "Soft and editorial"], ["Bold Architectural", "Strong and graphic"]], [
    `<div class="h-look-pair">${frame(img(M.exampleDesktop))}<div class="h-look-phone">${img(M.exampleMobile)}</div></div>`,
    frame(img(M.annBuilderHindi), "app.lebrands.store")
  ], "h-tabs-looks");

  const desk = tabs("Business desk", [["Overview", "Your day at a glance"], ["Private costs", "Per size"], ["Reports", "Sample view"], ["Orders and returns", "From placed to delivered"]], [
    frame(img(M.dashboard), "app.lebrands.store"),
    `<div class="h-cost-grid"><div class="h-shot-plain">${opt("catalogue", img(M.productPhoto))}</div>
      <div class="h-variant" data-h-variants aria-label="Illustrative size demo"><div class="h-vrow" role="group" aria-label="Choose size">
        <button type="button" class="is-on" data-h-var data-price="Rs. 899" data-sku="DEW-30" data-stock="42 in stock" data-cost="Rs. 312">30 ml</button>
        <button type="button" data-h-var data-price="Rs. 1,399" data-sku="DEW-50" data-stock="17 in stock" data-cost="Rs. 468">50 ml</button>
        <button type="button" data-h-var data-price="Rs. 2,199" data-sku="DEW-100" data-stock="Only 3 left" data-cost="Rs. 790">100 ml</button></div>
        <dl class="h-vout"><div><dt>Price</dt><dd data-h-out="price">Rs. 899</dd></div><div><dt>SKU</dt><dd data-h-out="sku">DEW-30</dd></div><div><dt>Stock</dt><dd data-h-out="stock">42 in stock</dd></div><div class="is-private"><dt>Your cost, only you</dt><dd data-h-out="cost">Rs. 312</dd></div></dl>
        <p class="h-fine">Sample product. Stock is counted per size.</p></div></div>`,
    `<div class="h-report"><div class="h-shot-plain">${opt("analytics", `<div class="h-report-crop" role="img" aria-label="Zoomed view of the sample dashboard">${img(M.dashboard)}</div>`)}</div><div class="h-defs"><span class="h-sample">Sample data, illustrative</span><span><b>Booked order value</b> from orders placed</span><span><b>Cost coverage</b> accepted units with a cost</span><span><b>Estimated margin</b> not net profit</span><span>Download reports: CSV, Excel or print</span></div></div>`,
    `${frame(img(M.orders), "app.lebrands.store")}<ul class="h-pillrow" aria-label="Order desk capabilities"><li>Customers</li><li>Pack and dispatch</li><li>COD returns and RTO</li><li>Returns and refunds</li></ul>`
  ], "h-tabs-ops");

  return `
  <section class="h-sec h-pain h-first" id="why" aria-labelledby="h-pain-title">
    <div class="m-wrap">
      <div class="h-head h-head-wide m-reveal"><span class="m-kicker">Illustrative founder scenarios</span><h2 id="h-pain-title">You started a brand, not a web agency.</h2></div>
      <div class="h-people">
        <figure class="h-person m-reveal"><div class="h-pain-img"><img src="/img/home-founder-woman.webp" width="512" height="512" loading="eager" fetchpriority="high" decoding="async" alt="Illustrative AI-generated portrait of an Indian fashion founder"></div><p class="h-thought">Every small change means another agency bill.</p><p class="h-thought h-thought-2">Staring at a blank page.</p></figure>
        <figure class="h-person h-person-b m-reveal m-reveal-delay"><div class="h-pain-img"><img src="/img/home-founder-man.webp" width="512" height="512" loading="eager" fetchpriority="high" decoding="async" alt="Illustrative AI-generated portrait of an Indian homeware founder"></div><p class="h-thought">I do not want to hand over a cut of every order.</p><p class="h-thought h-thought-2">Another add-on, another monthly fee.</p></figure>
        <div class="h-thoughts m-reveal"><p class="h-thought">Will all these apps even work together?</p><p class="h-thought">Where do I even start?</p></div>
      </div>
    </div>
  </section>

  <section class="h-sec h-answer" id="features" aria-labelledby="h-answer-title">
    <div class="m-wrap">
      <div class="h-answer-head m-reveal"><h1 id="h-answer-title">A flagship store, built in a conversation.</h1><div class="h-final-cta"><a class="m-cta" href="${SIGNUP}">Start free</a><a class="m-text-link" href="/pricing">See pricing</a></div></div>
      <figure class="h-relief m-reveal"><div class="h-relief-img"><img src="/img/home-founder-ann-laptop.webp" width="1024" height="1024" loading="lazy" decoding="async" alt="Illustrative AI-generated founder working at a laptop with the actual current Ann interface on its screen"></div><figcaption><b>Meet Ann.</b><span>Answer a few questions. Watch your store appear.</span><em>AI-generated scene with the current Ann interface</em></figcaption></figure>
    </div>
  </section>

  <section class="h-sec h-ann" id="ann" aria-labelledby="h-ann-title">
    <div class="m-wrap">
      <div class="h-head h-head-wide m-reveal"><span class="m-kicker">Ann, your store guide</span><h2 id="h-ann-title">Ann speaks your language.</h2></div>
      <ul class="h-pillrow m-reveal"><li>Five languages</li><li>Guided questions and choices</li><li>Live preview beside every step</li></ul>
      <p class="h-hint m-reveal">English, Hindi, Tamil, Marathi and Telugu. Choose a conversation preview below.</p>
      <div class="m-reveal">${annTabs}</div>
      <p class="h-fine">Current Ann interface with a fictional Example Studio store. Language applies to your conversation, not your product or business records.</p>
    </div>
  </section>

  <section class="h-sec h-store" id="storefront" aria-labelledby="h-store-title">
    <div class="m-wrap">
      <div class="h-head h-head-wide m-reveal"><span class="m-kicker">Try a look</span><h2 id="h-store-title">Find the look that feels like your brand.</h2></div>
      <p class="h-hint m-reveal">Tap a look to preview it.</p>
      <div class="m-reveal">${looks}</div>
      <ul class="h-pillrow h-pillrow-soft m-reveal" aria-label="More looks in the style library"><li>Editorial</li><li>Minimal</li><li>Vintage</li><li>Social Pop</li><li>Creator Feed</li><li>Proof &amp; Detail</li></ul>
      <p class="h-fine">Try looks on sample products and collections. Your real catalogue stays separate until you choose to use it.</p>
    </div>
  </section>

  <section class="h-sec h-editor" id="editor" aria-labelledby="h-editor-title">
    <div class="m-wrap h-editor-grid">
      <div class="m-reveal"><span class="m-kicker">Make it yours</span><h2 id="h-editor-title">Edit it like a page. Publish when it feels right.</h2>
        <ol class="h-steps3"><li><b>Draft</b><span>Change sections and images</span></li><li><b>Preview</b><span>See it before shoppers do</span></li><li><b>Publish</b><span>Go live when ready</span></li></ol>
        <ul class="h-pillrow"><li>Reusable sections</li><li>Product grids</li><li>Photo framing</li><li>Colours and type</li></ul></div>
      <div class="m-reveal m-reveal-delay">${frame(opt("themeEditor", img(M.exampleDesktop)), "app.lebrands.store")}</div>
    </div>
  </section>

  <section class="h-sec h-checkout" aria-labelledby="h-co-title">
    <div class="m-wrap h-co-grid">
      <div class="m-reveal">
        <span class="m-kicker">Checkout</span><h2 id="h-co-title">Made for how India buys.</h2>
        <ul class="h-pillrow h-pillrow-left"><li>Cash on Delivery</li><li>PIN fills city and state</li><li>Verified shopper email</li><li>Your own Razorpay, optional</li></ul>
        <p class="h-hint">Try the demo. Nothing is sent anywhere.</p>
        <div class="h-demo" data-h-checkout>
          <label class="h-field"><span>PIN code</span><input inputmode="numeric" maxlength="6" placeholder="Example PIN 600001" autocomplete="off" data-h-pin aria-describedby="h-pin-out"></label>
          <p class="h-pin-out" id="h-pin-out" data-h-pin-out aria-live="polite">Type the example PIN 600001.</p>
          <div class="h-offer" role="group" aria-label="Sample offer type"><button type="button" class="is-on" data-h-offer="pct">10% off</button><button type="button" data-h-offer="fix">Rs. 150 off</button><button type="button" data-h-offer="none">No offer</button></div>
          <dl class="h-bill"><div><dt>Subtotal</dt><dd>Rs. 1,764.00</dd></div><div><dt>Offer</dt><dd data-h-out="disc">&minus; Rs. 176.40</dd></div><div class="h-bill-total"><dt>Pay on delivery</dt><dd data-h-out="total">Rs. 1,587.60</dd></div></dl>
          <p class="h-fine">Sample figures. Offers can be a percentage or a fixed amount.</p>
        </div>
      </div>
      <div class="h-co-visual m-reveal m-reveal-delay"><div class="h-phone h-phone-big">${img(M.checkout)}</div><div class="h-co-invoice"><div class="h-invoice">${img(M.invoice)}</div><span class="h-cap">GST invoice, sample. Credit notes too.</span></div></div>
    </div>
  </section>

  <section class="h-sec h-ops" id="business" aria-labelledby="h-ops-title">
    <div class="m-wrap">
      <div class="h-head h-head-wide m-reveal"><span class="m-kicker">After the order</span><h2 id="h-ops-title">Run the whole business from one desk.</h2></div>
      <p class="h-hint m-reveal">Flip through the desk. Sample data.</p>
      <div class="m-reveal">${desk}</div>
    </div>
  </section>

  <section class="h-sec h-connect" id="connections" aria-labelledby="h-conn-title">
    <div class="m-wrap">
      <div class="h-head h-head-wide m-reveal"><span class="m-kicker">When you are ready</span><h2 id="h-conn-title">Your domain. Your tracking. Your delivery.</h2></div>
      <p class="h-hint m-reveal">Try the domain steps and delivery options below.</p>
      <div class="h-conn-grid">
        <article class="h-conn h-conn-domain m-reveal" data-h-cycle data-h-labels="Domain added|Being checked|Secure connection ready|Live">
          <div class="h-mini h-mini-dom"><span class="h-lock" data-h-lock aria-hidden="true"></span><b>www.yourbrand.in</b><span class="h-chip" data-h-state>Domain added</span></div>
          <h3>Your own domain</h3>
          <ol class="h-flow h-flow-live" aria-label="Domain progress"><li class="is-done">Added</li><li>Checking</li><li>Secure</li><li>Live</li></ol>
          <button type="button" class="h-btn-line" data-h-cycle-next>Next step</button>
          <p class="h-fine">Secure browsing and checkout protection are prepared during activation. Checks can take a while. Your included address keeps working.</p>
        </article>
        <article class="h-conn m-reveal m-reveal-delay">
          <div class="h-evt h-evt-col" role="img" aria-label="Illustration: store events passed to your own Meta or Google account"><span>Product viewed</span><i aria-hidden="true"></i><span>Added to cart</span><i aria-hidden="true"></i><span class="is-end">Order confirmed</span></div>
          <h3>Meta and Google tracking</h3>
          <p class="h-fine">Use your Meta, Google Analytics and Google Ads details. With shopper permission, your store sends these events to your tools. Reports stay in your accounts.</p>
        </article>
        <article class="h-conn m-reveal" data-h-seg>
          <div class="h-mini h-mini-del"><span>Order 1042 (sample)</span><span class="h-chip is-ok" data-h-seg-out>You deliver it yourself</span></div>
          <h3>Delivery</h3>
          <div class="h-offer" role="group" aria-label="Delivery mode"><button type="button" class="is-on" data-h-seg-btn="You deliver it yourself">Manual</button><button type="button" data-h-seg-btn="Shiprocket, where set up for your brand">Shiprocket</button></div>
          <p class="h-fine">Shiprocket works where approved and configured.</p>
        </article>
      </div>
    </div>
  </section>

  <section class="h-sec h-grow" id="built-in" aria-labelledby="h-grow-title">
    <div class="m-wrap">
      <div class="h-head m-reveal"><h2 id="h-grow-title">Help and trust, built in.</h2></div>
      <ul class="h-strip">
        <li class="m-reveal"><b>Help before and after launch</b><span>Support tickets: Created, Pending or Closed. Emails when a request opens and closes.</span></li>
        <li class="m-reveal"><b>Team roles</b><span>Owner, admin or editor.</span></li>
        <li class="m-reveal"><b>Private documents</b><span>Seen only by you and our review team.</span></li>
        <li class="m-reveal"><b>Plan in Ann</b><span>Choose a plan as you build. <a href="/pricing">See pricing</a></span></li>
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
      <div><b>0%</b><span>Sales commission</span></div>
      <div><b>Yours.</b><span>Your domain, payments and customer data</span></div>
      <div><b>Always.</b><span>We never market to your customers.</span></div>
    </div>
  </section>

  <section class="h-sec h-launch" id="launch" aria-labelledby="h-launch-title">
    <div class="m-wrap">
      <div class="h-head h-head-wide m-reveal"><span class="m-kicker">Guided launch target</span><h2 id="h-launch-title">COD-ready in 30 minutes. Live in about an hour.</h2></div>
      <div class="h-lanes m-reveal" role="img" aria-label="Timeline: first 30 minutes to a COD-ready store, next 30 minutes optional Razorpay and domain setup">
        <div class="h-ticks" aria-hidden="true"><span>0 min</span><span>30 min</span><span>60 min</span></div>
        <div class="h-lane h-lane-a"><i></i><b>COD-ready store</b></div>
        <div class="h-lane h-lane-b"><i></i><b>Existing Razorpay and domain, optional</b></div>
      </div>
      <p class="h-qual m-reveal">A target, not a guarantee. It needs your products, images, business details and required checks ready, and publishing needs your business and GST checks. Connecting an existing Razorpay account and submitting your website or domain need Razorpay approval, which is not instant, and domain verification can take longer.</p>
      <div class="h-final-cta m-reveal"><a class="m-cta" href="${SIGNUP}">Start free</a><a class="m-text-link" href="${LOGIN}">Log in</a><a class="m-text-link" href="/pricing">See pricing</a></div>
      <p class="h-fine">Your free live period starts when you first publish. Help is available before you launch.</p>
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
    <div class="m-footer-bottom m-reveal m-reveal-delay"><span>LeBrandsSpace Digital Private Limited, Chennai.</span><span>© ${year} LeBrands.Store</span></div>
  </div>
</footer>`;
}

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[character]));
const money = (paise) => `₹${(Number(paise || 0) / 100).toLocaleString("en-IN")}`;

const styles = `<style>
@import url("https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=Playfair+Display:ital,wght@0,400;0,500;1,400&display=swap");
:root{color-scheme:light;--paper:#f2eee7;--paper-deep:#e9e1d7;--ink:#2f242b;--muted:#786d70;--line:#d7cbc3;--wine:#692b43;--clay:#a45846;--serif:"Playfair Display",Georgia,serif;--sans:"DM Sans",sans-serif}
*{box-sizing:border-box}html{scroll-behavior:smooth;scroll-padding-top:86px}body{margin:0;background:var(--paper);color:var(--ink);font:14px/1.65 var(--sans);-webkit-font-smoothing:antialiased}body,button,a{ -webkit-tap-highlight-color:transparent}a{color:inherit;text-decoration:none}button{font:inherit;color:inherit}img{display:block;width:100%;max-width:100%}.ps-wrap{width:min(1380px,calc(100% - 112px));margin:auto}
.ps-concept{min-height:34px;display:flex;justify-content:center;align-items:center;padding:7px 18px;background:var(--wine);color:#f5eee6;text-align:center;font-size:10px;letter-spacing:.08em}
.ps-header{position:sticky;top:0;z-index:20;background:rgba(242,238,231,.95);backdrop-filter:blur(16px);border-bottom:1px solid rgba(105,43,67,.11)}.ps-nav{height:79px;display:grid;grid-template-columns:1fr auto 1fr;align-items:center}.ps-mark{font:500 25px/1 var(--serif);letter-spacing:-.045em}.ps-mark span{color:var(--clay);font-style:italic}.ps-nav-links{display:flex;gap:38px;align-items:center}.ps-nav-links a,.ps-bag{font-size:10px;text-transform:uppercase;letter-spacing:.12em}.ps-nav-links a{transition:color .2s}.ps-nav-links a:hover{color:var(--clay)}.ps-bag{justify-self:end;display:flex;align-items:center;gap:10px;border:0;background:none;cursor:pointer}.ps-bag-count{display:grid;place-items:center;width:24px;height:24px;border:1px solid var(--line);border-radius:50%;font-size:9px}
.ps-hero{min-height:660px;display:grid;grid-template-columns:.85fr 1.15fr;background:#e6ddd3}.ps-hero-copy{padding:clamp(60px,9vw,145px) 5vw clamp(50px,7vw,108px) max(56px,calc((100vw - 1380px)/2));display:flex;flex-direction:column;justify-content:center;align-items:flex-start}.ps-kicker{margin:0 0 23px;color:var(--clay);font-size:9px;letter-spacing:.2em;text-transform:uppercase}.ps-hero h1{max-width:550px;margin:0;font:400 clamp(58px,7.2vw,105px)/.98 var(--serif);letter-spacing:-.065em}.ps-hero h1 em{color:var(--wine);font-weight:400}.ps-hero-copy>p:not(.ps-kicker){max-width:370px;margin:27px 0 0;color:#655a5c;font-size:13px;line-height:1.9}.ps-cta{min-height:49px;margin-top:33px;padding:0 23px;display:inline-flex;align-items:center;justify-content:center;gap:20px;background:var(--wine);color:#f6efe8;font-size:10px;letter-spacing:.14em;text-transform:uppercase;transition:background .2s,transform .2s}.ps-cta:hover{background:#853a57;transform:translateY(-2px)}.ps-hero-photo{position:relative;min-height:590px;overflow:hidden;background:#c9bdb1}.ps-hero-photo img{position:absolute;inset:0;height:100%;object-fit:cover;object-position:center 48%}.ps-photo-index{position:absolute;right:27px;bottom:24px;padding:8px 11px;background:rgba(242,238,231,.9);color:var(--wine);font-size:9px;letter-spacing:.12em;text-transform:uppercase}
.ps-note{padding:17px 25px;border-top:1px solid rgba(105,43,67,.12);border-bottom:1px solid rgba(105,43,67,.12);text-align:center;color:#75696a;font-size:9px;letter-spacing:.17em;text-transform:uppercase}.ps-intro{padding:clamp(100px,14vw,200px) 0;text-align:center}.ps-intro .ps-kicker{margin-bottom:27px}.ps-intro h2{max-width:900px;margin:0 auto;font:400 clamp(39px,6vw,78px)/1.08 var(--serif);letter-spacing:-.055em}.ps-intro h2 em{color:var(--wine)}.ps-intro p:last-child{max-width:460px;margin:27px auto 0;color:var(--muted);font-size:12px;line-height:1.9}
.ps-collection{padding:54px 0 145px}.ps-section-head{display:flex;align-items:end;justify-content:space-between;gap:30px;padding-bottom:24px;border-bottom:1px solid var(--line)}.ps-section-head h2{margin:0;font:400 clamp(42px,5.6vw,69px)/1 var(--serif);letter-spacing:-.055em}.ps-section-head p{max-width:270px;margin:0;color:var(--muted);font-size:11px;line-height:1.7}.ps-filters{display:flex;gap:24px;align-items:center;padding:21px 0 29px}.ps-filter{padding:0 0 5px;border:0;border-bottom:1px solid transparent;background:none;color:#7d7173;font-size:9px;letter-spacing:.11em;text-transform:uppercase;cursor:pointer}.ps-filter:hover,.ps-filter.is-active{border-color:var(--wine);color:var(--wine)}.ps-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:48px 22px}.ps-product{min-width:0}.ps-product-image{position:relative;overflow:hidden;aspect-ratio:.81;background:#e5dbd1}.ps-product-image img{height:100%;object-fit:cover;transition:transform .75s cubic-bezier(.2,.7,.2,1)}.ps-product:hover .ps-product-image img{transform:scale(1.035)}.ps-product-tag{position:absolute;top:13px;left:13px;padding:6px 8px;background:rgba(242,238,231,.9);font-size:8px;letter-spacing:.12em;text-transform:uppercase}.ps-product-body{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding-top:13px}.ps-product-title{margin:0;font:400 17px/1.3 var(--serif)}.ps-product-meta{margin:4px 0 0;color:var(--muted);font-size:10px}.ps-product-price{flex:none;padding-top:1px;font-size:11px}.ps-product-actions{display:flex;gap:17px;margin-top:14px}.ps-product-actions button{padding:0 0 4px;border:0;border-bottom:1px solid var(--line);background:none;font-size:9px;letter-spacing:.08em;text-transform:uppercase;cursor:pointer}.ps-product-actions button:hover{color:var(--clay);border-color:var(--clay)}
.ps-story{display:grid;grid-template-columns:1fr .82fr;min-height:570px;background:var(--wine);color:#f4eee6}.ps-story-image{min-height:520px;overflow:hidden}.ps-story-image img{height:100%;min-height:520px;object-fit:cover}.ps-story-copy{align-self:center;max-width:560px;padding:75px clamp(45px,8vw,130px)}.ps-story-copy .ps-kicker{color:#d8a08a}.ps-story-copy h2{margin:0;font:400 clamp(43px,5.1vw,68px)/1.05 var(--serif);letter-spacing:-.05em}.ps-story-copy p:not(.ps-kicker){margin:22px 0 0;color:rgba(244,238,230,.75);font-size:12px;line-height:1.9}.ps-story-copy a{display:inline-flex;margin-top:29px;padding-bottom:5px;border-bottom:1px solid rgba(244,238,230,.6);font-size:9px;letter-spacing:.14em;text-transform:uppercase;transition:color .2s}.ps-story-copy a:hover{color:#d8a08a}
.ps-studio{padding:145px 0 156px}.ps-studio-grid{display:grid;grid-template-columns:.75fr 1.25fr;align-items:center;gap:11vw}.ps-studio-copy h2{margin:0;font:400 clamp(44px,5.5vw,74px)/1.03 var(--serif);letter-spacing:-.055em}.ps-studio-copy>p:not(.ps-kicker){max-width:365px;color:var(--muted);font-size:12px;line-height:1.9}.ps-studio-photo{height:clamp(350px,49vw,650px);overflow:hidden;background:#ddd0c5}.ps-studio-photo img{height:100%;object-fit:cover}.ps-studio-caption{margin:12px 0 0;color:var(--muted);font-size:9px;letter-spacing:.08em;text-transform:uppercase}
.ps-footer{padding:45px 0 38px;background:#281e23;color:#efe8df}.ps-footer-top{display:flex;justify-content:space-between;gap:30px;align-items:center}.ps-footer .ps-mark span{color:#d69a81}.ps-footer-links{display:flex;gap:25px}.ps-footer-links a{color:rgba(239,232,223,.75);font-size:9px;letter-spacing:.12em;text-transform:uppercase}.ps-footer-links a:hover{color:#d69a81}.ps-footer-bottom{display:flex;justify-content:space-between;gap:25px;margin-top:34px;padding-top:18px;border-top:1px solid rgba(239,232,223,.17);color:rgba(239,232,223,.48);font-size:9px}
.ps-dialog{width:min(860px,calc(100% - 28px));max-height:min(90dvh,760px);padding:0;border:0;background:var(--paper);color:var(--ink);box-shadow:0 24px 90px rgba(32,18,25,.32)}.ps-dialog::backdrop{background:rgba(32,18,25,.65);backdrop-filter:blur(4px)}.ps-dialog-inner{display:grid;grid-template-columns:1fr 1fr;min-height:500px}.ps-dialog-image{min-height:500px;background:#e4dad0}.ps-dialog-image img{height:100%;object-fit:cover}.ps-dialog-copy{position:relative;align-self:center;padding:55px}.ps-dialog-close{position:absolute;top:16px;right:17px;width:34px;height:34px;border:1px solid var(--line);border-radius:50%;background:none;cursor:pointer}.ps-dialog-copy h2{margin:0;font:400 40px/1.08 var(--serif)}.ps-dialog-copy p{color:var(--muted);font-size:12px}.ps-size-label{display:block;margin:24px 0 8px;font-size:9px;letter-spacing:.12em;text-transform:uppercase}.ps-sizes{display:flex;gap:8px}.ps-size{min-width:38px;height:38px;border:1px solid var(--line);background:transparent;font-size:10px;cursor:pointer}.ps-size.is-selected{border-color:var(--wine);background:var(--wine);color:#fff}.ps-dialog-copy .ps-cta{width:100%;border:0;cursor:pointer}.ps-toast{position:fixed;z-index:50;right:24px;bottom:24px;max-width:min(360px,calc(100% - 48px));padding:14px 18px;background:#2e242b;color:#f2eee7;box-shadow:0 8px 35px rgba(40,20,30,.2);font-size:11px;opacity:0;transform:translateY(12px);pointer-events:none;transition:opacity .22s,transform .22s}.ps-toast.is-visible{opacity:1;transform:translateY(0)}.ps-empty{padding:36px;border:1px solid var(--line);text-align:center;color:var(--muted)}
.ps-reveal{opacity:1;transform:none}.ps-motion .ps-reveal{opacity:0;transform:translateY(18px);transition:opacity .75s ease,transform .75s cubic-bezier(.2,.7,.2,1)}.ps-motion .ps-reveal.is-visible{opacity:1;transform:translateY(0)}.ps-motion .ps-product:nth-child(3n+2){transition-delay:.08s}.ps-motion .ps-product:nth-child(3n){transition-delay:.16s}
:focus-visible{outline:2px solid var(--clay);outline-offset:4px}
@media(max-width:900px){.ps-wrap{width:calc(100% - 64px)}.ps-hero{grid-template-columns:.88fr 1.12fr;min-height:560px}.ps-hero-copy{padding-left:32px;padding-right:25px}.ps-hero-photo{min-height:560px}.ps-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:36px 20px}.ps-story{grid-template-columns:1fr 1fr}.ps-story-copy{padding:48px}.ps-studio-grid{gap:7vw}}
@media(max-width:640px){html{scroll-padding-top:69px}.ps-wrap{width:calc(100% - 40px)}.ps-concept{font-size:8px;letter-spacing:.045em}.ps-nav{height:66px;grid-template-columns:1fr auto}.ps-mark{font-size:22px}.ps-nav-links{position:absolute;left:0;right:0;top:66px;display:none;align-items:stretch;gap:0;padding:6px 20px 15px;background:var(--paper);border-bottom:1px solid var(--line)}.ps-nav-links.is-open{display:flex;flex-direction:column}.ps-nav-links a{padding:13px 0;border-bottom:1px solid var(--line)}.ps-menu{display:block;justify-self:end;margin-right:15px;border:0;background:none;font-size:9px;letter-spacing:.13em;text-transform:uppercase;cursor:pointer}.ps-bag{grid-column:2;grid-row:1}.ps-hero{display:flex;flex-direction:column-reverse;min-height:0}.ps-hero-photo{width:100%;min-height:0;aspect-ratio:.91}.ps-hero-photo img{object-position:center 43%}.ps-hero-copy{width:100%;padding:39px 22px 49px}.ps-hero h1{max-width:450px;font-size:clamp(57px,15vw,79px)}.ps-hero-copy>p:not(.ps-kicker){margin-top:18px;font-size:12px}.ps-cta{margin-top:23px}.ps-photo-index{right:12px;bottom:12px}.ps-note{padding:13px 20px;font-size:8px;line-height:1.7}.ps-intro{padding:95px 0 106px}.ps-intro h2{font-size:clamp(40px,11vw,55px)}.ps-intro p:last-child{font-size:11px}.ps-collection{padding:25px 0 99px}.ps-section-head{display:block}.ps-section-head h2{font-size:48px}.ps-section-head p{margin-top:12px}.ps-filters{gap:17px;overflow-x:auto}.ps-filter{flex:none;font-size:8px}.ps-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:27px 12px}.ps-product-image{aspect-ratio:.73}.ps-product-title{font-size:14px}.ps-product-meta{font-size:9px}.ps-product-price{font-size:10px}.ps-product-actions{gap:11px;flex-wrap:wrap}.ps-product-actions button{font-size:8px}.ps-story{grid-template-columns:1fr}.ps-story-image{min-height:0;aspect-ratio:.93}.ps-story-image img{min-height:0}.ps-story-copy{padding:48px 28px 55px}.ps-story-copy h2{font-size:51px}.ps-studio{padding:96px 0 105px}.ps-studio-grid{grid-template-columns:1fr;gap:29px}.ps-studio-copy h2{max-width:430px;font-size:54px}.ps-studio-photo{height:auto;aspect-ratio:.86}.ps-footer-top,.ps-footer-bottom{align-items:flex-start;flex-direction:column}.ps-footer-links{flex-wrap:wrap;gap:15px 20px}.ps-footer-bottom{gap:8px}.ps-dialog-inner{grid-template-columns:1fr}.ps-dialog-image{min-height:0;height:45vh}.ps-dialog-copy{padding:34px 25px}.ps-dialog-copy h2{font-size:33px}.ps-toast{right:12px;bottom:12px}.ps-motion .ps-product:nth-child(n){transition-delay:0s}}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}*,*::before,*::after{scroll-behavior:auto!important;animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}.ps-reveal{opacity:1;transform:none}}
</style>`;

function productCard(product, index) {
  const slug = product.slug;
  const group = ["kurta", "dress"].some((word) => slug.includes(word)) ? "occasion" :
    slug.includes("trousers") ? "bottoms" : "layers";
  const image = `/__example-media/${slug}.webp`;
  const alt = `Generated fictional Example Studio ${product.title} apparel photograph`;
  return `<article class="ps-product ps-reveal" data-category="${group}">
    <div class="ps-product-image"><img src="${image}" width="900" height="1120" loading="lazy" alt="${esc(alt)}"><span class="ps-product-tag">${index < 2 ? "Studio essential" : "Small batch"}</span></div>
    <div class="ps-product-body"><div><h3 class="ps-product-title">${esc(product.title)}</h3><p class="ps-product-meta">Hand-finished cotton · Chennai</p></div><span class="ps-product-price">${money(product.price_paise)}</span></div>
    <div class="ps-product-actions"><button type="button" data-open-product="${esc(product.id)}">View details</button><button type="button" data-add-product="${esc(product.id)}">Add to bag</button></div>
  </article>`;
}

export function renderPremiumStore(data) {
  const products = Array.isArray(data?.products) ? data.products : [];
  const productCards = products.map(productCard).join("");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow"><meta name="theme-color" content="#692b43">
<title>Example Studio | Clothing store concept</title>
<meta name="description" content="A fictional Example Studio clothing storefront concept by LeBrands.Store.">
<style>.ps-menu{display:none}</style>${styles}<script src="/__example-module/premium-example-client.js" defer></script></head>
<body>
<p class="ps-concept" role="status">A fictional Example Studio store concept. Photography and products are for demonstration only.</p>
<header class="ps-header"><nav class="ps-nav ps-wrap" aria-label="Main navigation">
  <a class="ps-mark" href="#top" aria-label="Example Studio home">Example <span>Studio</span></a>
  <button class="ps-menu" type="button" aria-expanded="false" aria-controls="ps-links" data-menu-toggle>Menu</button>
  <div class="ps-nav-links" id="ps-links"><a href="#collection">Collection</a><a href="#approach">Our approach</a><a href="#studio">The studio</a></div>
  <a class="ps-bag" href="/__example-preview/premium-checkout" aria-label="Go to preview checkout">Bag <span class="ps-bag-count" data-bag-count>0</span></a>
</nav></header>
<main id="top">
  <section class="ps-hero" aria-labelledby="ps-title">
    <div class="ps-hero-copy ps-reveal"><p class="ps-kicker">A study in everyday form · Chennai, India</p>
      <h1 id="ps-title">Wear a little <em>less noise.</em></h1>
      <p>Clothes made to stay in your life. Considered cotton, generous lines and colour drawn from the quiet hours of the day.</p>
      <a class="ps-cta" href="#collection">Discover the collection <span aria-hidden="true">↘</span></a>
    </div>
    <div class="ps-hero-photo"><img src="/img/REPLACE-example-lookbook-wide.webp" width="1024" height="1024" fetchpriority="high" alt="Original fictional Example Studio editorial, a woman in a plum cotton dress in a sunlit Chennai courtyard"><span class="ps-photo-index">01 / The soft structure edit</span></div>
  </section>
  <p class="ps-note">Small runs · Thoughtful cloth · Made for the long view</p>
  <section class="ps-intro ps-wrap ps-reveal" id="approach"><p class="ps-kicker">The Example Studio point of view</p>
    <h2>Ease is not an afterthought.<br>It is the <em>whole intention.</em></h2>
    <p>Our fictional collection begins with the way a garment falls, folds and finds its place in an ordinary day. Nothing louder than it needs to be.</p>
  </section>
  <section class="ps-collection ps-wrap" id="collection" aria-labelledby="collection-title">
    <div class="ps-section-head ps-reveal"><div><p class="ps-kicker">The first collection</p><h2 id="collection-title">Pieces to keep.</h2></div><p>Six imagined wardrobe anchors, made in a palette that gets along with everything.</p></div>
    <div class="ps-filters" aria-label="Filter products">
      <button class="ps-filter is-active" type="button" data-filter="all" aria-pressed="true">All pieces</button>
      <button class="ps-filter" type="button" data-filter="layers" aria-pressed="false">Shirts & layers</button>
      <button class="ps-filter" type="button" data-filter="occasion" aria-pressed="false">Kurtas</button>
      <button class="ps-filter" type="button" data-filter="bottoms" aria-pressed="false">Trousers</button>
    </div>
    <div class="ps-grid">${productCards || '<p class="ps-empty">The collection is being prepared.</p>'}</div>
  </section>
  <section class="ps-story" aria-label="A quieter way to get dressed">
    <div class="ps-story-image"><img src="/img/REPLACE-example-lookbook-portrait.webp" width="1024" height="1024" loading="lazy" alt="Original fictional Example Studio editorial, charcoal handwoven jacket in a shadowed textile gallery"></div>
    <div class="ps-story-copy ps-reveal"><p class="ps-kicker">Cloth, in its own time</p><h2>Texture before ornament.</h2>
      <p>A close weave. A sure seam. A pocket that is exactly where your hand expects it. We imagine clothes with their own quiet point of view.</p>
      <a href="#collection">Explore the considered edit</a>
    </div>
  </section>
  <section class="ps-studio ps-wrap" id="studio">
    <div class="ps-studio-grid">
      <div class="ps-studio-copy ps-reveal"><p class="ps-kicker">A note from the studio</p><h2>Made for the spaces between plans.</h2>
        <p>From first coffee to the last light, these are pieces that take the day as it comes. Example Studio is a fictional label made to show what an independent LeBrands storefront can feel like.</p>
        <a class="ps-cta" href="#collection">Find your piece <span aria-hidden="true">↗</span></a>
      </div>
      <figure><div class="ps-studio-photo"><img src="/__example-media/indigo-kurta.webp" width="900" height="1120" loading="lazy" alt="Generated fictional Example Studio indigo cotton kurta product photograph"></div><figcaption class="ps-studio-caption">Example Studio concept photography · collection 01</figcaption></figure>
    </div>
  </section>
</main>
<footer class="ps-footer"><div class="ps-wrap"><div class="ps-footer-top"><a class="ps-mark" href="#top">Example <span>Studio</span></a><nav class="ps-footer-links" aria-label="Store footer"><a href="#collection">Collection</a><a href="#approach">Our approach</a><a href="#top">Back to top</a></nav></div>
  <div class="ps-footer-bottom"><span>Fictional storefront concept by LeBrands.Store. No orders or accounts are created.</span><span>Made for a more considered everyday.</span></div>
</div></footer>
<dialog class="ps-dialog" data-product-dialog aria-labelledby="ps-dialog-title"><div class="ps-dialog-inner">
  <div class="ps-dialog-image"><img data-dialog-image alt=""></div>
  <div class="ps-dialog-copy"><button class="ps-dialog-close" type="button" aria-label="Close product details" data-dialog-close>×</button><p class="ps-kicker">A considered essential</p><h2 id="ps-dialog-title"></h2><p data-dialog-price></p><p>Soft woven cotton, cut with room to move. A fictional Example Studio piece for everyday dressing.</p>
    <label class="ps-size-label" for="ps-size">Choose a size</label><select id="ps-size" data-size-select><option value="S">Small</option><option value="M" selected>Medium</option><option value="L">Large</option><option value="XL">Extra large</option></select>
    <button type="button" class="ps-cta" data-dialog-add>Add to preview bag</button>
  </div>
</div></dialog><p class="ps-toast" role="status" aria-live="polite" data-toast></p>
</body></html>`;
}

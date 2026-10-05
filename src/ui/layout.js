export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
}

export function layout({ title, description, canonical, body, noindex = false, extraHead = "" }) {
  const safeTitle = escapeHtml(title);
  const safeDescription = escapeHtml(description);
  const safeCanonical = escapeHtml(canonical);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${safeTitle}</title>
  <meta name="description" content="${safeDescription}">
  ${noindex ? '<meta name="robots" content="noindex,nofollow">' : '<meta name="robots" content="index,follow">'}
  <link rel="canonical" href="${safeCanonical}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="LeBrands.Store">
  <meta property="og:title" content="${safeTitle}">
  <meta property="og:description" content="${safeDescription}">
  <meta property="og:url" content="${safeCanonical}">
  <meta name="theme-color" content="#f6f0e6">
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Fraunces:opsz,wght@9..144,500;9..144,600&display=swap" rel="stylesheet">
  <style>
    :root{color-scheme:light;--paper:#f6f0e6;--paper-2:#eee5d7;--ink:#203e34;--muted:#617168;--line:#d8d1c4;--green:#214a3d;--green-dark:#17382f;--lime:#dce7af;--coral:#df876c;--sun:#f0ca79;--white:#fffcf5;--serif:"Fraunces",Georgia,serif;--sans:"DM Sans",sans-serif}
    *{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--sans);font-size:15px;line-height:1.55}a{color:inherit}button,input{font:inherit}button,a{-webkit-tap-highlight-color:transparent}.wrap{width:min(1160px,calc(100% - 48px));margin-inline:auto}.site-header{height:82px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(32,62,52,.12)}.brandmark{display:inline-flex;align-items:center;gap:11px;text-decoration:none;font-weight:700;font-size:17px;letter-spacing:-.04em}.brandmark svg{width:36px;height:36px;flex:none}.brandmark small{font-size:9px;display:block;letter-spacing:.18em;text-transform:uppercase;color:var(--muted);line-height:1.1;font-weight:600}.nav{display:flex;align-items:center;gap:28px}.nav a{text-decoration:none;font-size:13px;font-weight:600}.nav a:hover,.text-link:hover{color:#a75138}.nav .nav-login{padding:10px 16px;border:1px solid var(--line);border-radius:999px}.button{display:inline-flex;align-items:center;justify-content:center;gap:10px;min-height:48px;padding:0 21px;border:1px solid transparent;border-radius:3px;background:var(--green);color:#fffaf0;text-decoration:none;font-size:13px;font-weight:700;letter-spacing:.01em;transition:transform .2s ease,background .2s ease,opacity .2s ease;cursor:pointer}.button:hover{transform:translateY(-2px);background:var(--green-dark)}.button:focus-visible,a:focus-visible,input:focus-visible,button:focus-visible{outline:3px solid var(--coral);outline-offset:3px}.button-outline{background:transparent;color:var(--ink);border-color:var(--line)}.button-outline:hover{color:var(--white);border-color:var(--green)}.button[disabled]{opacity:.45;cursor:not-allowed;transform:none}.eyebrow{display:flex;align-items:center;gap:10px;text-transform:uppercase;letter-spacing:.16em;font-size:10px;font-weight:700;color:var(--muted)}.eyebrow:before{content:"";width:23px;height:1px;background:var(--coral)}.section-pad{padding:104px 0}.section-heading{max-width:660px;margin:0 0 45px}.section-heading h2{font:500 clamp(37px,5vw,60px)/1.04 var(--serif);letter-spacing:-.045em;margin:17px 0}.section-heading p{color:var(--muted);max-width:510px;margin:0;font-size:15px}.site-footer{background:var(--green-dark);color:#f5f0e7;padding:40px 0}.footer-inner{display:flex;justify-content:space-between;align-items:center;gap:28px}.footer-meta{font-size:12px;color:#c1c9bd}.footer-links{display:flex;gap:22px;flex-wrap:wrap}.footer-links a{font-size:12px;color:#f5f0e7;text-decoration:none}.footer-links a:hover{text-decoration:underline}.form-control{display:grid;gap:7px;margin-bottom:16px}.form-control label{font-size:12px;font-weight:700}.form-control input{width:100%;height:48px;border:1px solid #cfc7b9;background:#fffdf8;color:var(--ink);padding:0 13px;border-radius:3px}.form-control input::placeholder{color:#98a097}.form-help{font-size:11px;color:var(--muted)}.form-alert{padding:13px 15px;background:#fae5dc;color:#743d30;border-left:3px solid var(--coral);font-size:13px;margin-bottom:20px}.form-notice{padding:13px 15px;background:#e8edd6;color:#36553b;border-left:3px solid #879954;font-size:13px;margin-bottom:20px}.auth-shell{min-height:calc(100dvh - 82px);display:grid;grid-template-columns:.88fr 1.12fr;gap:7vw;align-items:center;padding:70px 0 92px}.auth-intro{max-width:410px}.auth-intro h1{font:500 clamp(44px,6vw,72px)/.99 var(--serif);letter-spacing:-.05em;margin:21px 0}.auth-intro p{color:var(--muted);font-size:15px;max-width:350px}.auth-stamp{display:inline-flex;align-items:center;gap:12px;margin-top:32px;padding-top:18px;border-top:1px solid var(--line);font-size:11px;color:var(--muted);letter-spacing:.06em}.auth-stamp svg{width:32px;height:32px}.auth-card{background:var(--white);padding:clamp(26px,4vw,44px);border:1px solid #e5ded2;box-shadow:0 18px 60px rgba(55,58,42,.06);max-width:490px;width:100%;justify-self:end}.auth-card h2{font:500 31px/1.1 var(--serif);letter-spacing:-.03em;margin:0 0 9px}.auth-card>p{font-size:13px;color:var(--muted);margin:0 0 25px}.auth-card form .button{width:100%;margin-top:4px}.auth-card .form-control{margin-bottom:15px}.auth-card .form-control input{height:47px}.form-foot{font-size:12px;color:var(--muted);margin-top:19px;text-align:center}.form-foot a,.inline-link{color:var(--green);font-weight:700;text-decoration:underline;text-underline-offset:3px}.checkbox-row{display:flex;gap:10px;align-items:flex-start;margin:18px 0;font-size:12px;color:var(--muted)}.checkbox-row input{accent-color:var(--green);margin-top:3px}.account-header{background:var(--paper);position:relative;z-index:1}.dashboard-main{padding:68px 0 110px;min-height:calc(100dvh - 82px)}.dashboard-title{display:flex;justify-content:space-between;align-items:flex-end;gap:24px;margin-bottom:38px}.dashboard-title h1{font:500 clamp(42px,5vw,60px)/1 var(--serif);letter-spacing:-.05em;margin:14px 0 0}.dashboard-title p{color:var(--muted);margin:11px 0 0}.dashboard-actions{display:flex;align-items:center;gap:18px}.quiet-button{border:0;background:none;color:var(--ink);font-size:12px;font-weight:700;text-decoration:underline;text-underline-offset:3px;cursor:pointer}.store-list{border-top:1px solid var(--line)}.store-row{display:grid;grid-template-columns:1fr auto auto;gap:28px;align-items:center;padding:25px 0;border-bottom:1px solid var(--line)}.store-name{font:500 24px/1.15 var(--serif)}.store-url{font-size:12px;color:var(--muted);margin-top:4px}.status-pill{padding:6px 10px;border-radius:99px;background:#e8ead7;color:#53613e;text-transform:capitalize;font-size:10px;font-weight:700;letter-spacing:.05em}.store-role{font-size:11px;color:var(--muted);text-align:right}.empty-card{padding:56px 20px;text-align:center;border:1px dashed #b9c1a4;background:#f1eedf}.empty-mark{width:54px;height:54px;border:1px solid #bac39e;border-radius:50%;display:grid;place-items:center;margin:0 auto 17px;color:var(--green);font:500 28px var(--serif)}.empty-card h2{font:500 30px var(--serif);margin:0 0 8px}.empty-card p{color:var(--muted);margin:0 auto 22px;max-width:340px;font-size:13px}.subdomain-wrap{display:flex;align-items:stretch}.subdomain-wrap input{border-radius:3px 0 0 3px!important;min-width:0}.subdomain-suffix{display:flex;align-items:center;white-space:nowrap;padding:0 12px;background:#eee9dc;border:1px solid #cfc7b9;border-left:0;border-radius:0 3px 3px 0;font-size:11px;color:var(--muted)}.availability{min-height:20px;font-size:11px;color:var(--muted)}.availability[data-state="available"]{color:#486a3e}.availability[data-state="unavailable"],.availability[data-state="error"]{color:#a24d37}.legal-page{max-width:760px;padding:90px 0 120px;min-height:calc(100dvh - 200px)}.legal-page h1{font:500 clamp(48px,7vw,78px)/1 var(--serif);letter-spacing:-.05em;margin:20px 0}.draft-tag{display:inline-block;padding:7px 10px;background:#efdfba;color:#755a27;font-size:10px;letter-spacing:.12em;text-transform:uppercase;font-weight:700}.legal-page p{color:var(--muted);font-size:15px;max-width:600px}.error-code{font:500 13px var(--sans);letter-spacing:.15em;color:#a34d37;text-transform:uppercase}.error-actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:24px}
    @media(max-width:760px){.wrap{width:min(100% - 36px,560px)}.site-header{height:70px}.nav{gap:15px}.nav a{font-size:12px}.nav .nav-login{padding:8px 12px}.auth-shell{grid-template-columns:1fr;gap:30px;align-items:start;padding:48px 0 68px;min-height:calc(100dvh - 70px)}.auth-intro{max-width:520px}.auth-intro h1{font-size:51px;max-width:440px}.auth-stamp{margin-top:18px}.auth-card{justify-self:stretch;max-width:none}.dashboard-main{padding:46px 0 80px;min-height:calc(100dvh - 70px)}.dashboard-title{align-items:flex-start;flex-direction:column}.dashboard-actions{width:100%;justify-content:space-between}.store-row{grid-template-columns:1fr auto;gap:14px}.store-role{grid-column:1/-1;text-align:left}.footer-inner{align-items:flex-start;flex-direction:column}.section-pad{padding:72px 0}}
    @media(max-width:430px){.wrap{width:calc(100% - 30px)}.brandmark{font-size:15px}.nav{gap:11px}.nav a{font-size:11px}.nav a[href="#how"]{display:none}.auth-intro h1{font-size:45px}.auth-card{padding:25px 20px}.subdomain-suffix{padding:0 8px;font-size:10px}}
    @media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}*,*::before,*::after{transition:none!important;animation:none!important}}
  </style>
  ${extraHead}
</head>
<body>${body}</body>
</html>`;
}

export function brandMark() {
  return `<a class="brandmark" href="https://lebrands.store" aria-label="LeBrands.Store home">
    <svg viewBox="0 0 48 48" aria-hidden="true"><rect width="48" height="48" rx="14" fill="#214a3d"/><path d="M14 14h6v15h15v6H14z" fill="#f0ca79"/><circle cx="35" cy="16" r="2.5" fill="#df876c"/></svg>
    <span>LeBrands<small>store</small></span>
  </a>`;
}

export function footer() {
  return `<footer class="site-footer"><div class="wrap footer-inner">
    <div class="footer-meta">© ${new Date().getFullYear()} LeBrandsSpace Digital Private Limited</div>
    <nav class="footer-links" aria-label="Footer">
      <a href="https://lebrands.store/terms">Terms</a><a href="https://lebrands.store/privacy">Privacy</a>
      <a href="https://lebrands.store/contact">Contact</a><a href="mailto:support@lebrands.store">Support</a>
    </nav>
  </div></footer>`;
}

export function accountHeader(user) {
  return `<header class="account-header"><div class="wrap site-header">${brandMark()}<nav class="nav" aria-label="Account navigation">
    <a href="https://lebrands.store">About LeBrands</a>${user ? `<span>${escapeHtml(user.name || user.email)}</span><form method="post" action="/logout"><button class="quiet-button" type="submit">Sign out</button></form>` : '<a class="nav-login" href="/login">Sign in</a>'}
  </nav></div></header>`;
}


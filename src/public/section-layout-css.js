/** Theme-inspired structural adaptations for added sections. Scoped, colours and fonts inherited. */
const S = id => `.lb-section[data-section-layout="${id}"]`;
export const SECTION_LAYOUT_CSS = `
${S("editorial")}{padding-block:clamp(40px,8vw,104px)}
${S("editorial")} h2{font-size:clamp(30px,5vw,60px);font-weight:500;line-height:1.02;letter-spacing:-.035em;max-width:16ch}
${S("editorial")} .lb-split{grid-template-columns:1.5fr 1fr;gap:clamp(24px,5vw,72px);align-items:end}
${S("editorial")} .lb-grid{grid-template-columns:repeat(3,minmax(0,1fr));gap:32px 24px}
${S("editorial")} .lb-grid>:first-child{grid-column:span 2;grid-row:span 2}
${S("editorial")} .lb-grid>:first-child img{height:clamp(320px,46vw,640px)}
${S("editorial")} .lb-link{border-width:0 0 1px;padding:4px 0}
${S("boutique")}{text-align:center}
${S("boutique")} p{margin-inline:auto}
${S("boutique")} .lb-split{grid-template-columns:5fr 6fr;gap:36px;text-align:left}
${S("boutique")} .lb-photo,${S("boutique")} .lb-grid img{border-radius:18px}
${S("boutique")} .lb-grid{gap:22px;text-align:left}
${S("boutique")} .lb-grid>a,${S("boutique")} .lb-grid>blockquote{padding:10px 10px 14px;border-radius:20px;background:color-mix(in srgb,currentColor 5%,transparent)}
${S("boutique")} .lb-link{border-radius:999px;padding:11px 24px}
${S("architectural")}{border-top:3px solid currentColor;border-bottom:3px solid currentColor}
${S("architectural")} h2{text-transform:uppercase;letter-spacing:-.01em;font-weight:800;font-size:clamp(26px,4.4vw,56px)}
${S("architectural")} .lb-split{grid-template-columns:1fr 1fr;gap:0;border:2px solid currentColor;align-items:stretch}
${S("architectural")} .lb-split>.lb-photo{order:2;border-left:2px solid currentColor}
${S("architectural")} .lb-split>div:not(.lb-photo){padding:clamp(18px,4vw,48px)}
${S("architectural")} .lb-grid{gap:0;border:2px solid currentColor}
${S("architectural")} .lb-grid>*{border-right:2px solid currentColor;border-bottom:2px solid currentColor;padding:12px;margin:0 -2px -2px 0}
${S("architectural")} .lb-link{border-width:2px;border-radius:0;text-transform:uppercase;font-weight:700;letter-spacing:.06em}
${S("minimal")}{padding-block:clamp(56px,10vw,128px);border-bottom:0}
${S("minimal")} h2{font-size:clamp(18px,2vw,24px);font-weight:400;letter-spacing:0;margin-bottom:32px}
${S("minimal")} .lb-split{grid-template-columns:1fr;gap:24px;max-width:640px;margin-inline:auto}
${S("minimal")} .lb-grid{gap:56px 40px;grid-template-columns:repeat(auto-fit,minmax(min(100%,180px),1fr))}
${S("minimal")} .lb-grid img{height:220px}
${S("minimal")} .lb-photo,${S("minimal")} .lb-grid img{filter:grayscale(.15)}
${S("minimal")} .lb-link{border:0;border-bottom:1px solid currentColor;padding:2px 0}
${S("minimal")} p{opacity:.85}
${S("vintage")}{text-align:center}
${S("vintage")} h2{font-style:italic;font-weight:500;letter-spacing:0}
${S("vintage")} h2::after{content:"";display:block;width:64px;height:0;border-top:3px double currentColor;margin:14px auto 0}
${S("vintage")} p{margin-inline:auto}
${S("vintage")} .lb-split{grid-template-columns:1fr 1fr;border:1px solid currentColor;outline:1px solid currentColor;outline-offset:-7px;padding:clamp(16px,3vw,32px);text-align:center}
${S("vintage")} .lb-photo{padding:8px;border:1px solid currentColor;background:transparent}
${S("vintage")} .lb-grid>*{padding:10px;border:1px solid color-mix(in srgb,currentColor 40%,transparent)}
${S("vintage")} dl>div{border-bottom-style:dotted}
${S("vintage")} .lb-link{border-style:double;border-width:3px}
${S("social-pop")} h2{font-weight:800;letter-spacing:-.03em;transform:rotate(-1deg);transform-origin:left}
${S("social-pop")} .lb-split{gap:28px;grid-template-columns:1fr 1fr}
${S("social-pop")} .lb-photo{border:3px solid currentColor;border-radius:22px;box-shadow:6px 6px 0 currentColor;transform:rotate(-1.5deg)}
${S("social-pop")} .lb-grid{gap:22px}
${S("social-pop")} .lb-grid>*{border:3px solid currentColor;border-radius:22px;padding:10px;box-shadow:5px 5px 0 currentColor}
${S("social-pop")} .lb-grid>:nth-child(even){transform:rotate(1.2deg)}
${S("social-pop")} .lb-grid img{border-radius:14px;height:220px}
${S("social-pop")} .lb-link{border-width:3px;border-radius:999px;font-weight:800;box-shadow:3px 3px 0 currentColor}
${S("creator-feed")}{max-width:620px;margin-inline:auto;padding-inline:clamp(14px,4vw,28px)}
${S("creator-feed")} h2{font-size:clamp(20px,2.6vw,28px)}
${S("creator-feed")} .lb-split{grid-template-columns:1fr;gap:14px}
${S("creator-feed")} .lb-grid{grid-template-columns:1fr;gap:28px}
${S("creator-feed")} .lb-grid img,${S("creator-feed")} .lb-photo img{height:auto;aspect-ratio:4/5;border-radius:12px}
${S("creator-feed")} .lb-grid>*{padding-bottom:16px;border-bottom:1px solid color-mix(in srgb,currentColor 14%,transparent)}
${S("creator-feed")} .lb-link{border-radius:999px;padding:9px 16px}
${S("proof-detail")}{font-size:14px}
${S("proof-detail")} h2{font-size:clamp(20px,2.6vw,30px);padding-bottom:10px;border-bottom:2px solid currentColor}
${S("proof-detail")} .lb-split{grid-template-columns:2fr 3fr;gap:24px;align-items:start}
${S("proof-detail")} .lb-grid{grid-template-columns:repeat(auto-fit,minmax(min(100%,150px),1fr));gap:12px}
${S("proof-detail")} .lb-grid img{height:150px}
${S("proof-detail")} .lb-grid>*{border:1px solid color-mix(in srgb,currentColor 25%,transparent);padding:10px;border-radius:6px}
${S("proof-detail")} dl{border:1px solid color-mix(in srgb,currentColor 25%,transparent);border-radius:6px;padding:0 14px}
${S("proof-detail")} dl>div:last-child{border-bottom:0}
${S("proof-detail")} dt{font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:.06em}
${S("proof-detail")} details{border:1px solid color-mix(in srgb,currentColor 20%,transparent);padding:12px 14px;margin-bottom:8px;border-radius:6px}
${S("proof-detail")} .lb-link{border-radius:6px;padding:9px 14px}
@media(max-width:760px){
${S("editorial")} .lb-split,${S("boutique")} .lb-split,${S("architectural")} .lb-split,${S("vintage")} .lb-split,${S("social-pop")} .lb-split,${S("proof-detail")} .lb-split{grid-template-columns:1fr}
${S("architectural")} .lb-split>.lb-photo{order:0;border-left:0;border-bottom:2px solid currentColor}
${S("editorial")} .lb-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
${S("editorial")} .lb-grid>:first-child{grid-column:1/-1;grid-row:auto}
${S("editorial")} .lb-grid>:first-child img{height:260px}
${S("minimal")} .lb-grid{gap:32px 18px}
${S("social-pop")} .lb-photo{transform:none}
}
@media(prefers-reduced-motion:reduce){.lb-section[data-section-layout] *{transition:none!important;animation:none!important}}
`;

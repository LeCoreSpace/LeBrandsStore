// Marketing settings already apply to every plan. This display projection does
// not rewrite historical subscription snapshots or grant paid entitlements.
export const SOCIAL_AD_FEATURE = "social_media_ad_integration";
export const SOCIAL_AD_LABEL = "Social media Ad Integration";
export function withSocialAdIntegration(features = []) {
  return [
    ...features.filter(f => f && f.key !== SOCIAL_AD_FEATURE).map(f=>{
      const name={published_products:"Catalogue products, including drafts",published_skus:"Catalogue SKUs, including drafts"}[f.key];
      return name?{...f,name}:f;
    }),
    {key:SOCIAL_AD_FEATURE, name:SOCIAL_AD_LABEL, included:true, value:true},
  ];
}

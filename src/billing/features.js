// Marketing settings already apply to every plan. This display projection does
// not rewrite historical subscription snapshots or grant paid entitlements.
export const SOCIAL_AD_FEATURE = "social_media_ad_integration";
export const SOCIAL_AD_LABEL = "Social media Ad Integration";
export function withSocialAdIntegration(features = []) {
  return [
    ...features.filter(f => f && f.key !== SOCIAL_AD_FEATURE),
    {key:SOCIAL_AD_FEATURE, name:SOCIAL_AD_LABEL, included:true, value:true},
  ];
}

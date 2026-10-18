// Shared build/runtime registry. Never allow arbitrary generated paths through
// the public asset gate, and never cache unversioned entry URLs immutably.
export const BROWSER_JS_ENTRIES=["ann-builder","editor","dashboard","inventory","settings-connections","aura","registration","plan-billing"];
export const BROWSER_CSS_ENTRIES=["ann-builder","ann-workspace","ann-business-documents","editor","dashboard","inventory","aura","aura-styles","aura-extra-styles","style-studio","plan-billing"];
export function isBrowserBundle(filename){
  const match=/^bundles\/([a-z-]+)-[A-Z0-9]{8}\.(js|css)$/.exec(filename);
  if(!match)return false;
  return match[2]==="js"?(match[1]==="chunk"||BROWSER_JS_ENTRIES.includes(match[1])):BROWSER_CSS_ENTRIES.includes(match[1]);
}

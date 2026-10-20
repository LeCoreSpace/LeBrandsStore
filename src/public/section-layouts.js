import {sectionLibraryEntry} from "./section-library.js";

// These are reusable theme-inspired adaptations, not extracted legacy snippets.
// Optional instance.layout keeps previously saved content blocks unchanged.
export const SECTION_LAYOUTS=Object.freeze([
  {id:"original",themeId:"shared",name:"Original",description:"Keep the original balanced section layout."},
  {id:"editorial",themeId:"editorial",name:"Editorial",description:"Asymmetric composition with a strong opening column and generous imagery."},
  {id:"boutique",themeId:"boutique",name:"Modern Boutique",description:"Soft portrait imagery and relaxed, rounded product presentations."},
  {id:"architectural",themeId:"architectural",name:"Bold Architectural",description:"Strong rules, defined columns and precise image placement."},
  {id:"minimal",themeId:"minimal",name:"Minimal",description:"Quiet typography, compact spacing and restrained visual treatment."},
  {id:"vintage",themeId:"vintage",name:"Vintage",description:"Framed imagery and traditional rules with generous text margins."},
  {id:"social-pop",themeId:"social-pop",name:"Social Pop",description:"Prominent tiles, expressive edges and a more energetic composition."},
  {id:"creator-feed",themeId:"creator-feed",name:"Creator Feed",description:"Portrait-led cards and a feed-like reading rhythm."},
  {id:"proof-detail",themeId:"proof-detail",name:"Proof & Detail",description:"Clear facts, structured rows and product details presented for comparison."},
].map(Object.freeze));
const IDS=new Set(SECTION_LAYOUTS.map(l=>l.id));
export function sectionLayouts(family){
  return sectionLibraryEntry(family)?.kind==="content"?SECTION_LAYOUTS:[];
}
export function validSectionLayout(family,layout){
  return typeof layout==="string"&&IDS.has(layout)&&sectionLibraryEntry(family)?.kind==="content";
}

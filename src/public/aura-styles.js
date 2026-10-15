/** Shared style definitions. Explicit adoption only; old themes remain unchanged. */
export const AURA_STYLES = Object.freeze([
  { id: "editorial", name: "Editorial", description: "Expressive type and magazine-like compositions.",
    settings: { style_preset: "editorial", font_preset: "serif", color_preset: "white", accent_color: "#6b1735", button_style: "square" } },
  { id: "boutique", name: "Modern Boutique", description: "Balanced layouts and contemporary retail details.",
    settings: { style_preset: "boutique", font_preset: "modern", color_preset: "white", accent_color: "#245c52", button_style: "rounded" } },
  { id: "architectural", name: "Bold Architectural", description: "Strong grids, confident typography and sharp edges.",
    settings: { style_preset: "architectural", font_preset: "modern", color_preset: "white", accent_color: "#b3320e", button_style: "square" } },
]);
export const STYLE_IDS = Object.freeze(["editorial", "boutique", "architectural"]);
export const STYLE_THEME_KEYS = Object.freeze(["style_preset", "font_preset", "color_preset", "accent_color", "button_style"]);
export function styleSettings(id) {
  const style = AURA_STYLES.find(item => item.id === id);
  if (!style) throw new Error("Choose a valid Aura style.");
  return { ...style.settings };
}
export function stylePatch(settings) {
  if (!STYLE_IDS.includes(settings?.style_preset)) throw new Error("Choose a valid Aura style.");
  return Object.fromEntries(STYLE_THEME_KEYS.map(key => [key, settings[key]]));
}

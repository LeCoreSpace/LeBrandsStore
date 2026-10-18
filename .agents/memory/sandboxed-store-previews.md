---
name: Sandboxed storefront previews
description: Keep editor and wizard iframe permissions restrictive while supporting storefront search.
---
Keep same-origin editor/wizard previews script-free. Attach required interactions from trusted parent code rather than adding allow-scripts alongside allow-same-origin.

**Why:** Browser checks showed storefront scripts blocked in srcdoc frames. Allowing same-origin frame scripts would weaken the existing sandbox rather than fix the integration safely.

**How to apply:** Omit script tags in embedded rendering and bind shared DOM controls after the frame loads. Native form submission is blocked before a submit event fires when allow-forms is absent; preview search must use a type=button click handler and prevent Enter's default submission. Live storefronts retain their normal GET search form.

Keep preview section transitions consistently smooth across themes in Ann and the theme editor, rather than giving a theme deliberately stepped motion.

**Why:** The user requested the homepage's smooth section-transition quality across all five preview themes.

**How to apply:** Preserve each theme's visual identity through its design, not jerky animation. Keep focused editing fields stable and respect reduced-motion preferences.

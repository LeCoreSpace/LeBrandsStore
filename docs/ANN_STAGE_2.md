# Stage 2: interactive Aura styles

Merchants can open `/stores/:storeId/styles` from the builder chooser or editor.
Editorial, Modern Boutique, Bold Architectural, Minimal and Vintage use real Aura page rendering,
not screenshot mockups. Palette and self-hosted font choices refresh locally.
The current saved theme is shown on entry; no style is automatically adopted.
All five share one catalogue and image pack, with curated style-specific
demonstration copy. No style rewrites merchant-authored text.
The preview toolbar keeps all five styles and Desktop/Mobile toggles available
in full-screen view. Each style, page and viewport retains its scroll position.

The full-screen interactive preview retains responsive page navigation, local
catalogue search/sort, product zoom, mobile navigation, FAQ accordions, an
illustrative bag with quantity/removal controls, and a checkout preview.
The preview iframe permits same-origin access by its trusted parent but does
not permit child scripts or form submissions. The parent owns interactions.
Only the browser's in-memory preview bag changes; no orders, quotes, payments,
stock writes or customer records are sent to the server.

Empty catalogues use the existing, labelled Mens Clothing demonstration pack.
Real products and customised layouts are otherwise preserved. Demo inventory
is never included in a styling save. Other category-specific packs remain
future work.

Only explicit Apply style to draft sends the five allowed visual settings
through the existing authenticated setup API. The studio checks for another
tab's theme changes before saving and reports errors without discarding the
preview. Publishing remains the editor's normal review-and-publish operation.
Visual changes do not invalidate legal policy reviews; changes to business
details retain existing re-review behaviour.

Styles are scoped to an explicitly chosen `style_preset`. Existing themes
without that setting receive no new style rules or reveal animations.
Animation progressively enhances visible content and respects reduced-motion.

Ann's guided questionnaire and AI personalisation remain disabled. Stage 2
does not add their session schema or generate merchant copy.

No migration is necessary: visual preferences use existing JSON settings.
The user runs deployment when ready:

    pnpm run test:offline && pnpm run deploy

Reference: the user prefers the complete browser-preview experience offered
by Webflow template listings, not page-design images as the selling experience.

---
name: Browser CSP verification
description: Distinguishing page CSP defects from automated-browser overlay warnings.
---

Do not weaken a page's CSP just to silence an unmapped automated-browser warning.
An empty source file or an evaluation-script line number is not enough to
attribute an inline-style violation to the application.

**Why:** Automated support-page checks produced style warnings alongside
tool-created fixed overlays. The actual response contained only nonce-protected
CSS, no style attributes, and self-hosted application modules; functional flows
and layout still needed to be verified separately.

**How to apply:** Compare raw response markup, CSP nonces and the application's
loaded modules with the violation source and live DOM. Classify unresolved
warnings explicitly rather than asserting they are application defects or
claiming a completely clean console.

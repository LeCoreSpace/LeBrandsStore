import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { renderHome } from "../src/ui/marketing.js";

test("platform video and craft captures use rounded clipped frames without cropping app content", async () => {
  const css = await readFile("src/public/marketing.css", "utf8");
  assert.match(css, /\.m-wizard-media, \.m-craft-media \{[^}]*border-radius: clamp\(14px, 2\.2vw, 26px\)/);
  assert.match(css, /\.m-wizard-media, \.m-craft-media \{[^}]*overflow: hidden/);
  assert.match(css, /\.m-wizard-media, \.m-craft-media \{[^}]*box-shadow:/);
  assert.match(css, /\.m-craft-media img \{[^}]*object-fit: contain/);
  assert.match(css, /\.m-wizard-media video \{[^}]*object-fit: contain/);
  const html = renderHome();
  assert.match(html, /<video muted playsinline loop preload="none"/);
  assert.match(html, /data-src="\/img\/REPLACE-wizard-loop-branded.webm"/);
  assert.match(html, /class="m-wizard-media m-reveal"/);
});

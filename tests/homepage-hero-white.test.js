import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

test("white hero trial changes the surrounding palette without recolouring the animated dashboard or changing its motion",async()=>{
  const css=await readFile(new URL("../src/public/marketing.css",import.meta.url),"utf8");
  const start=css.indexOf("/* White hero trial.");
  assert.ok(start>=0);
  const dashboard=css.indexOf(".m-hero .m-hs {",start);
  const trial=css.slice(start,css.indexOf("\n}",dashboard)+2);
  assert.match(trial,/:root:root\[data-theme\] #top > section\.m-hero/);
  assert.match(trial,/background:\s*#ffffff/);
  assert.match(trial,/\.m-hero \.m-hero-line\s*\{\s*color:\s*var\(--band-fg\)/);
  assert.match(trial,/--band-fg:\s*#f3ebe2/);
  assert.match(trial,/color-scheme:\s*dark/);
  assert.match(trial,/\.m-logo-light\s*\{\s*display:\s*block/);
  assert.doesNotMatch(trial,/animation(?:-name|-duration)?\s*:|@keyframes|transform\s*:/);
});

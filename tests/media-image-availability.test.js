import test from "node:test";
import assert from "node:assert/strict";
import {generationBlockReason} from "../src/public/media-image-generation.js";
import {renderMediaImageGeneration} from "../src/ui/media-image-generation.js";

const ready={preview:false,available:true,canGenerate:true,placement:"story-photo",
  prompt:"Place the reference apparel on a table.",busy:false,active:false};
test("missing activation is explained even when every merchant field is complete",()=>{
 const reason="Image generation is awaiting its database update.";
 assert.equal(generationBlockReason({...ready,available:false,canGenerate:false,reason}),reason);
 assert.equal(generationBlockReason({...ready,canGenerate:false,reason:"Only the store owner can use the image-generation trial."}),
  "Only the store owner can use the image-generation trial.");
});
test("only an authorised, available, idle request with valid inputs enables generation",()=>{
 assert.equal(generationBlockReason(ready),"");
 assert.match(generationBlockReason({...ready,prompt:"short"}),/10 characters/);
 assert.match(generationBlockReason({...ready,placement:""}),/Choose/);
 assert.match(generationBlockReason({...ready,busy:true}),/in progress/);
 assert.match(generationBlockReason({...ready,active:true}),/in progress/);
 assert.match(generationBlockReason({...ready,preview:true}),/read-only/);
 assert.match(generationBlockReason({...ready,available:false}),/Checking/);
});
test("the explanation is adjacent to Generate, not only above the form",()=>{
 const html=renderMediaImageGeneration({storeId:"00000000-0000-4000-8000-000000000001"});
 assert.match(html,/data-ai-generate disabled>Generate image<\/button><\/div>\s*<p[^>]+data-ai-disabled-reason/);
});

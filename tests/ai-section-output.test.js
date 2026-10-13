import test from "node:test";
import assert from "node:assert/strict";
import { SECTION_SCHEMAS } from "../src/public/aura-layout.js";
import { systemPrompt,validateCandidate } from "../src/ai/plan.js";
import { generateText,verifyFacts } from "../src/ai/provider.js";

test("AI section output schemas expose only copy fields for every Aura section",()=>{
  for(const [type,schema] of Object.entries(SECTION_SCHEMAS)){
    const prompt=systemPrompt({page:schema.allowedPages[0],type},{});
    const root=prompt.responseSchema;
    assert.equal(root.additionalProperties,false);
    assert.deepEqual(root.required,["settings","blocks"]);
    for(const [fields,contract] of [
      [schema.fields,root.properties.settings],
      [schema.blockFields||{},root.properties.blocks.items.properties.settings],
    ]){
      const allowed=Object.keys(fields).filter(key=>["text","richtext"].includes(fields[key].type));
      assert.deepEqual(Object.keys(contract.properties),allowed);
      assert.deepEqual(contract.required,allowed);
      assert.equal(contract.additionalProperties,false);
      for(const key of allowed){
        assert.equal(contract.properties[key].type,"string");
        assert.equal(contract.properties[key].maxLength,fields[key].maxLength);
      }
    }
    assert.equal(root.properties.blocks.minItems,schema.minItems);
    assert.equal(root.properties.blocks.maxItems,schema.maxItems);
    assert.equal(root.properties.blocks.items.additionalProperties,false);
  }
});

test("announcement accepts copy while protected settings remain rejected",()=>{
  const section={id:"announcement-test",type:"announcement",settings:{},blocks:[]};
  const step={page:"home",type:"announcement",section};
  const brief={selling:{first_order_offer:"Ten percent off your first order"},products:[]};
  const draft={store:{store_id:"00000000-0000-4000-8000-000000000001"},products:[],collections:[]};
  const output={settings:{text:brief.selling.first_order_offer},blocks:[]};
  const result=validateCandidate(step,output,brief,draft);
  assert.equal(result.settings.text,brief.selling.first_order_offer);
  assert.equal(result.settings.enabled,true);
  for(const key of ["enabled","link","colour","product","unknown"]){
    assert.throws(()=>validateCandidate(step,{...output,settings:{...output.settings,[key]:true}},brief,draft),/protected setting/);
  }
});

test("OpenAI receives strict section schema, with factual verification kept separate",async t=>{
  const requests=[];
  t.mock.method(globalThis,"fetch",async (url,options)=>{
    requests.push(JSON.parse(options.body));
    return new Response(JSON.stringify({
      usage:{prompt_tokens:12,completion_tokens:8},
      choices:[{message:{content:requests.length===1?'{"settings":{"text":"Offer"},"blocks":[]}':'{"supported":true}'}}],
    }),{status:200});
  });
  const prompt=systemPrompt({page:"home",type:"announcement"},{});
  const output=await generateText({OPENAI_API_KEY:"test-only"},prompt);
  assert.equal(JSON.parse(output.raw).settings.text,"Offer");
  assert.equal(requests[0].response_format.type,"json_schema");
  assert.equal(requests[0].response_format.json_schema.strict,true);
  assert.deepEqual(requests[0].response_format.json_schema.schema,prompt.responseSchema);
  assert.equal(requests[0].response_format.json_schema.schema.properties.settings.properties.enabled,undefined);
  await verifyFacts({OPENAI_API_KEY:"test-only"},{},output.raw);
  assert.equal(requests[1].response_format.type,"json_object");
});

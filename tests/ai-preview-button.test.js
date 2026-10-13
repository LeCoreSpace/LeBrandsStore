import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

test("AI full-preview button recognizes its empty boolean data attribute",async()=>{
 const source=await readFile(new URL("../src/public/ai-builder.js",import.meta.url),"utf8");
 const statement=source.split("\n").find(line=>line.includes("location.href = `/stores/${sid}/editor`"));
 assert.ok(statement,"The full-preview navigation handler exists.");
 const AsyncFunction=Object.getPrototypeOf(async()=>{}).constructor;
 const click=new AsyncFunction("t","api","S","location","sid",statement);
 const location={href:"/builder"},calls=[];
 const button={dataset:{preview:""},hasAttribute:name=>name==="data-preview"};
 await click(button,async(action,payload)=>{calls.push({action,payload});return{};},{job:{id:"fictional-job"}},location,"fictional-store");
 assert.equal(calls[0]?.action,"preview");
 assert.equal(calls[0]?.payload.json.job_id,"fictional-job");
 assert.equal(location.href,"/stores/fictional-store/editor");
});

import {cp,mkdir,writeFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createRequire} from "node:module";
import {BROWSER_JS_ENTRIES,BROWSER_CSS_ENTRIES,isBrowserBundle} from "../src/browser-assets.js";

const root=fileURLToPath(new URL("../",import.meta.url));
const require=createRequire(import.meta.url);
// Use the same installed compiler as Wrangler, without a second toolchain.
const {build}=require(require.resolve("esbuild",{paths:[require.resolve("wrangler")]}));

export async function buildBrowserAssets({outdir=path.join(root,"generated-artifacts/public"),copyStatic=true,quiet=false}={}){
  const publicDir=path.join(root,"src/public");
  await mkdir(outdir,{recursive:true});
  // Retain earlier hashes in an existing build directory. Fresh HTML always
  // revalidates entry stubs; all split JS dependencies are statically imported.
  if(copyStatic)await cp(publicDir,outdir,{recursive:true});
  const entries=[...BROWSER_JS_ENTRIES.map(name=>`${name}.js`),...BROWSER_CSS_ENTRIES.map(name=>`${name}.css`)];
  const result=await build({
    absWorkingDir:root,entryPoints:entries.map(name=>path.join(publicDir,name)),
    outdir,bundle:true,splitting:true,format:"esm",platform:"browser",target:"es2022",
    supported:{"dynamic-import":false},minify:true,metafile:true,write:true,
    entryNames:"bundles/[name]-[hash]",chunkNames:"bundles/chunk-[hash]",
    external:["/img/*","https://*","http://*"],
    plugins:[{name:"public-asset-imports",setup(api){
      api.onResolve({filter:/^\/assets\//},args=>args.kind==="url-token"
        ? {path:args.path,external:true}
        : {path:path.join(publicDir,args.path.slice("/assets/".length))});
    }}],
  });
  const manifest={};
  for(const [filename,meta] of Object.entries(result.metafile.outputs)){
    const relative=path.relative(outdir,path.resolve(root,filename)).split(path.sep).join("/");
    if(!isBrowserBundle(relative))throw new Error(`Unregistered browser output: ${relative}`);
    if(meta.imports.some(item=>item.kind==="dynamic-import"))throw new Error("Lazy hashed chunks need a cross-deployment retention strategy.");
    if(!meta.entryPoint)continue;
    const entry=path.basename(meta.entryPoint);
    // Internal split chunks can also have entryPoint metadata. Their exports
    // are compiler internals, not replacements for the original public module.
    if(!entries.includes(entry))continue;
    manifest[entry]=relative;
    await writeFile(path.join(outdir,entry),entry.endsWith(".js")
      ? `export * from "./${relative}";\n`
      : `@import "./${relative}";\n`);
  }
  for(const entry of entries)if(!manifest[entry])throw new Error(`Missing browser entry: ${entry}`);
  if(!quiet)console.log(`Built ${entries.length} versioned entries, ${Object.keys(result.metafile.outputs).length} files. Private HTML and data remain uncached.`);
  await writeFile(path.join(outdir,"browser-build.json"),JSON.stringify({manifest,metafile:result.metafile},null,2));
  return {manifest,metafile:result.metafile,outdir};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await buildBrowserAssets();

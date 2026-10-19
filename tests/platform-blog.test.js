import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import worker from "../src/index.js";
import {BLOG_POSTS,getBlogPost} from "../src/content/blog.js";
import {renderBlogIndex,renderBlogArticle} from "../src/ui/blog.js";
import {PUBLIC_PLATFORM_PATHS} from "../src/ui/platform-seo.js";

const origin="https://lebrands.store";
const env={ASSETS:{fetch:async request=>{
  const path=new URL(request.url).pathname.replace(/^\/assets\//,"/");
  try{return new Response(await readFile(`src/public${path}`),{headers:{"content-type":path.endsWith(".svg")?"image/svg+xml":path.endsWith(".png")?"image/png":"text/css"}});}
  catch{return new Response("Not found",{status:404});}
}}};
const graph=html=>JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])["@graph"];

test("twenty-two substantive public articles include seven detailed platform guides and unique links",()=>{
  assert.equal(BLOG_POSTS.length,22);
  assert.equal(new Set(BLOG_POSTS.map(post=>post.slug)).size,22);
  const platform=BLOG_POSTS.filter(post=>post.category==="Inside LeBrands.Store");
  assert.equal(platform.length,7);
  for(const post of platform){
    assert.ok(post.sections.length>=5);
    assert.ok(post.sections.flatMap(s=>s.paragraphs).join(" ").split(/\s+/).length>=450);
  }
  assert.equal(getBlogPost("does-not-exist"),null);
  for(const post of BLOG_POSTS){
    assert.match(post.slug,/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.ok(PUBLIC_PLATFORM_PATHS.includes(`/blog/${post.slug}`));
    assert.ok(post.sections.length>=4&&post.faqs.length>=2&&post.takeaways.length>=3);
    assert.ok(post.sections.flatMap(s=>s.paragraphs).join(" ").split(/\s+/).length>=300);
    assert.equal(new Set(post.sections.map(s=>s.id)).size,post.sections.length);
    for(const slug of post.related)assert.ok(getBlogPost(slug),slug);
    assert.doesNotMatch(JSON.stringify(post),/[\u2014\u2728]/);
    assert.doesNotMatch(JSON.stringify(post),/\b(upcoming|planned)\b/i);
    assert.doesNotMatch(JSON.stringify(post),/\bin progress\b|\bnot enabled\b|\bnot yet\b|\brequires setup\b|\bon the way\b/i);
  }
});

test("index and article content are server rendered with accurate metadata and matching schema",async()=>{
  const index=renderBlogIndex();
  assert.match(index,/<body class="m-pricing-document m-pricing-page blog-page">/);
  assert.equal((index.match(/<h1[ >]/g)||[]).length,1);
  assert.equal(graph(index)[0]["@type"],"Blog");
  for(const post of BLOG_POSTS){
    assert.ok(index.includes(`/blog/${post.slug}`));
    const response=await worker.fetch(new Request(`${origin}/blog/${post.slug}`),env);
    assert.equal(response.status,200);
    const html=await response.text();
    assert.equal((html.match(/<h1[ >]/g)||[]).length,1);
    assert.equal((html.match(/property="og:type"/g)||[]).length,1);
    assert.equal((html.match(/property="og:title"/g)||[]).length,1);
    assert.match(html,/property="og:type" content="article"/);
    assert.ok(html.includes(`rel="canonical" href="${origin}/blog/${post.slug}"`));
    assert.ok(html.includes(post.summary.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))));
    for(const section of post.sections)assert.ok(html.includes(`id="${section.id}"`));
    const nodes=graph(html),article=nodes.find(n=>n["@type"]==="BlogPosting");
    assert.equal(article.headline,post.title);
    assert.equal(article.mainEntityOfPage["@id"],`${origin}/blog/${post.slug}`);
    assert.equal(article.datePublished,post.published);
    assert.match(article.image[0],/\.png$/);
    assert.deepEqual(nodes.find(n=>n["@type"]==="FAQPage").mainEntity.map(f=>f.acceptedAnswer.text),post.faqs.map(f=>f.answer));
    const head=await worker.fetch(new Request(`${origin}/blog/${post.slug}`,{method:"HEAD"}),env);
    assert.equal(head.status,200);assert.equal(await head.text(),"");
  }
});

test("every original illustration and raster social image passes the actual Worker asset gate",async()=>{
  for(const post of BLOG_POSTS){
    for(const path of [post.image,post.image.replace(/\.svg$/,".png")]){
      const response=await worker.fetch(new Request(origin+path),env);
      assert.equal(response.status,200,path);
      if(path.endsWith(".svg")){
        const svg=await response.text();
        assert.match(svg,/<svg/);assert.match(svg,/<title/);
        assert.doesNotMatch(svg,/<script|<foreignObject|(?:href|src)=["']https?:/i);
      }else assert.deepEqual([...new Uint8Array(await response.arrayBuffer()).slice(0,8)],[137,80,78,71,13,10,26,10]);
    }
  }
  assert.equal((await worker.fetch(new Request(`${origin}/assets/blog.css`),env)).status,200);
  assert.equal((await worker.fetch(new Request(`${origin}/blog/not-a-real-article`),env)).status,404);
  assert.equal((await worker.fetch(new Request(`${origin}/img/blog/private.svg`),env)).status,404);
});

test("integration guide covers payment and delivery operations without internal release commentary",async()=>{
  const post=getBlogPost("payments-and-logistics-integration-roadmap");
  const text=JSON.stringify(post);
  assert.match(text,/Razorpay payment records/);
  assert.match(text,/Delivery partner workflows/);
  assert.doesNotMatch(text,/OAuth|self-service|website approval|generally available/i);
  const llms=await readFile("src/public/llms.txt","utf8");
  const sitemap=await readFile("src/public/sitemap.xml","utf8");
  for(const post of BLOG_POSTS){
    assert.ok(llms.includes(`${origin}/blog/${post.slug}`));
    assert.ok(sitemap.includes(`<loc>${origin}/blog/${post.slug}</loc>`));
  }
  assert.match(llms,/Free plan has no LeBrands.Space placement/);
  assert.doesNotMatch(llms,/\b(upcoming|planned)\b/i);
});

test("editorial titles are escaped in HTML and structured data",()=>{
  const html=renderBlogArticle({...BLOG_POSTS[0],title:'Example "><script>alert(1)</script>'});
  assert.doesNotMatch(html,/<script>alert\(1\)/);
  assert.equal(graph(html).find(n=>n["@type"]==="BlogPosting").headline,'Example "><script>alert(1)</script>');
});

test("Ann guides cover actual styles, formatting, conversation languages and separate GST confirmation",()=>{
  const design=getBlogPost("ann-theme-styles-and-inline-editing");
  const text=JSON.stringify(design);
  for(const phrase of ["Editorial","Modern Boutique","Bold Architectural","Minimal","inline","font","size","alignment","colours"])assert.ok(text.includes(phrase),phrase);
  const business=JSON.stringify(getBlogPost("ann-multilingual-conversations-and-gst-verification"));
  for(const phrase of ["English","Hindi","Tamil","Marathi","Telugu","GSTIN","legal business name","registered address","explicitly confirm","manual business-document approval"])assert.ok(business.includes(phrase),phrase);
});

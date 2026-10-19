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

test("ten substantive public articles have unique slugs, complete structure and real internal links",()=>{
  assert.equal(BLOG_POSTS.length,10);
  assert.equal(new Set(BLOG_POSTS.map(post=>post.slug)).size,10);
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

test("roadmap and crawler descriptions distinguish completed approval from future integrations",async()=>{
  const post=getBlogPost("payments-and-logistics-integration-roadmap");
  const text=JSON.stringify(post);
  assert.match(text,/website approval with Razorpay is complete/);
  assert.match(text,/Self-service partner OAuth is not enabled/);
  assert.match(text,/general-use logistics partner connection is not enabled/);
  const llms=await readFile("src/public/llms.txt","utf8");
  for(const post of BLOG_POSTS)assert.ok(llms.includes(`${origin}/blog/${post.slug}`));
  assert.match(llms,/Free plan has no LeBrands.Space placement/);
  assert.doesNotMatch(llms,/\b(upcoming|planned)\b/i);
});

test("editorial titles are escaped in HTML and structured data",()=>{
  const html=renderBlogArticle({...BLOG_POSTS[0],title:'Example "><script>alert(1)</script>'});
  assert.doesNotMatch(html,/<script>alert\(1\)/);
  assert.equal(graph(html).find(n=>n["@type"]==="BlogPosting").headline,'Example "><script>alert(1)</script>');
});

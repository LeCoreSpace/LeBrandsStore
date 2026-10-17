// Pure routing shared by the embedded and detached private previews.
export function browserPreviewLocation(href,data,origin){
  try{
    const url=new URL(href,origin),merchantHost=`${data.store?.subdomain||data.settings?.subdomain||""}.lebrands.store`;
    if(!["http:","https:"].includes(url.protocol)||(url.origin!==new URL(origin).origin&&!(url.protocol==="https:"&&url.hostname===merchantHost)))return null;
    const path=url.pathname;
    if(["/collections","/collections/","/collections/all"].includes(path))return {page:"collection",collectionId:undefined};
    if(path.startsWith("/products/")){
      const key=decodeURIComponent(path.split("/")[2]),product=data.products?.find(p=>p.id===key||p.slug===key);
      return product?{page:"product",productId:product.id}:null;
    }
    if(path.startsWith("/collections/")){
      const key=decodeURIComponent(path.split("/")[2]),collection=data.collections?.find(c=>c.id===key||c.slug===key);
      return collection?{page:"collection",collectionId:collection.id}:null;
    }
    if(path.startsWith("/policies/"))return {page:"policy",policyKind:path.split("/")[2]};
    const page={"/":"home","/cart":"cart","/checkout":"checkout","/pages/about":"about","/pages/contact":"contact"}[path];
    return page?{page}:null;
  }catch{return null;}
}

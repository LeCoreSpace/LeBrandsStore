// Isolated provider fixture. These are deliberately fake keys and hostnames.
export function securityProvider(){
  const account="b".repeat(32),widgets=new Map(),calls=[];
  let sequence=0,denied=false,capacity=false;
  const reply=(result,extra={})=>new Response(JSON.stringify({success:true,result,...extra}),{headers:{"content-type":"application/json"}});
  const fetcher=async (url,options={})=>{
    const u=new URL(url),method=options.method||"GET";
    if(u.pathname.match(/^\/client\/v4\/zones\/[a-f0-9]{32}$/))
      return reply({account:{id:account}});
    if(!u.pathname.includes("/challenges/widgets"))return null;
    calls.push({method,path:u.pathname});
    if(method!=="GET"&&(denied||capacity))return new Response(JSON.stringify({success:false,errors:[{message:capacity?"Widget limit reached":"Forbidden"}]}),{status:denied?403:400});
    const root=`/client/v4/accounts/${account}/challenges/widgets`;
    if(u.pathname===root&&method==="GET")return reply([...widgets.values()],{result_info:{total_pages:1}});
    if(u.pathname===root&&method==="POST"){
      const w={...JSON.parse(options.body),sitekey:`fake-widget-key-${++sequence}`,secret:`fake-widget-secret-${sequence}-not-a-real-secret`};
      widgets.set(w.sitekey,w);return reply(w);
    }
    const key=u.pathname.split("/").at(-1),current=widgets.get(key);
    if(!current)return new Response(JSON.stringify({success:false}),{status:404});
    if(method==="PUT")widgets.set(key,{...current,...JSON.parse(options.body)});
    return reply(widgets.get(key));
  };
  return{fetcher,widgets,calls,denyWrites:value=>{denied=value;},atCapacity:value=>{capacity=value;}};
}

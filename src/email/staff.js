import {dashboardAccess} from "../dashboard/repository.js";
import {readJson} from "../store/input.js";
import {sha256} from "../auth/passwords.js";
import {SECURITY_HEADERS,normalizeEmail} from "../auth/security.js";
import {signedEmailToken} from "./tokens.js";
import {emailsEnabled} from "./worker.js";
import {renderEmail} from "./templates.js";
import {emailPreferencesUrl} from "./preferences.js";
import {renderStaff} from "../ui/staff.js";
import {loadDraft,saveSetup} from "../store/repository.js";
import {readForm} from "../auth/security.js";
import {capacityError} from "../billing/capacity.js";
export const isStaffPath=path=>/^\/(?:api\/stores\/[a-f0-9-]{36}\/staff-invitations|stores\/[a-f0-9-]{36}\/team)$/i.test(path);
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{...SECURITY_HEADERS,"content-type":"application/json","cache-control":"no-store"}});
export async function handleStaffInvitation(request,env,db,user,sessionHash,storeId){
 if(user?.must_change_password)return json({error:"Change your password before managing your team."},403);
 if(!user||!sessionHash)return json({error:"Sign in first."},401);
 if(!["GET","POST"].includes(request.method))return json({error:"Method not allowed."},405);
 let submittedInvite={};
 return db.withMemberStore(storeId,sessionHash,async tx=>{
  const role=await dashboardAccess(tx,storeId,user.id,request.method==="POST");
  if(!["owner","admin"].includes(role))return json({error:"Only owners and admins can manage invitations."},403);
  if(!await emailsEnabled(tx))return json({error:"Apply the transactional email migration before sending invitations."},409);
  if(request.method==="GET"){
   const[row]=await tx`SELECT public.email_team(${storeId},${sessionHash}) AS members`;
   const members=row.members;
   if(request.url.includes(`/stores/${storeId}/team`)){
    const draft=await loadDraft(tx,storeId);
    return new Response(renderStaff({store:draft.store,draft,role,members},user),{headers:{...SECURITY_HEADERS,"content-type":"text/html; charset=utf-8","cache-control":"no-store"}});
   }
   return json({members});
  }
  const ui=new URL(request.url).pathname.endsWith("/team");
  const input=ui?Object.fromEntries(await readForm(request)):await readJson(request),email=normalizeEmail(input.email);
  submittedInvite={email,role:input.role};
  if(ui&&input.action==="notifications"){
   const notification=normalizeEmail(input.notification_email);
   if(!notification)return json({error:"Enter a valid notification email."},400);
   await saveSetup(tx,storeId,{notification_email:notification});
   return new Response(null,{status:303,headers:{...SECURITY_HEADERS,location:`/stores/${storeId}/team?updated=1`}});
  }
  if(!email||!["admin","editor"].includes(input.role))return json({error:"Enter an email and choose admin or editor."},400);
  const token=await signedEmailToken(env,"invite",7*86400);
  const message={from:"LeBrands.Store <hello@notify.lebrands.store>",to:[email],...renderEmail("invite",{action_url:`https://app.lebrands.store/invite?token=${encodeURIComponent(token)}`,preferences_url:await emailPreferencesUrl(env,email,storeId)})};
  const[row]=await tx`SELECT public.email_invite_staff(${storeId},${sessionHash},${email},${input.role},${await sha256(token)},${tx.json(message)}) AS id`;
  if(ui)return new Response(null,{status:303,headers:{...SECURITY_HEADERS,location:`/stores/${storeId}/team?invited=1`}});
  return json({id:row.id,notice:"Invitation queued. It expires in 7 days."},201);
 }).catch(async error=>{
  const capacity=capacityError(error);
  if(!capacity)throw error;
  if(!new URL(request.url).pathname.endsWith("/team"))return json({error:capacity.message,quota:capacity.quota},capacity.status);
  return db.withMemberStore(storeId,sessionHash,async tx=>{
   const role=await dashboardAccess(tx,storeId,user.id);
   if(!["owner","admin"].includes(role))return json({error:"Only owners and admins can manage invitations."},403);
   const [row]=await tx`SELECT public.email_team(${storeId},${sessionHash}) AS members`;
   const draft=await loadDraft(tx,storeId);
   return new Response(renderStaff({store:draft.store,draft,role,members:row.members,capacityError:capacity.message,submittedInvite},user),
    {status:capacity.status,headers:{...SECURITY_HEADERS,"content-type":"text/html; charset=utf-8","cache-control":"no-store"}});
  },{lockStore:false});
 });
}

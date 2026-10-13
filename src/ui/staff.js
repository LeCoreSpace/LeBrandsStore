import {documentPage} from "./dashboard.js";
import {escapeHtml as esc} from "./layout.js";
export function renderStaff(data,user){
 const id=encodeURIComponent(data.store.store_id);
 return documentPage("settings",data,user,`<div class="lb-page-heading"><h1>Store team</h1><p>Invite staff securely. Invitations expire in 7 days.</p></div>
  <section class="lb-panel"><h2>Members</h2><div class="lb-table-wrap"><table class="lb-table"><thead><tr><th>Name</th><th>Email</th><th>Role</th></tr></thead><tbody>${(data.members||[]).map(m=>`<tr><td>${esc(m.name)}</td><td>${esc(m.email)}</td><td>${esc(m.role)}</td></tr>`).join("")}</tbody></table></div></section>
  <section class="lb-panel"><h2>Order notifications</h2><form method="post" action="/stores/${id}/team">
   <input type="hidden" name="action" value="notifications"><label>Notification email<input name="notification_email" type="email" required maxlength="254" value="${esc(data.draft.settings.notification_email||data.draft.settings.support_email||"")}" style="display:block;width:100%;padding:12px;margin:12px 0"></label>
   <button type="submit" class="lb-btn">Save notification email</button></form></section>
  <section class="lb-panel"><h2>Invite a staff member</h2><form method="post" action="/stores/${id}/team">
   <label>Email address<input name="email" type="email" required maxlength="254" style="display:block;width:100%;padding:12px;margin:12px 0"></label>
   <label>Role<select name="role" style="display:block;width:100%;padding:12px;margin:12px 0"><option value="editor">Editor</option><option value="admin">Admin</option></select></label>
   <p>Admins can manage the store. Editors have the existing editor permissions. Invitations never grant ownership.</p>
   <button type="submit" class="lb-btn lb-btn-primary">Send invitation</button></form></section>`);
}

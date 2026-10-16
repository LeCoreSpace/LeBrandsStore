import { documentPage } from "./dashboard.js";
import { escapeHtml as esc } from "./layout.js";
// Compatibility rendering for temporarily unavailable Ann, never a builder chooser.
export function renderBuilderChoice(data,user,options={}) {
  const root=`/stores/${encodeURIComponent(data.store.store_id)}`;
  return documentPage("builder",{...data,draft:data},user,`<section class="lb-side-box"><h1>Build your store with Ann</h1>
    <p role="status">${esc(options.error||"Ann is temporarily unavailable. Your saved store is unchanged. Please try again later.")}</p>
    <p>You can still open your saved theme. Nothing has been reset or published.</p>
    <a class="lb-button" href="${root}/editor">Open theme editor</a> <a href="${root}">Back to dashboard</a></section>`);
}

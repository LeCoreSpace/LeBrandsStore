const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const APPROVAL_USAGE = "Usage: node db/admin-approve-store.js --store-id UUID --approved-by STAFF_ID [--note TEXT] [--manual-review] [--revoke --note REASON]";

export function approvalInput(args) {
  const params = {};
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (flag === "--") continue;
    if (["--revoke", "--manual-review"].includes(flag)) {
      if (params[flag] !== undefined) throw new Error(APPROVAL_USAGE);
      params[flag] = true;
    } else if (["--store-id", "--approved-by", "--note"].includes(flag)) {
      if (params[flag] !== undefined || !args[index + 1] || args[index + 1].startsWith("--")) throw new Error(APPROVAL_USAGE);
      params[flag] = args[++index].trim();
    } else throw new Error(APPROVAL_USAGE);
  }
  const storeId = params["--store-id"], approvedBy = params["--approved-by"], note = params["--note"] || "";
  const manualReview = !!params["--manual-review"], revoke = !!params["--revoke"];
  if (!UUID.test(storeId || "") || !approvedBy || approvedBy.length > 120 ||
    !/^[\w .@-]+$/.test(approvedBy) || note.length > 1000 ||
    (manualReview && revoke) || ((manualReview || revoke) && !note)) {
    throw new Error(APPROVAL_USAGE);
  }
  return { storeId, approvedBy, note, manualReview, revoke };
}

// Presentation-only helpers shared by dashboard HTML and its browser controls.
const terminal = new Set(["cancelled","returned","rto","refunded"]);
export function paymentState(order = {}) {
  if(order.payment_collected_at || order.payment_status==="paid") return "paid";
  if(order.payment_status==="failed" || order.status==="failed") return "failed";
  if(order.status==="pending_payment" || order.payment_status==="pending") return "pending_payment";
  if(/cod/i.test(order.payment_method || "")) return order.status==="delivered"?"unpaid":"cod";
  if(order.payment_method && ["paid","packed","shipped","delivered","processing","confirmed"].includes(order.status)) return "paid";
  return "unknown";
}
export function fulfilmentState(status) {
  return ["delivered","shipped","packed","cancelled","returned","rto","refunded"].includes(status) ? status : "unfulfilled";
}
export function matchesOrderTab(status, payment, tab) {
  const ended=terminal.has(status),unpaid=["unpaid","cod","pending_payment","failed"].includes(payment);
  if(tab==="all") return true;
  if(tab==="cancelled") return status==="cancelled";
  if(tab==="unfulfilled") return !ended && ["confirmed_cod","confirmed","paid","packed","processing","pending_payment"].includes(status);
  if(tab==="unpaid") return !ended && unpaid;
  if(tab==="open") return !ended && (status!=="delivered" || unpaid);
  return true;
}
export function loadedSalesSummary(orders = []) {
  const valid=orders.filter(order=>!terminal.has(order.status));
  const revenue=valid.reduce((sum,order)=>sum+Number(order.total_paise || 0),0);
  return {orders:orders.length,revenue_paise:revenue,aov_paise:valid.length?Math.round(revenue/valid.length):null};
}

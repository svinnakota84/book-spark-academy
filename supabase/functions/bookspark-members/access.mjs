export function membershipActive(subscription, priceId) {
  return subscription.status === "active" &&
    subscription.latest_invoice?.status === "paid" &&
    subscription.items?.data.some(item => item.price.id === priceId);
}

export function chargeInGoodStanding(charge) {
  return charge?.paid === true && !charge.refunded && !charge.disputed && charge.amount_refunded === 0;
}

export function purchasePaid(session) {
  return session.mode === "payment" && session.status === "complete" &&
    session.payment_status === "paid" && session.payment_intent?.status === "succeeded" &&
    chargeInGoodStanding(session.payment_intent?.latest_charge);
}

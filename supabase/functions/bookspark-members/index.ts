import Stripe from "npm:stripe@23.2.0";
import { createClient } from "npm:@supabase/supabase-js@2";
import { chargeInGoodStanding, membershipActive, purchasePaid } from "./access.mjs";

function setting(name) {
  const value = Deno.env.get(name);
  if (!value) throw new Error("Missing membership setting: " + name);
  return value;
}

const origin = setting("BOOKSPARK_ORIGIN");
const bucket = "bookspark-courses";
const returnUrl = new URL("/learning.html#member-library", origin).href;
const key = setting("BOOKSPARK_STRIPE_KEY");
const stripe = new Stripe(key, {
  apiVersion: "2026-11-18.endive",
  httpClient: Stripe.createFetchHttpClient(),
});
const db = createClient(setting("SUPABASE_URL"), setting("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});
const membership = setting("BOOKSPARK_MEMBERSHIP_PRICE");
const coursePrices = JSON.parse(Deno.env.get("BOOKSPARK_COURSE_PRICES") ?? "{}");
const courses = Object.keys(coursePrices);
if (courses.length !== 6 || !courses.every(course => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(course)) ||
    ![membership, ...Object.values(coursePrices)].every(price => /^price_[a-zA-Z0-9]+$/.test(price))) {
  throw new Error("Configure all six course prices and the membership price.");
}
const mode = Deno.env.get("BOOKSPARK_STRIPE_MODE");
if (mode !== "sandbox" && mode !== "live") throw new Error("Configure the Stripe environment.");
const keyMode = mode === "live" ? "live" : "test";
if (!new RegExp("^(?:rk|sk)_" + keyMode + "_").test(key)) throw new Error("Stripe key and mode must match.");
const webhookSecret = setting("BOOKSPARK_STRIPE_WEBHOOK_SECRET");
if (!webhookSecret?.startsWith("whsec_")) throw new Error("Configure webhook signing.");

const watchedEvents = new Set([
  "checkout.session.completed", "checkout.session.async_payment_succeeded",
  "invoice.paid", "invoice.payment_failed", "customer.subscription.created",
  "customer.subscription.updated", "customer.subscription.deleted",
  "charge.dispute.created", "charge.refunded", "radar.early_fraud_warning.created",
]);
const cors = {
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Vary": "Origin",
};
const reply = (data, status = 200) =>
  Response.json(data, { status, headers: { ...cors, "Cache-Control": "no-store" } });

async function stripeCustomer(user, ensure) {
  const result = await db.from("bookspark_customers").select("stripe_customer")
    .eq("user_id", user.id).maybeSingle();
  if (result.error) throw result.error;
  if (result.data) return result.data.stripe_customer;
  if (!ensure) return null;

  const customer = await stripe.customers.create({ metadata: { bookspark_user: user.id } },
    { idempotencyKey: "bookspark-customer-" + user.id });
  const written = await db.from("bookspark_customers").upsert({
    user_id: user.id, stripe_customer: customer.id,
  }, { onConflict: "user_id", ignoreDuplicates: true });
  if (written.error) throw written.error;
  return stripeCustomer(user, false);
}

async function invoiceInGoodStanding(id) {
  let settled = 0;
  for await (const payment of stripe.invoicePayments.list({
    invoice: id, expand: ["data.payment.payment_intent.latest_charge"],
  })) {
    if (payment.status !== "paid" || !payment.amount_paid) continue;
    const intent = payment.payment.payment_intent;
    if (!intent || typeof intent === "string" || !chargeInGoodStanding(intent.latest_charge)) return false;
    settled += payment.amount_paid;
  }
  return settled > 0;
}

async function accessFor(customer) {
  const purchased = new Set();
  if (!customer) return { member: false, purchased };
  let member = false;
  for await (const sub of stripe.subscriptions.list({
    customer, status: "active", expand: ["data.latest_invoice"],
  })) {
    if (membershipActive(sub, membership) && sub.latest_invoice &&
        typeof sub.latest_invoice !== "string" && await invoiceInGoodStanding(sub.latest_invoice.id)) {
      member = true;
      break;
    }
  }
  // Scan checkout records belonging to this authenticated account's Stripe customer.
  // Stripe is authoritative, so callbacks cannot grant access based on browser input.
  for await (const session of stripe.checkout.sessions.list({ customer, status: "complete" })) {
    const slug = session.metadata?.bookspark_course;
    if (session.mode !== "payment" || !slug || !Object.hasOwn(coursePrices, slug) ||
        purchased.has(slug) || session.payment_status !== "paid") continue;
    const verified = await stripe.checkout.sessions.retrieve(session.id, {
      expand: ["payment_intent.latest_charge", "line_items"],
    });
    if (purchasePaid(verified) &&
        verified.line_items?.data.some(item => item.price?.id === coursePrices[slug])) {
      purchased.add(slug);
    }
  }
  return { member, purchased };
}

async function webhook(request) {
  const signature = request.headers.get("Stripe-Signature");
  if (!signature) return reply({ error: "Missing signature." }, 400);
  let event;
  try {
    event = await stripe.webhooks.constructEventAsync(await request.text(), signature,
      webhookSecret, undefined, Stripe.createSubtleCryptoProvider());
  } catch {
    return reply({ error: "Invalid signature." }, 400);
  }
  if (event.livemode !== (mode === "live")) return reply({ error: "Wrong Stripe environment." }, 400);
  if (watchedEvents.has(event.type)) {
    const result = await db.from("bookspark_stripe_events").upsert({
      event_id: event.id, event_type: event.type,
    }, { onConflict: "event_id", ignoreDuplicates: true });
    if (result.error) throw result.error;
  }
  return reply({ received: true });
}

Deno.serve(async request => {
  const action = new URL(request.url).pathname.split("/").at(-1);
  try {
    if (action === "webhook" && request.method === "POST") return await webhook(request);
    if (request.headers.get("Origin") !== origin) return reply({ error: "Origin denied." }, 403);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST") return reply({ error: "Method not allowed." }, 405);
    const token = request.headers.get("Authorization")?.match(/^Bearer (.+)$/i)?.[1];
    if (!token) return reply({ error: "Please sign in." }, 401);
    const auth = await db.auth.getUser(token);
    const user = auth.data.user;
    if (auth.error || !user?.email_confirmed_at) return reply({ error: "Please verify your email and sign in." }, 401);
    if (action === "checkout" && Deno.env.get("BOOKSPARK_CHECKOUT_ENABLED") !== "true") {
      return reply({ error: "Checkout is not open yet." }, 503);
    }
    const customer = await stripeCustomer(user, action === "checkout");
    const access = await accessFor(customer);
    if (action === "library") {
      return reply({ member: access.member, purchased: [...access.purchased] });
    }
    if (action === "portal" && customer) {
      const portal = await stripe.billingPortal.sessions.create({ customer, return_url: returnUrl });
      return reply({ url: portal.url });
    }
    if (action === "portal") return reply({ error: "No billing account yet." }, 404);

    const data = await request.json().catch(() => ({}));
    const slug = typeof data.course === "string" ? data.course : "";
    if (action === "play") {
      if (!Object.hasOwn(coursePrices, slug)) return reply({ error: "Course not found." }, 404);
      if (!access.member && !access.purchased.has(slug)) return reply({ error: "This course is locked." }, 403);
      const objects = [".mp4", ".vtt", ".md"].map(extension => slug + extension);
      const result = await db.storage.from(bucket).createSignedUrls(objects, 600);
      if (result.error || result.data?.length !== objects.length || result.data.some(item => !item.signedUrl)) {
        return reply({ error: "Course files are temporarily unavailable." }, 503);
      }
      return reply({ video: result.data[0].signedUrl, captions: result.data[1].signedUrl,
        notes: result.data[2].signedUrl });
    }

    if (action !== "checkout" || !customer) return reply({ error: "Not found." }, 404);
    const monthly = data.offer === "membership";
    if (!monthly && (data.offer !== "course" || !Object.hasOwn(coursePrices, slug))) {
      return reply({ error: "Select a valid purchase." }, 400);
    }
    if (access.member || (!monthly && access.purchased.has(slug))) {
      return reply({ error: "You already have access." }, 409);
    }

    // Block charges until the assets attached to the selected offer exist.
    const required = monthly ? courses : [slug];
    const files = await db.storage.from(bucket).list("", { limit: 100 });
    const available = new Set(files.data?.map(file => file.name));
    if (files.error || required.some(course =>
      [".mp4", ".vtt", ".md"].some(extension => !available.has(course + extension)))) {
      return reply({ error: "Course materials are not ready for purchase." }, 503);
    }
    const product = monthly ? "membership" : slug;
    const priceId = monthly ? membership : coursePrices[slug];
    const price = await stripe.prices.retrieve(priceId);
    if (!price.active || price.currency !== "usd" || price.livemode !== (mode === "live") ||
        (monthly ? price.unit_amount !== 1500 || price.recurring?.interval !== "month" ||
          price.recurring?.interval_count !== 1 : price.type !== "one_time")) {
      return reply({ error: "The selected offer is not available." }, 503);
    }
    for await (const open of stripe.checkout.sessions.list({ customer, status: "open" })) {
      if (open.metadata?.bookspark_offer === product && open.url) return reply({ url: open.url });
    }
    for await (const complete of stripe.checkout.sessions.list({ customer, status: "complete" })) {
      if (complete.metadata?.bookspark_offer === product && complete.payment_status === "unpaid" &&
          Date.now() / 1000 - complete.created < 86400) {
        return reply({ error: "A payment for this offer is still being confirmed." }, 409);
      }
    }
    const checkout = await stripe.checkout.sessions.create({
      customer, mode: monthly ? "subscription" : "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      integration_identifier: "bookspark_checkout_qnbgrwma",
      adaptive_pricing: { enabled: false },
      consent_collection: { terms_of_service: "required" },
      metadata: { bookspark_offer: product, ...(monthly ? {} : { bookspark_course: slug }) },
      success_url: new URL("/learning.html?payment=return#member-library", origin).href,
      cancel_url: returnUrl,
    }, { idempotencyKey: `bookspark-${customer}-${product}-${Math.floor(Date.now() / 900000)}` });
    return reply({ url: checkout.url });
  } catch {
    return reply({ error: "The membership service is temporarily unavailable. Please try again." }, 503);
  }
});

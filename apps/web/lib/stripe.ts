import Stripe from "stripe";

let client: Stripe | null = null;

export function getStripe() {
  if (client) {
    return client;
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY em falta no .env.local");
  }

  client = new Stripe(secretKey);
  return client;
}

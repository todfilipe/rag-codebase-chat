import { SiteFooter } from "@/components/site-footer";
import { TopBar } from "@/components/top-bar";
import { listPlans, type Plan } from "@/lib/plans";
import { startCheckout } from "./actions";

const HERO_PLAN = "pro";

function planName(plan: Plan) {
  return plan.id.charAt(0).toUpperCase() + plan.id.slice(1);
}

function features(plan: Plan) {
  return [
    `${plan.max_repos} repositories`,
    `Up to ${plan.max_chunks_per_repo.toLocaleString("en")} chunks per repo`,
    `${plan.max_messages_per_month.toLocaleString("en")} messages per month`,
    "Unlimited re-indexing",
  ];
}

export default async function PricingPage() {
  const plans = await listPlans();

  return (
    <>
      <TopBar />

      <main className="mx-auto w-full max-w-[1000px] flex-1 px-6 pt-20 pb-24">
        <div className="text-center">
          <h1 className="text-3xl font-semibold tracking-tight">
            Plans and pricing
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm text-muted">
            The size of the repository you can connect is what separates the
            plans. Everything else is generous on purpose.
          </p>
        </div>

        <ul className="mt-12 grid gap-5 md:grid-cols-3">
          {plans.map((plan) => {
            const isHero = plan.id === HERO_PLAN;

            return (
              <li
                key={plan.id}
                className={`flex flex-col rounded-lg border bg-surface p-6 ${
                  isHero ? "border-accent" : "border-line"
                }`}
              >
                <div className="flex items-baseline justify-between">
                  <h2 className="text-sm font-semibold tracking-wide uppercase">
                    {planName(plan)}
                  </h2>
                  {isHero && (
                    <span className="rounded-full bg-accent/15 px-2.5 py-0.5 text-[11px] font-medium text-accent">
                      Most popular
                    </span>
                  )}
                </div>

                <p className="mt-4 text-3xl font-semibold tracking-tight">
                  €{plan.price_cents / 100}
                  <span className="ml-1 text-sm font-normal text-muted">
                    /month
                  </span>
                </p>

                <ul className="mt-6 flex flex-col gap-2.5 text-sm text-muted">
                  {features(plan).map((feature) => (
                    <li key={feature}>{feature}</li>
                  ))}
                </ul>

                <div className="mt-8 pt-2">
                  {plan.stripe_price_id ? (
                    <form action={startCheckout}>
                      <input type="hidden" name="plan_id" value={plan.id} />
                      <button
                        type="submit"
                        className={`w-full rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                          isHero
                            ? "bg-accent text-canvas hover:opacity-90"
                            : "border border-line bg-surface hover:border-muted"
                        }`}
                      >
                        Subscribe to {planName(plan)}
                      </button>
                    </form>
                  ) : (
                    <p className="text-center text-sm text-muted">
                      Included with every account
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </main>

      <SiteFooter />
    </>
  );
}

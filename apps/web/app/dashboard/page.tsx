import Link from "next/link";
import { RepoRow } from "@/components/repo-row";
import { SiteFooter } from "@/components/site-footer";
import { TopBar } from "@/components/top-bar";
import { UsageMeters } from "@/components/usage-meters";
import { getMyPlan } from "@/lib/plans";
import { relativeTime } from "@/lib/relative-time";
import { listIndexedRepos } from "@/lib/repos";
import { getMySubscription } from "@/lib/subscription";
import { getMyUsage } from "@/lib/usage";
import { openBillingPortal } from "./actions";

export default async function DashboardPage() {
  const repos = await listIndexedRepos();
  const subscription = await getMySubscription();
  const plan = await getMyPlan();
  const usage = await getMyUsage();

  return (
    <>
      <TopBar />

      <main className="mx-auto w-full max-w-[860px] flex-1 px-6 pt-20 pb-24">
        <div className="mb-10 rounded-lg border border-line bg-surface px-6 py-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs tracking-wide text-muted uppercase">
                Current plan
              </p>
              <p className="mt-1 text-lg font-semibold capitalize">{plan.id}</p>
            </div>

            {subscription ? (
              <form action={openBillingPortal}>
                <button
                  type="submit"
                  className="rounded-md border border-line bg-surface px-3.5 py-1.5 text-sm font-medium transition-colors hover:border-muted"
                >
                  Manage subscription
                </button>
              </form>
            ) : (
              <Link
                href="/pricing"
                className="rounded-md bg-accent px-3.5 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
              >
                See plans
              </Link>
            )}
          </div>

          <div className="mt-6 border-t border-line pt-5">
            <UsageMeters
              repos={repos.length}
              maxRepos={plan.max_repos}
              messages={usage.messages}
              maxMessages={plan.max_messages_per_month}
              chunks={usage.chunks}
              maxChunks={plan.max_chunks_per_month}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <h1 className="text-2xl font-semibold tracking-tight">
            Your repositories
          </h1>
          <Link href="/" className="text-sm text-accent hover:underline">
            Connect another repository →
          </Link>
        </div>

        {repos.length === 0 ? (
          <div className="mt-10 rounded-lg border border-line bg-surface px-6 py-16 text-center">
            <p className="text-sm text-fg">No repositories connected yet.</p>
            <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
              Paste a public GitHub URL on the home page and it shows up here
              once it finishes indexing.
            </p>
          </div>
        ) : (
          <ul className="mt-8 divide-y divide-line rounded-lg border border-line bg-surface">
            {repos.map((repo) => (
              <RepoRow
                key={repo.id}
                repo={repo}
                lastIndexed={relativeTime(repo.indexed_at)}
              />
            ))}
          </ul>
        )}
      </main>

      <SiteFooter />
    </>
  );
}

import type { ServiceError } from "./index-status";
import { getMyPlan } from "./plans";
import { countMyRepos, getMyUsage } from "./usage";

export async function checkRepoLimit(
  isNewRepo: boolean
): Promise<ServiceError | null> {
  if (!isNewRepo) {
    return null;
  }

  const plan = await getMyPlan();
  const repos = await countMyRepos();

  if (repos >= plan.max_repos) {
    return {
      error: "repo_limit_reached",
      message: `O plano ${plan.id} permite ${plan.max_repos} repositórios e já tens ${repos}.`,
    };
  }

  return null;
}

export async function checkMessageLimit(): Promise<ServiceError | null> {
  const plan = await getMyPlan();
  const usage = await getMyUsage();

  if (usage.messages >= plan.max_messages_per_month) {
    return {
      error: "message_limit_reached",
      message: `O plano ${plan.id} permite ${plan.max_messages_per_month} mensagens por mês e já usaste ${usage.messages}.`,
    };
  }

  return null;
}

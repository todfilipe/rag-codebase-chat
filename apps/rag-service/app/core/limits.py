from datetime import datetime, timezone

import httpx


PAID_STATUSES = ("active", "trialing")


class LimitsError(Exception):
    pass


class LimitReached(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


def current_month() -> str:
    today = datetime.now(timezone.utc).date()
    return today.replace(day=1).isoformat()


async def get_plan(supabase: httpx.AsyncClient, user_id: str) -> dict:
    response = await supabase.get(
        "/subscriptions",
        params={"user_id": f"eq.{user_id}", "select": "plan_id,status"},
    )

    if not response.is_success:
        raise LimitsError(
            f"Falha a ler a subscrição ({response.status_code}): {response.text}"
        )

    rows = response.json()

    plan_id = "free"
    if rows and rows[0]["status"] in PAID_STATUSES:
        plan_id = rows[0]["plan_id"]

    response = await supabase.get(
        "/plans",
        params={
            "id": f"eq.{plan_id}",
            "select": "id,max_chunks_per_repo,max_chunks_per_month",
        },
    )

    if not response.is_success:
        raise LimitsError(
            f"Falha a ler o plano ({response.status_code}): {response.text}"
        )

    rows = response.json()
    if not rows:
        raise LimitsError(f"O plano {plan_id} não existe na tabela plans.")

    return rows[0]


async def get_month_chunks(supabase: httpx.AsyncClient, user_id: str) -> int:
    response = await supabase.get(
        "/usage_monthly",
        params={
            "user_id": f"eq.{user_id}",
            "month": f"eq.{current_month()}",
            "select": "chunks",
        },
    )

    if not response.is_success:
        raise LimitsError(
            f"Falha a ler o uso do mês ({response.status_code}): {response.text}"
        )

    rows = response.json()
    return rows[0]["chunks"] if rows else 0


async def add_chunk_usage(
    supabase: httpx.AsyncClient, user_id: str, chunks: int
) -> None:
    if chunks == 0:
        return

    response = await supabase.post(
        "/rpc/add_usage",
        json={
            "usage_user_id": user_id,
            "extra_messages": 0,
            "extra_chunks": chunks,
        },
    )

    if not response.is_success:
        raise LimitsError(
            f"Falha a gravar o uso ({response.status_code}): {response.text}"
        )

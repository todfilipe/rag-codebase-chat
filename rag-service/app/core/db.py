"""Acesso ao Supabase.

O cliente oficial `supabase-py` é síncrono. Em vez de embrulhar tudo num
wrapper async falso, empurramos cada chamada para um worker thread — assim o
event loop fica livre para as chamadas HTTP, que são o verdadeiro gargalo.
"""

import asyncio
from collections.abc import Callable
from functools import lru_cache
from typing import Any, TypeVar

from supabase import Client, create_client

from app.config import get_settings
from app.errors import DatabaseError

T = TypeVar("T")


@lru_cache
def get_supabase() -> Client:
    settings = get_settings()
    return create_client(settings.supabase_url, settings.supabase_service_role_key)


def rows_of(result: Any) -> list[dict[str, Any]]:
    """Normaliza o `.data` do postgrest, tipado como JSON genérico, para linhas."""
    data: Any = result.data
    return list(data) if isinstance(data, list) else []


async def run_db(operation: Callable[[], T], context: str) -> T:
    """Corre uma operação síncrona do Supabase fora do event loop."""
    try:
        return await asyncio.to_thread(operation)
    # Qualquer falha do cliente (rede, PostgREST, auth) sai daqui como DatabaseError.
    except Exception as exc:
        raise DatabaseError(f"Falha a {context}: {exc}") from exc

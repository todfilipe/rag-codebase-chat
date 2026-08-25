import httpx

from app.core.config import settings


def create_supabase_client() -> httpx.AsyncClient:
    """O Supabase expõe as tabelas como REST (PostgREST). O supabase-js do protótipo
    era só um construtor de URLs por cima disto."""
    return httpx.AsyncClient(
        base_url=f"{settings.supabase_url}/rest/v1",
        headers={
            # A service_role_key faz bypass ao RLS por design (decisão de 14-05-2026).
            # Só existe do lado do servidor; nunca pode chegar ao browser.
            "apikey": settings.supabase_service_role_key,
            "Authorization": f"Bearer {settings.supabase_service_role_key}",
            "Content-Type": "application/json",
        },
        timeout=30.0,
    )

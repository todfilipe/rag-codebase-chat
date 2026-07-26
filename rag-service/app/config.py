"""Configuração do serviço, lida do ambiente e validada no arranque."""

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Variáveis de ambiente necessárias ao serviço.

    Validadas à cabeça em vez de a meio de uma indexação: uma chave em falta
    deve rebentar no arranque, não depois de já termos gasto quota da Gemini.
    """

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    gemini_api_key: str = Field(min_length=1)
    github_token: str = Field(min_length=1)
    supabase_url: str = Field(min_length=1)
    supabase_service_role_key: str = Field(min_length=1)

    # Segredo partilhado com a camada Next.js. O serviço não é público.
    rag_service_token: str = Field(min_length=1)


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]

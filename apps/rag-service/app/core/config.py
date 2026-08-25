from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # env_file é relativo ao diretório onde o processo arranca, por isso o uvicorn
    # tem de ser lançado a partir de apps/rag-service.
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    gemini_api_key: str
    github_token: str
    supabase_url: str
    supabase_service_role_key: str
    # Tem de ser byte-a-byte igual ao valor no .env.local do apps/web.
    rag_service_internal_token: str


# Instanciar aqui, no import, é o que faz o serviço rebentar no arranque quando
# falta uma variável, em vez de rebentar a meio de uma indexação já a decorrer.
settings = Settings()

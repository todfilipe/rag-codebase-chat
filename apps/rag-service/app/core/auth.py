import secrets

from fastapi import Header

from app.core.config import settings


class InvalidInternalToken(Exception):
    """Levantada pela dependência e traduzida em 401 pelo handler em main.py.
    Existe para a resposta seguir o shape {"error", "message"} do contrato, em vez
    do {"detail"} que o HTTPException do FastAPI produziria."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


def require_internal_token(authorization: str | None = Header(default=None)) -> None:
    """O `rag-service` não tem utilizadores: este token só responde a "és o meu
    serviço irmão?", não a "quem és tu?". A identidade do utilizador chega na Fase 4,
    por cima disto e não em vez disto."""
    if authorization is None or not authorization.startswith("Bearer "):
        raise InvalidInternalToken(
            "missing_internal_token",
            "Falta o header Authorization: Bearer <RAG_SERVICE_INTERNAL_TOKEN>.",
        )

    received = authorization.removeprefix("Bearer ")

    # compare_digest em vez de `==` para o tempo de comparação não depender de
    # quantos caracteres iniciais acertaram.
    if not secrets.compare_digest(received, settings.rag_service_internal_token):
        raise InvalidInternalToken(
            "invalid_internal_token", "Token interno inválido."
        )

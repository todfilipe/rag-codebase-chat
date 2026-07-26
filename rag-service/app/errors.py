"""Excepções de domínio.

Cada uma carrega o status HTTP com que deve sair, para que `main.py` tenha um
único handler em vez de um `try/except` por rota.
"""


class RagServiceError(Exception):
    """Base de todos os erros esperados do serviço."""

    status_code = 500

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class UnauthorizedError(RagServiceError):
    """O pedido não trouxe o segredo partilhado com a camada Next.js."""

    status_code = 401


class InvalidRepoUrlError(RagServiceError):
    """A URL não aponta para um repositório do GitHub utilizável."""

    status_code = 400


class RepoTooLargeError(RagServiceError):
    """A árvore do repositório excede o que a GitHub API devolve de uma vez."""

    status_code = 400


class FileNotFoundInRepoError(RagServiceError):
    """O ficheiro pedido não existe na árvore do repositório."""

    status_code = 404


class UpstreamAPIError(RagServiceError):
    """A GitHub ou a Gemini responderam com erro."""

    status_code = 502


class EmbeddingDimensionError(RagServiceError):
    """O vector devolvido não tem as dimensões que a coluna `embedding` espera."""

    status_code = 502


class DatabaseError(RagServiceError):
    """O Supabase falhou uma escrita ou uma leitura."""

    status_code = 500

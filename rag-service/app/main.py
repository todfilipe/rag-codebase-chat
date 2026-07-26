"""Serviço HTTP que expõe o pipeline RAG à camada Next.js."""

import secrets
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Annotated

import httpx
from fastapi import Depends, FastAPI, Header, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.core.generator import generate_answer
from app.core.indexer import index_repo
from app.core.retriever import retrieve_chunks
from app.errors import RagServiceError, UnauthorizedError
from app.schemas import (
    ChatRequest,
    ChatResponse,
    ErrorResponse,
    IndexRequest,
    IndexResponse,
    Source,
)

# A indexação de um repo grande demora minutos; as chamadas individuais à
# GitHub/Gemini não devem, e é isso que este timeout protege.
HTTP_TIMEOUT = httpx.Timeout(60.0, connect=10.0)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Valida a configuração e abre um cliente HTTP para toda a vida do processo."""
    get_settings()
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
        app.state.http = client
        yield


app = FastAPI(title="RAG Codebase Chat — serviço", lifespan=lifespan)


def get_http(request: Request) -> httpx.AsyncClient:
    client: httpx.AsyncClient = request.app.state.http
    return client


async def require_internal_token(
    x_internal_token: Annotated[str | None, Header()] = None,
) -> None:
    """O serviço só aceita pedidos da camada Next.js, não da internet."""
    expected = get_settings().rag_service_token
    if not x_internal_token or not secrets.compare_digest(x_internal_token, expected):
        raise UnauthorizedError("Token interno em falta ou inválido")


@app.exception_handler(RagServiceError)
async def handle_service_error(request: Request, exc: RagServiceError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content=ErrorResponse(error=exc.message).model_dump(),
    )


@app.exception_handler(RequestValidationError)
async def handle_validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
    """Uniformiza o corpo de erro: quem consome o serviço lê sempre `error`."""
    problems = "; ".join(
        f"{'.'.join(str(part) for part in error['loc'][1:])}: {error['msg']}"
        for error in exc.errors()
    )
    return JSONResponse(
        status_code=422,
        content=ErrorResponse(error=f"Pedido inválido ({problems})").model_dump(),
    )


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/index", response_model=IndexResponse, dependencies=[Depends(require_internal_token)])
async def index(
    payload: IndexRequest,
    client: Annotated[httpx.AsyncClient, Depends(get_http)],
) -> IndexResponse:
    started_at = time.perf_counter()
    result = await index_repo(client, payload.github_url)

    return IndexResponse(
        repo_id=result.repo_id,
        files_indexed=result.files_indexed,
        chunks_created=result.chunks_created,
        duration_ms=_elapsed_ms(started_at),
    )


@app.post("/chat", response_model=ChatResponse, dependencies=[Depends(require_internal_token)])
async def chat(
    payload: ChatRequest,
    client: Annotated[httpx.AsyncClient, Depends(get_http)],
) -> ChatResponse:
    started_at = time.perf_counter()

    chunks = await retrieve_chunks(client, payload.question, payload.repo_id, payload.k)
    answer = await generate_answer(client, payload.question, chunks)

    return ChatResponse(
        answer=answer,
        sources=[
            Source(
                file_path=chunk.file_path,
                similarity=round(chunk.similarity, 3),
                chunk_index=chunk.chunk_index,
            )
            for chunk in chunks
        ],
        duration_ms=_elapsed_ms(started_at),
    )


def _elapsed_ms(started_at: float) -> int:
    return int((time.perf_counter() - started_at) * 1000)

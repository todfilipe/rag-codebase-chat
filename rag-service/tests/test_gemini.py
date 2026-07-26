"""Testes das duas chamadas à Gemini: embeddings e geração."""

import httpx
import pytest
import respx

from app.core.embeddings import EMBEDDING_DIMENSIONS, GEMINI_EMBED_ENDPOINT, generate_embedding
from app.core.generator import (
    GEMINI_GENERATE_ENDPOINT,
    build_user_prompt,
    generate_answer,
)
from app.core.retriever import RetrievedChunk
from app.errors import EmbeddingDimensionError, UpstreamAPIError


def _chunk(file_path: str, content: str) -> RetrievedChunk:
    return RetrievedChunk(
        id="1",
        file_path=file_path,
        content=content,
        start_offset=0,
        end_offset=len(content),
        chunk_index=0,
        similarity=0.9,
    )


@respx.mock
async def test_generate_embedding_pede_768_dimensoes_e_devolve_o_vector() -> None:
    route = respx.post(GEMINI_EMBED_ENDPOINT).respond(
        json={"embedding": {"values": [0.1] * EMBEDDING_DIMENSIONS}}
    )

    async with httpx.AsyncClient() as client:
        vector = await generate_embedding(client, "hello world")

    assert len(vector) == EMBEDDING_DIMENSIONS
    request_body = route.calls[0].request.read().decode()
    assert '"outputDimensionality":768' in request_body.replace(" ", "")


@respx.mock
async def test_generate_embedding_rejeita_numero_de_dimensoes_errado() -> None:
    respx.post(GEMINI_EMBED_ENDPOINT).respond(json={"embedding": {"values": [0.1] * 3072}})

    async with httpx.AsyncClient() as client:
        with pytest.raises(EmbeddingDimensionError):
            await generate_embedding(client, "hello world")


@respx.mock
async def test_generate_embedding_propaga_erro_http() -> None:
    respx.post(GEMINI_EMBED_ENDPOINT).respond(status_code=429, text="rate limited")

    async with httpx.AsyncClient() as client:
        with pytest.raises(UpstreamAPIError):
            await generate_embedding(client, "hello world")


def test_build_user_prompt_identifica_cada_ficheiro_e_separa_excertos() -> None:
    prompt = build_user_prompt(
        "o que faz o login?",
        [_chunk("src/auth.ts", "function login() {}"), _chunk("src/db.ts", "const db = 1;")],
    )

    assert "## Ficheiro: src/auth.ts" in prompt
    assert "## Ficheiro: src/db.ts" in prompt
    assert "\n\n---\n\n" in prompt
    assert prompt.endswith("Pergunta: o que faz o login?")


@respx.mock
async def test_generate_answer_devolve_o_texto_do_primeiro_candidato() -> None:
    respx.post(GEMINI_GENERATE_ENDPOINT).respond(
        json={"candidates": [{"content": {"parts": [{"text": "A resposta."}]}}]}
    )

    async with httpx.AsyncClient() as client:
        answer = await generate_answer(client, "porquê?", [_chunk("a.py", "x = 1")])

    assert answer == "A resposta."


@respx.mock
async def test_generate_answer_falha_quando_a_resposta_vem_vazia() -> None:
    respx.post(GEMINI_GENERATE_ENDPOINT).respond(json={"candidates": []})

    async with httpx.AsyncClient() as client:
        with pytest.raises(UpstreamAPIError):
            await generate_answer(client, "porquê?", [_chunk("a.py", "x = 1")])

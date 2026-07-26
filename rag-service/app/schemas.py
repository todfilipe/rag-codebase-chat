"""Contrato HTTP do serviço: o que entra e o que sai de cada endpoint."""

from pydantic import BaseModel, Field

from app.core.retriever import DEFAULT_K


class IndexRequest(BaseModel):
    github_url: str = Field(min_length=1)


class IndexResponse(BaseModel):
    repo_id: str
    files_indexed: int
    chunks_created: int
    duration_ms: int


class ChatRequest(BaseModel):
    question: str = Field(min_length=1)
    repo_id: str = Field(min_length=1)
    k: int = Field(default=DEFAULT_K, ge=1, le=20)


class Source(BaseModel):
    file_path: str
    similarity: float
    chunk_index: int


class ChatResponse(BaseModel):
    answer: str
    sources: list[Source]
    duration_ms: int


class ErrorResponse(BaseModel):
    error: str

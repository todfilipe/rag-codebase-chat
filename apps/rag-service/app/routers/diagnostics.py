"""Endpoints de diagnóstico, equivalentes aos `/api/test-*` do protótipo TS.
Servem para testar retrieval e geração isoladamente com um `curl`. Vão embora
quando o `POST /query` com SSE estiver pronto."""

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.core.embeddings import create_gemini_client
from app.core.generator import generate_answer
from app.core.retriever import retrieve_chunks


router = APIRouter(prefix="/diagnostics")


@router.get("/retrieve")
async def retrieve(q: str, repo_id: str):
    chunks = await retrieve_chunks(q, repo_id)
    return {
        "question": q,
        "repo_id": repo_id,
        "count": len(chunks),
        "results": [
            {
                "similarity": round(chunk.similarity, 3),
                "file_path": chunk.file_path,
                "offsets": f"{chunk.start_offset}-{chunk.end_offset}",
                "preview": chunk.content[:200],
            }
            for chunk in chunks
        ],
    }


@router.get("/generate")
async def generate(q: str, repo_id: str):
    chunks = await retrieve_chunks(q, repo_id)

    if not chunks:
        return JSONResponse(
            status_code=404,
            content={"error": "repo_not_indexed", "message": f"Sem chunks para o repo {repo_id}."},
        )

    async with create_gemini_client() as gemini:
        answer = await generate_answer(gemini, q, chunks)

    return {
        "question": q,
        "answer": answer,
        "sources": [
            {"file_path": chunk.file_path, "similarity": round(chunk.similarity, 3)}
            for chunk in chunks
        ],
    }

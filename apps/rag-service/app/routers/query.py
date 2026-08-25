import json

from fastapi import APIRouter
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

from app.core.embeddings import GeminiApiError, create_gemini_client
from app.core.generator import stream_answer
from app.core.retriever import RetrievalError, RetrievedChunk, retrieve_chunks


router = APIRouter()


class QueryRequest(BaseModel):
    repo_id: str
    question: str
    user_id: str | None = None


def sse_event(event: str, data: dict) -> str:
    # ensure_ascii=False para os acentos irem como texto e não como \u00e7.
    # O json.dumps escapa os \n de dentro das strings, que de outra forma
    # partiriam o evento ao meio (em SSE a linha em branco é o terminador).
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


async def event_stream(question: str, chunks: list[RetrievedChunk]):
    yield sse_event(
        "sources",
        {
            "sources": [
                {
                    "file_path": chunk.file_path,
                    "similarity": round(chunk.similarity, 3),
                    "start_offset": chunk.start_offset,
                    "end_offset": chunk.end_offset,
                }
                for chunk in chunks
            ]
        },
    )

    try:
        async with create_gemini_client() as gemini:
            async for text in stream_answer(gemini, question, chunks):
                yield sse_event("token", {"text": text})
    except GeminiApiError as error:
        # O 200 OK já foi enviado com o header do stream, por isso um erro aqui
        # só pode ser comunicado dentro do próprio stream.
        yield sse_event("error", {"error": "generation_failed", "message": str(error)})
        return

    yield sse_event("done", {"finish_reason": "stop"})


@router.post("/query")
async def query(request: QueryRequest):
    # O retrieval corre antes de a resposta começar, por isso falhas aqui ainda
    # podem ser um 4xx/5xx normal em vez de um evento de erro a meio do stream.
    try:
        chunks = await retrieve_chunks(request.question, request.repo_id)
    except (GeminiApiError, RetrievalError) as error:
        return JSONResponse(
            status_code=500,
            content={"error": "retrieval_failed", "message": str(error)},
        )

    if not chunks:
        return JSONResponse(
            status_code=404,
            content={
                "error": "repo_not_indexed",
                "message": f"Não há chunks indexados para o repo {request.repo_id}.",
            },
        )

    return StreamingResponse(
        event_stream(request.question, chunks),
        media_type="text/event-stream",
    )

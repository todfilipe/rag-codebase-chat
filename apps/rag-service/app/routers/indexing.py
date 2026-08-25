from fastapi import APIRouter, BackgroundTasks
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.core.embeddings import GeminiApiError
from app.core.github_client import GithubApiError, InvalidRepoUrl, RepoNotFound
from app.core.indexer import (
    IndexingError,
    NoIndexableFiles,
    prepare_indexing,
    run_indexing,
)
from app.core.supabase import create_supabase_client


router = APIRouter()

STATUS_FIELDS = "id,index_stage,files_found,chunks_processed,chunks_total,index_error"


class IndexRequest(BaseModel):
    repo_url: str
    # Faz parte do contrato desde já (docs/API-CONTRACT.md), mas só passa a ser
    # usado na Fase 4. Até lá chega sempre nulo e é ignorado.
    user_id: str | None = None


def _error(status: int, code: str, message: str) -> JSONResponse:
    # O HTTPException do FastAPI devolveria {"detail": ...}; o contrato pede
    # {"error": ..., "message": ...}, por isso a resposta é montada à mão.
    return JSONResponse(status_code=status, content={"error": code, "message": message})


@router.post("/index")
async def index(request: IndexRequest, background: BackgroundTasks):
    try:
        prepared = await prepare_indexing(request.repo_url)
    except InvalidRepoUrl as error:
        return _error(400, "invalid_repo_url", str(error))
    except RepoNotFound as error:
        return _error(404, "repo_not_found", str(error))
    except NoIndexableFiles as error:
        return _error(422, "no_indexable_files", str(error))
    except (GithubApiError, GeminiApiError, IndexingError) as error:
        return _error(500, "indexing_failed", str(error))

    # A task arranca depois de esta resposta sair, e vive no processo do
    # rag-service — não na ligação HTTP. Fechar o browser deixa de a matar.
    background.add_task(run_indexing, prepared)

    return JSONResponse(
        status_code=202,
        content={
            "repo_id": prepared.repo_id,
            "owner": prepared.owner,
            "repo": prepared.repo,
            "files_found": len(prepared.files),
            "stage": "reading_files",
        },
    )


@router.get("/index/{repo_id}/status")
async def index_status(repo_id: str):
    async with create_supabase_client() as supabase:
        response = await supabase.get(
            "/repos", params={"id": f"eq.{repo_id}", "select": STATUS_FIELDS}
        )

    if not response.is_success:
        return _error(500, "status_unavailable", response.text)

    rows = response.json()
    if not rows:
        return _error(404, "repo_not_found", f"Não existe repo com id {repo_id}.")

    repo = rows[0]
    return {
        "repo_id": repo["id"],
        "stage": repo["index_stage"],
        "files_found": repo["files_found"],
        "chunks_processed": repo["chunks_processed"],
        "chunks_total": repo["chunks_total"],
        "error": repo["index_error"],
    }

from uuid import UUID

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

STATUS_FIELDS = (
    "id,owner,repo,index_stage,files_found,chunks_processed,chunks_total,index_error"
)


class IndexRequest(BaseModel):
    repo_url: str
    user_id: str | None = None
    force: bool = False


def _error(status: int, code: str, message: str) -> JSONResponse:
    # O HTTPException do FastAPI devolveria {"detail": ...}; o contrato pede
    # {"error": ..., "message": ...}, por isso a resposta é montada à mão.
    return JSONResponse(status_code=status, content={"error": code, "message": message})


@router.post("/index")
async def index(request: IndexRequest, background: BackgroundTasks):
    if request.user_id is None:
        return _error(
            400,
            "missing_user_id",
            "Desde a Fase 4 todo o pedido de indexação tem de trazer user_id.",
        )
    try:
        UUID(request.user_id)
    except ValueError:
        return _error(400, "invalid_user_id", f"user_id inválido: {request.user_id}")

    try:
        prepared = await prepare_indexing(
            request.repo_url, request.user_id, request.force
        )
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
async def index_status(repo_id: str, user_id: str | None = None):
    if user_id is None:
        return _error(
            400,
            "missing_user_id",
            "O estado de uma indexação só se lê com o user_id do dono.",
        )
    try:
        UUID(user_id)
    except ValueError:
        return _error(400, "invalid_user_id", f"user_id inválido: {user_id}")
    try:
        UUID(repo_id)
    except ValueError:
        return _error(404, "repo_not_found", f"Não existe repo com id {repo_id}.")

    async with create_supabase_client() as supabase:
        response = await supabase.get(
            "/repos",
            params={
                "id": f"eq.{repo_id}",
                "user_id": f"eq.{user_id}",
                "select": STATUS_FIELDS,
            },
        )

    if not response.is_success:
        return _error(500, "status_unavailable", response.text)

    rows = response.json()
    if not rows:
        return _error(404, "repo_not_found", f"Não existe repo com id {repo_id}.")

    repo = rows[0]
    return {
        "repo_id": repo["id"],
        # owner/repo vêm daqui e não do 202 porque o repo_id vive no URL: quem
        # recarrega /repo/{id} tem só o uuid e continua a precisar do nome para
        # mostrar no ecrã.
        "owner": repo["owner"],
        "repo": repo["repo"],
        "stage": repo["index_stage"],
        "files_found": repo["files_found"],
        "chunks_processed": repo["chunks_processed"],
        "chunks_total": repo["chunks_total"],
        "error": repo["index_error"],
    }

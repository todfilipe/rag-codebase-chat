"""Duplo do cliente Supabase.

Regista a sequência de operações para que os testes possam afirmar a ordem
upsert -> delete -> insert sem tocar numa base de dados real.
"""

from typing import Any


class _Result:
    def __init__(self, data: list[dict[str, Any]]) -> None:
        self.data = data


class _Query:
    def __init__(self, calls: list[tuple[str, Any]], table: str, repo_id: str) -> None:
        self._calls = calls
        self._table = table
        self._repo_id = repo_id
        self._data: list[dict[str, Any]] = []

    def seed(self, data: list[dict[str, Any]]) -> None:
        self._data = data

    def upsert(self, row: dict[str, Any], on_conflict: str) -> "_Query":
        self._calls.append(
            ("upsert", {"table": self._table, "row": row, "on_conflict": on_conflict})
        )
        self._data = [{"id": self._repo_id}]
        return self

    def delete(self) -> "_Query":
        self._calls.append(("delete", {"table": self._table}))
        return self

    def eq(self, column: str, value: Any) -> "_Query":
        self._calls.append(("eq", {"column": column, "value": value}))
        return self

    def insert(self, rows: list[dict[str, Any]]) -> "_Query":
        self._calls.append(("insert", {"table": self._table, "rows": rows}))
        self._data = rows
        return self

    def execute(self) -> _Result:
        return _Result(self._data)


class FakeSupabase:
    """Aceita a mesma cadeia fluente que o cliente real, sem persistir nada."""

    def __init__(
        self, repo_id: str = "repo-uuid", rpc_rows: list[dict[str, Any]] | None = None
    ) -> None:
        self.calls: list[tuple[str, Any]] = []
        self._repo_id = repo_id
        self._rpc_rows = rpc_rows or []

    def table(self, name: str) -> _Query:
        return _Query(self.calls, name, self._repo_id)

    def rpc(self, name: str, params: dict[str, Any]) -> _Query:
        self.calls.append(("rpc", {"name": name, "params": params}))
        query = _Query(self.calls, name, self._repo_id)
        query.seed(self._rpc_rows)
        return query

    def operations(self) -> list[str]:
        return [operation for operation, _ in self.calls]

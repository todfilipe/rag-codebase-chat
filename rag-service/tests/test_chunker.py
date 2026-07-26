"""Testes do chunker: o overlap e os offsets são o contrato com a base de dados."""

from itertools import pairwise

import pytest

from app.core.chunker import CHUNK_SIZE, OVERLAP, STEP, chunk_text


def test_texto_vazio_nao_produz_chunks() -> None:
    assert chunk_text("") == []


def test_texto_mais_curto_que_um_chunk_produz_um_so() -> None:
    text = "a" * 500
    chunks = chunk_text(text)

    assert len(chunks) == 1
    assert chunks[0].content == text
    assert (chunks[0].start, chunks[0].end) == (0, 500)


def test_texto_exactamente_do_tamanho_de_um_chunk_nao_gera_sobra() -> None:
    chunks = chunk_text("a" * CHUNK_SIZE)

    assert len(chunks) == 1
    assert chunks[0].end == CHUNK_SIZE


def test_ultimo_chunk_nao_e_so_overlap() -> None:
    # Sem o break, o texto de CHUNK_SIZE + STEP chars geraria um terceiro chunk
    # composto apenas pelos OVERLAP chars finais.
    chunks = chunk_text("a" * (CHUNK_SIZE + STEP))

    assert len(chunks) == 2
    assert chunks[-1].end == CHUNK_SIZE + STEP


def test_chunks_sobrepoem_se_em_overlap_chars() -> None:
    text = "".join(chr(ord("a") + index % 26) for index in range(5000))
    chunks = chunk_text(text)

    assert len(chunks) > 1
    for previous, current in pairwise(chunks):
        assert previous.content[-OVERLAP:] == current.content[:OVERLAP]
        assert current.start == previous.start + STEP


@pytest.mark.parametrize("length", [1, 199, 1801, 2001, 3600, 10_000])
def test_offsets_cobrem_o_texto_todo_e_batem_com_o_conteudo(length: int) -> None:
    text = "x" * length
    chunks = chunk_text(text)

    assert chunks[0].start == 0
    assert chunks[-1].end == length
    for chunk in chunks:
        assert chunk.content == text[chunk.start : chunk.end]
        assert 0 < chunk.end - chunk.start <= CHUNK_SIZE

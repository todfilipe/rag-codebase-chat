from app.core.chunker import CHUNK_SIZE, OVERLAP, chunk_text


def alphabet_text(length: int) -> str:
    return "".join(chr(ord("a") + offset % 26) for offset in range(length))


def test_empty_file_has_no_chunks():
    assert chunk_text("") == []


def test_file_that_fits_is_a_single_chunk():
    text = alphabet_text(CHUNK_SIZE)

    [chunk] = chunk_text(text)

    assert chunk.content == text
    assert (chunk.start, chunk.end) == (0, CHUNK_SIZE)


def test_one_char_over_the_limit_opens_a_second_chunk_with_overlap():
    text = alphabet_text(CHUNK_SIZE + 1)

    first, second = chunk_text(text)

    assert second.start == CHUNK_SIZE - OVERLAP
    assert second.end == len(text)
    assert first.content[-OVERLAP:] == second.content[:OVERLAP]


def test_no_trailing_chunk_made_only_of_overlap():
    text = alphabet_text(2 * CHUNK_SIZE - OVERLAP)

    assert len(chunk_text(text)) == 2


def test_chunks_rebuild_the_original_file():
    text = alphabet_text(5000)

    chunks = chunk_text(text)

    for previous, current in zip(chunks, chunks[1:]):
        assert current.start == previous.end - OVERLAP

    rebuilt = chunks[0].content + "".join(
        chunk.content[OVERLAP:] for chunk in chunks[1:]
    )
    assert rebuilt == text


def test_lines_match_github_numbering():
    text = ("x" * 99 + "\n") * 50

    lines = [(chunk.start_line, chunk.end_line) for chunk in chunk_text(text)]

    assert lines == [(1, 20), (19, 38), (37, 50)]

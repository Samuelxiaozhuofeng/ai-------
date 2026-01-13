#!/usr/bin/env python3
import json
import sys

from sudachipy import dictionary
from sudachipy import tokenizer as sudachi_tokenizer

TOKENIZER = dictionary.Dictionary().create()
MODE = sudachi_tokenizer.Tokenizer.SplitMode.C


def safe_str(value):
    if value is None:
        return None
    s = str(value)
    if not s or s == "*":
        return None
    return s


def build_utf16_prefix_offsets(text):
    prefix = [0] * (len(text) + 1)
    acc = 0
    for i, ch in enumerate(text):
        acc += 2 if ord(ch) > 0xFFFF else 1
        prefix[i + 1] = acc
    return prefix


def tokenize_text(text):
    out = []
    if not isinstance(text, str) or not text:
        return out

    utf16_prefix = build_utf16_prefix_offsets(text)
    search_cursor = 0

    for m in TOKENIZER.tokenize(text, MODE):
        surface = safe_str(m.surface()) or ""
        if not surface:
            continue

        try:
            start_cp = int(m.begin())
            end_cp = int(m.end())
        except Exception:
            start_cp = text.find(surface, search_cursor)
            if start_cp < 0:
                continue
            end_cp = start_cp + len(surface)

        search_cursor = max(search_cursor, end_cp)

        # Frontend offsets are in JS string indices (UTF-16 code units), not Python code points.
        start = utf16_prefix[start_cp] if 0 <= start_cp <= len(text) else 0
        end = utf16_prefix[end_cp] if 0 <= end_cp <= len(text) else start + len(surface)

        pos_tags = list(m.part_of_speech() or [])
        pos = safe_str(pos_tags[0]) if len(pos_tags) > 0 else None
        pos_detail = safe_str(pos_tags[1]) if len(pos_tags) > 1 else None

        out.append(
            {
                "surface": surface,
                "lemma": safe_str(m.dictionary_form()) or surface,
                "reading": safe_str(m.reading_form()),
                "pos": pos,
                "posDetail": pos_detail,
                "start": start,
                "end": end,
            }
        )

    return out


def main():
    text = sys.stdin.read()
    tokens = tokenize_text(text)
    sys.stdout.write(json.dumps(tokens, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        sys.stderr.write(f"sudachi_tokenizer_error: {e}\n")
        sys.exit(1)

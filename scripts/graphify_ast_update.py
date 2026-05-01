"""AST-only graph refresh (avoid graphify CLI post-run bug in graphifyy 0.5.x on some installs)."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from graphify.watch import _rebuild_code


def main() -> int:
    repo = Path(__file__).resolve().parents[1]
    p = argparse.ArgumentParser(description="Rebuild graphify code graph from tree-sitter AST only.")
    p.add_argument(
        "path",
        nargs="?",
        default=".",
        help="Directory to scan (default: repo root). Relative paths resolve from repo root.",
    )
    args = p.parse_args()
    watch = (repo / args.path).resolve() if args.path != "." else repo
    if not watch.is_dir():
        print(f"error: not a directory: {watch}", file=sys.stderr)
        return 1
    ok = _rebuild_code(watch)
    if ok:
        print(
            "Code graph updated. For docs/PDFs/images run full /graphify in the assistant.",
        )
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())

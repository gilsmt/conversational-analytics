from __future__ import annotations

import argparse
import asyncio
from pathlib import Path

from app.conversations.importer import (
    import_sources,
    seed_default_definitions,
    source_files_from_path,
)
from app.db.session import SessionLocal


def default_source() -> Path:
    return Path(__file__).resolve().parents[3] / "Conversations"


async def run(source: Path) -> None:
    async with SessionLocal() as session:
        sources = source_files_from_path(source)
        summary = await import_sources(session, sources)
        await seed_default_definitions(session)
        # The seed command is a CLI unit of work, so it owns the transaction boundary.
        await session.commit()

    print(
        f"Imported {summary.imported}, skipped {summary.skipped}, "
        f"failed {summary.failed}"
    )
    for item in summary.files:
        detail = f" ({item.error})" if item.error else ""
        print(f"- {item.status}: {item.filename}{detail}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, default=default_source())
    args = parser.parse_args()
    asyncio.run(run(args.source))


if __name__ == "__main__":
    main()

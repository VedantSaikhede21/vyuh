"""Generate Pydantic v2 models from packages/shared JSON Schema.

Run via `pnpm gen:schemas` (repo root). Output: app/schemas/generated/models.py.
Deterministic: pinned generator version, no timestamp, ruff-formatted, LF endings.
"""

import subprocess
import sys
from pathlib import Path

API_DIR = Path(__file__).resolve().parent.parent
REPO_DIR = API_DIR.parent.parent
SCHEMA = REPO_DIR / "packages" / "shared" / "schema" / "vyuh.schema.json"
OUT_DIR = API_DIR / "app" / "schemas" / "generated"
OUT_FILE = OUT_DIR / "models.py"

HEADER = """\
# GENERATED FILE — DO NOT EDIT.
# Source: packages/shared (zod) → packages/shared/schema/vyuh.schema.json
# Regenerate with `pnpm gen:schemas` from the repo root.
"""


def run(args: list[str]) -> None:
    subprocess.run(args, check=True, cwd=API_DIR)  # noqa: S603


def main() -> None:
    if not SCHEMA.exists():
        sys.exit(f"Missing {SCHEMA}; run `pnpm --filter @vyuh/shared export:jsonschema` first.")
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    run(
        [
            sys.executable,
            "-m",
            "datamodel_code_generator",
            "--input",
            str(SCHEMA),
            "--input-file-type",
            "jsonschema",
            "--output",
            str(OUT_FILE),
            "--output-model-type",
            "pydantic_v2.BaseModel",
            "--target-python-version",
            "3.12",
            "--use-annotated",
            "--use-standard-collections",
            "--use-union-operator",
            "--use-subclass-enum",
            "--capitalise-enum-members",
            "--use-double-quotes",
            "--snake-case-field",
            "--allow-population-by-field-name",
            "--field-constraints",
            "--use-schema-description",
            "--use-field-description",
            "--collapse-root-models",
            "--disable-timestamp",
            "--formatters",
            "ruff-format",
            "--custom-file-header",
            HEADER,
        ]
    )
    run(
        [sys.executable, "-m", "ruff", "format", "--quiet", "--no-respect-gitignore", str(OUT_FILE)]
    )
    init = OUT_DIR / "__init__.py"
    init.write_text(
        HEADER + "from .models import *  # noqa: F403\n", encoding="utf-8", newline="\n"
    )
    text = OUT_FILE.read_text(encoding="utf-8")
    OUT_FILE.write_text(text, encoding="utf-8", newline="\n")
    print(f"Wrote {OUT_FILE.relative_to(REPO_DIR)}")


if __name__ == "__main__":
    main()

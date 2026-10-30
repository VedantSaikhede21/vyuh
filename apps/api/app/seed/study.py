"""Create user-study participants: `pnpm study:enrol 12` prints their codes.

Codes are the only identity. Keep any list linking people to codes on paper,
outside this system.
"""

import argparse

from app.core.config import get_settings
from app.core.db import make_engine, make_session_factory
from app.services.study import enrol


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("count", type=int, help="participants in total")
    args = parser.parse_args()
    factory = make_session_factory(make_engine(get_settings().database_url))
    with factory() as db:
        print("\n".join(enrol(db, args.count)))


if __name__ == "__main__":
    main()

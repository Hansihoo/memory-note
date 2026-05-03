from pathlib import Path
import sys


API_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(API_ROOT))

from app.config import get_database_url  # noqa: E402
from app.database import init_db  # noqa: E402


def main() -> None:
    init_db()
    print(f"Local migration complete: {get_database_url()}")


if __name__ == "__main__":
    main()

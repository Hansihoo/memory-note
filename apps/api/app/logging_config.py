import logging

from .config import flag_enabled, get_log_level


def configure_logging() -> None:
    logging.basicConfig(
        level=getattr(logging, get_log_level(), logging.WARNING),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )


def debug_log(flag_name: str, logger: logging.Logger, message: str, **fields: object) -> None:
    if not flag_enabled(flag_name):
        return

    safe_fields = " ".join(f"{key}={value}" for key, value in sorted(fields.items()))
    logger.debug("%s%s", message, f" {safe_fields}" if safe_fields else "")

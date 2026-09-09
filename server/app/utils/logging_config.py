import logging
import os
import sys


def setup_logging(log_file: str = "access.log", level: int = logging.INFO) -> None:
    """Send application logs to the console, and to ``log_file`` if there is one.

    The console handler is the one that always exists: under Docker it is what
    ``docker compose logs`` reads, and a file inside a container is written to a
    layer that the next ``up`` throws away.  So the image leaves
    ``AZURE2_LOG_FILE`` empty and gets stdout alone, while a bare-metal run keeps
    the file it has always had.

    An unwritable path is a warning rather than a failure. Logging is not the
    job; refusing to start the server because the log file cannot be opened
    turns a cosmetic problem into an outage.
    """
    handlers = [logging.StreamHandler(sys.stdout)]
    problem = None

    if log_file:
        try:
            log_dir = os.path.dirname(log_file)
            if log_dir:
                os.makedirs(log_dir, exist_ok=True)
            handlers.append(logging.FileHandler(log_file))
        except OSError as err:
            problem = err

    logging.basicConfig(
        level=level,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        handlers=handlers,
    )

    if problem is not None:
        logging.getLogger(__name__).warning(
            "logging to the console only: %s could not be opened (%s)",
            log_file, problem)

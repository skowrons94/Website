"""Entry point: serve the API with waitress.

``create_app`` is *not* called at import time.  Each session runs AZURE2 in a
worker process started with the ``spawn`` method, and spawning re-imports this
module in the child -- so anything built here at module scope would be built
again in every worker, complete with its own session manager and reaper thread.
Building the app inside the guard keeps the child to what it actually needs.

A WSGI server that wants the app by import should call ``create_app()`` itself
(``main:create_app`` as a factory), for the same reason.
"""

from waitress import serve

from app import create_app
from config import Config

if __name__ == "__main__":
    # max_request_body_size: waitress refuses a larger body itself (413)
    # before buffering it, which the app's own MAX_CONTENT_LENGTH cannot do
    # for a route that never reads its body.
    serve(create_app(), host=Config.HOST, port=Config.PORT,
          threads=Config.THREADS,
          max_request_body_size=Config.MAX_CONTENT_LENGTH,
          ident="")

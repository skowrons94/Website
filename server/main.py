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



def serve_options(config=Config) -> dict:
    """waitress's settings.

    max_request_body_size: waitress refuses a larger body itself (413)
    before buffering it, which the app's own MAX_CONTENT_LENGTH cannot do
    for a route that never reads its body.

    clear_untrusted_proxy_headers: waitress 3 deletes X-Forwarded-For (and
    the other proxy headers) by default before the app sees them, so behind
    Caddy every visitor had Caddy's address and the per-address limits were
    one limit for everyone.  With AZURE2_TRUSTED_PROXIES > 0 the header is
    kept for Werkzeug's ProxyFix (app.install_security), which believes
    exactly that many hops; with 0 waitress keeps deleting it.
    """
    return dict(host=config.HOST, port=config.PORT, threads=config.THREADS,
                max_request_body_size=config.MAX_CONTENT_LENGTH, ident="",
                clear_untrusted_proxy_headers=not int(config.TRUSTED_PROXIES or 0) > 0)


if __name__ == "__main__":
    serve(create_app(), **serve_options())

"""Serve an exported demo under its base path (as GitHub Pages / Caddy would): python serve.py <out> <base> <port>."""
import functools, http.server, os, sys, threading, time


def serve(out: str, base: str, port: int = 0, rsc_delay: float = 0.0):
    """rsc_delay: seconds to hold every RSC payload (?_rsc=) before answering, as a slow
    or loaded machine would; tests use it to reproduce prefetches still in flight."""
    base = base.rstrip('/')

    class H(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def send_error(self, code, *a, **k):
            srv.errors.append((code, self.path))
            return super().send_error(code, *a, **k)

        def do_GET(self):
            # Browsers ask for /favicon.ico on their own; the hosting site has one.
            if self.path.split('?')[0] == '/favicon.ico' and base:
                self.send_response(204)
                self.end_headers()
                return
            if rsc_delay and '_rsc=' in self.path:
                time.sleep(rsc_delay)
            return super().do_GET()

        def translate_path(self, path):
            p = path.split('?', 1)[0].split('#', 1)[0]
            if base and not (p == base or p.startswith(base + '/')):
                return os.path.join(out, '__outside_base__')
            return super().translate_path(p[len(base):] or '/')

    srv = http.server.ThreadingHTTPServer(('127.0.0.1', port), functools.partial(H, directory=out))
    srv.errors = []
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


if __name__ == '__main__':
    s = serve(sys.argv[1], sys.argv[2], int(sys.argv[3]))
    print('serving on', s.server_address, flush=True)
    threading.Event().wait()

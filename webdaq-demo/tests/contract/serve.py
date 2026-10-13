"""Serve an exported demo under its base path (as GitHub Pages / Caddy would): python serve.py <out> <base> <port>."""
import functools, http.server, os, sys, threading


def serve(out: str, base: str, port: int = 0):
    base = base.rstrip('/')

    class H(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def translate_path(self, path):
            p = path.split('?', 1)[0].split('#', 1)[0]
            if base and not (p == base or p.startswith(base + '/')):
                return os.path.join(out, '__outside_base__')
            return super().translate_path(p[len(base):] or '/')

    srv = http.server.ThreadingHTTPServer(('127.0.0.1', port), functools.partial(H, directory=out))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


if __name__ == '__main__':
    s = serve(sys.argv[1], sys.argv[2], int(sys.argv[3]))
    print('serving on', s.server_address, flush=True)
    threading.Event().wait()

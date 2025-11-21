"""
server.py: A simple Python web server to serve the deid web application.
This is necessary to bypass browser security restrictions on loading local files
and to set the required headers for Pyodide's SharedArrayBuffer to work.
"""

import http.server
import socketserver

PORT = 8000

class Handler(http.server.SimpleHTTPRequestHandler):
    """
    A custom request handler that sets the necessary headers for Pyodide.
    """
    def end_headers(self):
        self.send_header('Cross-Origin-Opener-Policy', 'same-origin')
        self.send_header('Cross-Origin-Embedder-Policy', 'require-corp')
        super().end_headers()

# Start the web server.
with socketserver.TCPServer(("", PORT), Handler) as httpd:
    print(f"Serving at port {PORT}")
    print("Open http://localhost:8000/wasm/ in your browser.")
    httpd.serve_forever()

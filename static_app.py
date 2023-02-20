from http.server import SimpleHTTPRequestHandler, HTTPServer


class MyHTTPRequestHandler(SimpleHTTPRequestHandler):
    def guess_type(self, path):
        if path.endswith('.js'):
            return 'application/javascript'
        else:
            return super().guess_type(path)

if __name__ == "__main__":
    httpd = HTTPServer(('0.0.0.0', 5000), MyHTTPRequestHandler)
    httpd.serve_forever()

# Toy Messaging Protocol (tmp://)
## A simple group chat messaging protocol

### Features
- Users can set  unique usernames before joining a room
- Text chat only for now

### Under The Hood
- Uses WebSockets as the underlying transport layer
- Stateful protocol

### Codebase
- `tmp_server.py` - A reference implementation server, written in Python
- `tmp_client.js` - A reference implementation frontend client written in JavaScript (obviously)
- A basic frontend app that implements the protocol using `static_app.py` to serve frontend assets and the tmp server using `app.py`

### Installation and Running
Clone this repo
```sh
git clone https://github.com/aymanimtyaz/ToyMessagingProtocol.git
```
Make a new python environment using your preffered environment tool (eg. venv, pipenv, etc.) and activate it
```sh
python3 -m venv venv
source venv/bin/activate
```
Install the required 3rd party dependencies for Python
```sh
pip3 install -r requirements.txt
```
Start the tmp server
```sh
python3 app.py
```
By default, the server runs on host '0.0.0.0' and port 5050, you can change this in `app.py`
```python
from tmp_server import TMPServer


if __name__ == "__main__":
    # change the host and port below
    chat_server = TMPServer(host="127.0.0.1", port=8000)
    chat_server.start_server()

```
Start the static app server to serve frontend assets
```sh
python3 static_app.py
```
By default, the static app server runs on host '0.0.0.0' and port 5000, you can change this in `static_app.py`
```python
from http.server import SimpleHTTPRequestHandler, HTTPServer


class MyHTTPRequestHandler(SimpleHTTPRequestHandler):
    def guess_type(self, path):
        if path.endswith('.js'):
            return 'application/javascript'
        else:
            return super().guess_type(path)

if __name__ == "__main__":
    # change the host and port below
    httpd = HTTPServer(('127.0.0.1', 8888), MyHTTPRequestHandler)
    httpd.serve_forever()

```
The app is now running and the chatroom can be entered and used via a browser :)

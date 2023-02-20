from tmp_server import TMPServer


if __name__ == "__main__":
    chat_server = TMPServer(host="0.0.0.0")
    chat_server.start_server()

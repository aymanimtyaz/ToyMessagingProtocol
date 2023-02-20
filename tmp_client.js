

export class TMPClient {
    constructor(
        // url for establishing a websocket connection to the TMP server
        url,
        // this callback will be triggered when the state is CONNECTED_USR_SET and 
        // a new message is received on the server from another user in the chatroom
        new_chat_mssg_callback,   
        // this callback will be triggered when the state changes to CONNECTED_INIT 
        // from DISCONNECTED     
        connection_init_callback,
        // this callback will be triggered when the state changes from CONNECTED_INIT
        // to CONNECTED_USR_NOTSET, this callback must return a username that will be
        // set as the client's username on the server
        username_request_callback,     
        // this callback will be triggered when the state is CONNECTED_USR_NOTSET 
        // and a SET_USR_CONFLICT message is received from the server 
        username_conflict_callback,
        // this callback will be triggered when the state changes to CONNECTED_USR_SET
        // from CONNECTED_USR_NOTSET when a STATE_UPG_2 message is received from the 
        // server with the accepted username    
        chat_init_callback,
        // this callback will be triggered when the state changes to DISCONNECTED from
        // any other state            
        disconnect_reset_callback    
    ) {
        this._url = url;
        this._websocket = null;
        this._websocket_connected = false;

        this._state = "DISCONNECTED";
        this._username = null;

        this._new_chat_mssg_callback = new_chat_mssg_callback;
        this._connection_init_callback = connection_init_callback;
        this._username_request_callback = username_request_callback;
        this._username_conflict_callback = username_conflict_callback;
        this._chat_init_callback = chat_init_callback
        this._disconnect_reset_callback = disconnect_reset_callback;
    }

    connect() {
        if (this._state === "DISCONNECTED") {
            this._websocket = new WebSocket(this._url)
            this._websocket.onopen = (open_event) => {
                this._ws_open_eventhandler(open_event)
            }
            this._websocket.onclose = (close_event) => {
                this._ws_close_eventhandler(close_event)
            }
            this._websocket.onmessage = (message_event) => {
                this._ws_message_eventhandler(message_event)
            }
            this._websocket.onerror = (error_event) => {
                this._ws_error_eventhandler(error_event)
            }
        } else {
            console.warn("WARNING: a tmp connection has already been established to the specified server")
        }
    }

    disconnect() {
        if (this._state !== "DISCONNECTED") {
            let disconnect_message = new _TMPMessage(
                "CLIENT",
                "EXIT_CHAT",
                null,
                null
            )
            this._tmp_send_message(disconnect_message)
        } else {
            console.warn("WARNING: the client is already disconnected")
        }
    }

    send_message(message) {
        if (this._state === "CONNECTED_USR_SET") {
            if (typeof message === "string" && message.length >= 1) {
                let chat_message = new _TMPMessage(
                    "CLIENT",
                    "CHAT_MSSG",
                    this._username,
                    message
                )
                this._tmp_send_message(chat_message)
            } else {
                throw new Error("TMPClient: 'message' must be a string having a minimum size of 1 byte")
            }
        } else {
            console.warn("WARNING: cannot send message when state is not 'CONNECTED_USR_SET'")
        }
    }

    _tmp_send_message(message) {
        if (message instanceof _TMPMessage === true) {
            this._websocket.send(message._build_message())
        } 
        else {
            throw new Error("TMPClient: 'message' must be an instance of class TMPMessage")
        }
    }

    _ws_open_eventhandler(open_event) {
        if (this._state === "DISCONNECTED") {
            this._state = "CONNECTED_INIT"
            this._websocket_connected = true
            this._connection_init_callback()
        } else {
            throw new Error("TMPClient: TMP Protocol synchronization failure")
        }
    }

    _ws_close_eventhandler(close_event) {
        console.log("close event handler firing")
        if (this._state !== "DISCONNECTED") {
            this._state = "DISCONNECTED"
            this._disconnect_reset_callback()
        }
        this._websocket = null
        this._websocket_connected = false
        this._username = null
    }

    async _ws_message_eventhandler(message_event) {
        let message = _TMPMessage._parse_message(message_event.data, "SERVER")
        if (message.message_type === "STATE_UPG_1") {
            if (this._state === "CONNECTED_INIT") {
                this._state = "CONNECTED_USR_NOTSET"
                let potential_username = await this._username_request_callback()
                let set_usr_message = new _TMPMessage(
                    "CLIENT",
                    "SET_USR",
                    potential_username,
                    null
                )
                this._tmp_send_message(set_usr_message)
            } else {
                throw new Error("TMPClient: TMP Protocol synchronization failure")
            }
        } else if (message.message_type === "STATE_UPG_2") {
            if (this._state === "CONNECTED_USR_NOTSET") {
                this._state = "CONNECTED_USR_SET"
                this._username = message.message_username
                this._chat_init_callback(this._username)
            } else {
                throw new Error("TMPClient: TMP Protocol synchronization failure")
            }
        } else if (message.message_type === "SET_USR_CONFLICT") {
            if (this._state === "CONNECTED_USR_NOTSET") {
                let potential_username = await this._username_conflict_callback(message.message_username)
                let set_usr_message = new _TMPMessage(
                    "CLIENT",
                    "SET_USR",
                    potential_username,
                    null
                )
                this._tmp_send_message(set_usr_message)
            } else {
                throw new Error("TMPClient: TMP Protocol synchronization failure")
            }
        } else if (message.message_type === "CHAT_MSSG") {
            if (this._state === "CONNECTED_USR_SET") {
                if (message.message_username !== this._username) {
                    this._new_chat_mssg_callback(message.message_body, message.message_username)
                }
            } else {
                throw new Error("TMPClient: TMP Protocol synchronization failure")
            }
        } else if (message.message_type === "DISCONNECT") {
            if (this._state !== "DISCONNECTED") {
                this._state = "DISCONNECTED"
                this._disconnect_reset_callback()
            } else {
                throw new Error("TMPClient: TMP Protocol synchronization failure")
            }
        } else {
            throw new Error("TMPClient: Unprocessable message_type received from upstream TMP server")
        }
    }

    _ws_error_eventhandler(error_event) {
        console.log(`TMPClient: WebSockets error - ${error_event}`)
    }
    
}


class _TMPMessage {
    constructor(message_origin, message_type, message_username, message_body) {
        if (message_origin === "CLIENT") {
            this.message_origin = message_origin
            if (message_type === "SET_USR") {
                this.message_type = message_type
                this.message_body = null
                if (message_username === null) {
                    throw new Error("TMPMessage: message_username cannot be null with a 'SET_USR' message_type")
                } else if (typeof message_username === "string") {
                    message_username = message_username.trim()
                    if (message_username.length >= 1 && message_username.length <= 20){
                        this.message_username = message_username
                    } else {
                        throw new Error("TMPMessage: 'message_username' must be between 1 and 20 bytes inclusive")
                    }
                } else {
                    throw new Error("TMPMessage: 'message_username' must be a string between 1 and 20 bytes inclusive")
                }
            } else if (message_type === "CHAT_MSSG") {
                this.message_type = message_type
                if (message_username === null) {
                    throw new Error("TMPMessage: message_username cannot be null with a 'CHAT_MSSG' message_type")
                } else if (typeof message_username === "string") {
                    message_username = message_username.trim()
                    if (message_username.length >= 1 && message_username.length <= 20){
                        this.message_username = message_username
                        if (message_body === null) {
                            throw new Error("TMPMessage: 'message_body' cannot be null if 'message_type' is 'CHAT_MSSG'")
                        } else if (typeof message_body === "string") {
                            if (message_body.length >= 1) {
                                this.message_body = message_body
                            }
                            else {
                                throw new Error("TMPMessage: minimum size of 'message_body' is 1 byte")
                            }
                        } else {
                            throw new Error("TMPMessage: 'message_body' must be a string having a minimum size of 1 byte")
                        }
                    } else {
                        throw new Error("TMPMessage: 'message_username' must be between 1 and 20 bytes inclusive")
                    }
                } else {
                    throw new Error("TMPMessage: 'message_username' must be a string between 1 and 20 bytes inclusive")
                }
            } else if (message_type === "EXIT_CHAT") {
                this.message_type = message_type
                this.message_username = null
                this.message_body = null
            } else {
                throw new Error("TMPMessage: 'message_type' can only be one of 'SET_USR', 'CHAT_MSSG', or 'EXIT_CHAT' for the given 'message_origin")
            }
        } else if (message_origin === "SERVER") {
            this.message_origin = message_origin
            if (message_type === "STATE_UPG_1") {
                this.message_type = message_type
                this.message_username = null
                this.message_body = null
            } else if (message_type === "STATE_UPG_2") {
                this.message_type = message_type
                this.message_body = null
                if (message_username === null) {
                    throw new Error("TMPMessage: message_username cannot be null with a 'STATE_UPG_2' message_type")
                } else if (typeof message_username === "string") {
                    message_username = message_username.trim()
                    if (message_username.length >= 1 && message_username.length <= 20){
                        this.message_username = message_username
                    } else {
                        throw new Error("TMPMessage: 'message_username' must be between 1 and 20 bytes inclusive")
                    }
                } else {
                    throw new Error("TMPMessage: 'message_username' must be a string between 1 and 20 bytes inclusive")
                }
            } else if (message_type === "CHAT_MSSG") {
                this.message_type = message_type
                if (message_username === null){
                    throw new Error("TMPMessage: 'message_username' cannot be null for a 'message_type' of 'CHAT_MSSG'")
                } else if (typeof message_username === "string") {
                    message_username = message_username.trim()
                    if (message_username.length >= 1 && message_username.length <= 20) {
                        this.message_username = message_username
                        if (message_body === null) {
                            throw new Error("TMPMessage: 'message_body' cannot be null if 'message_type' is 'CHAT_MSSG'")
                        } else if (typeof message_body === "string") {
                            if (message_body.length >= 1) {
                                this.message_body = message_body
                            }
                            else {
                                throw new Error("TMPMessage: minimum size of 'message_body' is 1 byte")
                            }
                        } else {
                            throw new Error("TMPMessage: 'message_body' must be a string having a minimum size of 1 byte")
                        }
                    }
                    else {
                        throw new Error("TMPMessage: 'message_username' must be between 1 and 20 bytes inclusive")
                    }
                } else {
                    throw new Error("TMPMessage: 'message_username' must be a string between 1 and 20 bytes inclusive")
                }
            } else if (message_type === "SET_USR_CONFLICT") {
                this.message_type = message_type
                this.message_body = null
                if (message_username === null) {
                    throw new Error("TMPMessage: message_username cannot be null with a 'SET_USR_CONFLICT' message_type")
                } else if (typeof message_username === "string") {
                    message_username = message_username.trim()
                    if (message_username.length >= 1 && message_username.length <= 20){
                        this.message_username = message_username
                    } else {
                        throw new Error("TMPMessage: 'message_username' must be between 1 and 20 bytes inclusive")
                    }
                } else {
                    throw new Error("TMPMessage: 'message_username' must be a string between 1 and 20 bytes inclusive")
                }
            } else if (message_type === "DISCONNECT") {
                this.message_type = message_type
                this.message_username = null
                this.message_body = null
            } else {
                throw new Error("TMPMessage: 'message_type' can only be one of 'STATE_UPG_1', 'STATE_UPG_2', 'CHAT_MSSG', 'SET_USR_CONFLICT', or 'DISCONNECT' for the given 'message_origin'")
            }
        } else {
            throw new Error("TMPMessage: 'message_origin' can only be one of 'CLIENT', or 'SERVER'")
        }
    }

    _build_message() {
        let message_type_32_bytes = this.message_type + " ".repeat(32 - this.message_type.length)
        let message_username_20_bytes
        if (this.message_username === null) {
            message_username_20_bytes = " ".repeat(20)
        } else {
            message_username_20_bytes = this.message_username + " ".repeat(20 - this.message_username.length)
        }
        let message_body
        if (this.message_body === null) {
            message_body = ""
        } else {
            message_body = this.message_body
        }
        return `tmp://${message_type_32_bytes}::/${message_username_20_bytes}::/${message_body}`
    }

    static _parse_message(message, message_origin) {
        if (message.substring(0, 6) !== "tmp://") {
            throw new Error("TMPMessage: 'message' does not conform to TMP protocol message format")
        }
        else {
            if (message.substring(38, 41) !== "::/") {
                throw new Error("TMPMessage: 'message' does not conform to TMP protocol message format")
            } else if (message.substring(61, 64) !== "::/") {
                throw new Error("TMPMessage: 'message' does not conform to TMP protocol message format")
            } else {
                let message_type = message.substring(6, 38).trim()
                if (message_origin === "CLIENT") {
                    if (message_type === "SET_USR") {
                        let message_body = null
                        let message_username = message.substring(41, 61).trim()
                        return new this(message_origin, message_type, message_username, message_body)
                    } else if (message_type === "CHAT_MSSG") {
                        let message_username = message.substring(41, 61).trim()
                        let message_body = message.substring(64)
                        return new this(message_origin, message_type, message_username, message_body)
                    } else if (message_type === "EXIT_CHAT") {
                        let message_body = null
                        let message_username = null
                        return new this(message_origin, message_type, message_username, message_body)
                    } else {
                        throw new Error("TMPMessage: 'message' does not conform to TMP protocol message format")
                    }
                } else if (message_origin === "SERVER") {
                    if (message_type === "STATE_UPG_1") {
                        let message_body = null
                        let message_username = message.substring(41, 61).trim()
                        return new this(message_origin, message_type, message_username, message_body)
                    } else if (message_type === "STATE_UPG_2") {
                        let message_body = null
                        let message_username = message.substring(41, 61).trim()
                        return new this(message_origin, message_type, message_username, message_body)
                    } else if (message_type === "CHAT_MSSG") {
                        let message_username = message.substring(41, 61).trim()
                        let message_body = message.substring(64)
                        return new this(message_origin, message_type, message_username, message_body)
                    } else if (message_type === "SET_USR_CONFLICT") {
                        let message_body = null
                        let message_username = message.substring(41, 61).trim()
                        return new this(message_origin, message_type, message_username, message_body)
                    } else if (message_type === "DISCONNECT") {
                        let message_body = null
                        let message_username = null
                        return new this(message_origin, message_type, message_username, message_body)
                    } else {
                        throw new Error("TMPMessage: 'message' does not conform to TMP protocol message format")
                    }
                } else {
                    throw new Error("TMPMessage: 'message_origin' can only be one of 'CLIENT' or 'SERVER'")
                }
            }
        }
    }

    toString() {
        return `TMPMessage(\n\tMessage Type: '${this.message_type}',\n\tMessage Username: '${this.message_username}',\n\tMessage Body: '${this.message_body}'\n)`
    }
}

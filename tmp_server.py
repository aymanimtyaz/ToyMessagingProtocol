from __future__ import annotations

from typing import Optional, Union, Set, Dict

import asyncio
import time
from enum import Enum

import websockets
from StateEngine import StateEngine



_tmp_client_statemachine = StateEngine()



_TMPSERVER_DEFAULT_HOST = "localhost"
_TMPSERVER_DEFAULT_PORT = 5050
_TMPSERVER_DEFAULT_USR_NOTSET_TIMEOUT = 45
_TMPSERVER_DEFAULT_USR_SET_TIMEOUT = 600
_TMPSERVER_DEFAULT_SERVER_MAX_CLIENTS = 50



class TMPServer:

    def __init__(
        self, 
        host: Optional[str]=_TMPSERVER_DEFAULT_HOST, 
        port: Optional[int]=_TMPSERVER_DEFAULT_PORT, 
        usr_notset_timeout: Optional[int]=_TMPSERVER_DEFAULT_USR_NOTSET_TIMEOUT, 
        usr_set_timeout: Optional[int]=_TMPSERVER_DEFAULT_USR_SET_TIMEOUT, 
        server_max_clients: Optional[int]=_TMPSERVER_DEFAULT_SERVER_MAX_CLIENTS
    ):
        
        self._host = host
        self._port = port
        self._usr_notset_timeout = usr_notset_timeout
        self._usr_set_timeout = usr_set_timeout
        self._server_max_clients = server_max_clients

        self._broadcast_queue = asyncio.Queue()

        self._connected_clients: Set[websockets.server.WebsocketServerProtocol] = set()
        self._connected_usernames: Set[str] = set()
        self._client_to_username_mapping: Dict[websockets.server.WebsocketServerProtocol:str] = dict()

        # TODO: Define server states
        self._server_state = None

        self._count_connected_clients = 0

    def _add_client_to_server_record(self, websocket: websockets.server.WebsocketServerProtocol, username: str) -> None:
        self._connected_usernames.add(username)
        self._client_to_username_mapping[websocket] = username
        self._connected_clients.add(websocket)
        return None

    def _remove_client_from_server_record(self, websocket: websockets.server.WebsocketServerProtocol, username: Optional[str]=None) -> None:
        username = self._client_to_username_mapping[websocket] if username is None else username
        self._connected_clients.remove(websocket)
        self._connected_usernames.remove(username)
        del self._client_to_username_mapping[websocket]
        self._count_connected_clients -= 1
        return None

    def _check_if_username_in_record(self, username: str) -> bool:
        return username in self._connected_usernames

    async def _message_broadcaster(self):
        while True:
            message = await self._broadcast_queue.get()
            websockets.broadcast(self._connected_clients, message)            

    async def _connection_handler(self, websocket) -> None:
        client_state = "CONNECTED_INIT"
        while True:
            updated_client_state = await _tmp_client_statemachine.execute(client_state, websocket, self)
            if updated_client_state == "DISCONNECTED":
                break
            else:
                client_state = updated_client_state

    async def _server_metrics(self) -> None:
        while True:
            # print(f"# connected clients: {self.count_connected_clients}, usernames: {self.connected_usernames}, websockets: {self.connected_clients}, mappings: {self.client_to_username_mapping}")
            print(f"# connected clients: {self._count_connected_clients}, usernames: {self._connected_usernames}")
            await asyncio.sleep(5)

    async def _start_server(self) -> None:
        async with websockets.serve(self._connection_handler, self._host, self._port):
            await asyncio.gather(self._message_broadcaster(), self._server_metrics())

    def start_server(self) -> None:
        asyncio.run(self._start_server())



class _MessageOrigin(Enum):

    _CLIENT = 1
    _SERVER = 2


class _MessageType(Enum):
    
    def __str__(self) -> str:
        return self.value
    
    def __len__(self) -> int:
        return len(self.__str__())


class _ServerMessageType(_MessageType):
    
    _STATE_UPG_1 = "STATE_UPG_1"
    _STATE_UPG_2 = "STATE_UPG_2"
    _CHAT_MSSG = "CHAT_MSSG"
    _SET_USR_CONFLICT = "SET_USR_CONFLICT"
    _DISCONNECT = "DISCONNECT"

    @staticmethod
    def _get_ServerMessageType_enum_from_string(string: str) -> _ServerMessageType:
        if string == "STATE_UPG_1":
            return _ServerMessageType._STATE_UPG_1
        elif string == "STATE_UPG_2":
            return _ServerMessageType._STATE_UPG_2
        elif string == "CHAT_MSSG":
            return _ServerMessageType._CHAT_MSSG
        elif string == "SET_USR_CONFLICT":
            return _ServerMessageType._SET_USR_CONFLICT
        elif string == "DISCONNECT":
            return _ServerMessageType._DISCONNECT
        else:
            # TODO: Refine raised exceptions
            raise ValueError("invalid value for string")


class _ClientMessageType(_MessageType):
    
    _SET_USR = "SET_USR"
    _CHAT_MSSG = "CHAT_MSSG"
    _EXIT_CHAT = "EXIT_CHAT"

    @staticmethod
    def _get_ClientMessageType_enum_from_string(string: str) -> _ClientMessageType:
        if string == "SET_USR":
            return _ClientMessageType._SET_USR
        elif string == "CHAT_MSSG":
            return _ClientMessageType._CHAT_MSSG
        elif string == "EXIT_CHAT":
            return _ClientMessageType._EXIT_CHAT
        else:
            # TODO: Refine raised exceptions
            raise ValueError("invalid value for string")


class _ClientState(Enum):

    _DISCONNECTED = "DISCONNECTED"
    _CONNECTED_INIT = "CONNECTED_INIT"
    _CONNECTED_USR_NOTSET = "CONNECTED_USR_NOTSET"
    _CONNECTED_USR_SET = "CONNECTED_USR_SET"

    def __str__(self) -> str:
        return self.value



class _TMPMessage:

    def __init__(
        self,
        message_type: Union[_ServerMessageType, _ClientMessageType],
        message_username: Optional[str]=None,
        message_body: Optional[str] = None
    ):  
        if not isinstance(message_type, _MessageType):
            # TODO: Refine raised errors
            raise TypeError("message_type must be a 'MessageType' enum")
        self._message_type = message_type
        
        if message_type in { 
            _ServerMessageType._CHAT_MSSG, 
            _ClientMessageType._SET_USR,
            _ClientMessageType._CHAT_MSSG,
            _ServerMessageType._SET_USR_CONFLICT,
            _ServerMessageType._STATE_UPG_2
        } and message_username is None:
            # TODO: Refine raised errors
            raise ValueError("message_username can not be empty for the given message_type")
        
        if message_username is not None: 
            message_username = message_username.strip()
            if len(message_username) > 20:
                # TODO: Refine raised errors
                raise ValueError("message username can not be larger than 20 bytes")
            else:
                self._message_username = message_username
        else:
            self._message_username = message_username
        
        if message_type in {
            _ServerMessageType._CHAT_MSSG,
            _ClientMessageType._CHAT_MSSG
        } and message_body is None:
            # TODO: Refine raised errors
            raise ValueError("message_body can not be empty for the given message_type")
        
        self._message_body = message_body
        
    def _build_message(self) -> str:
        message_type_32_bytes = str(self._message_type) + int(32 - len(self._message_type)) * " "
        if self.message_username is not None:
            message_username_20_bytes = self._message_username + int(20 - len(self._message_username)) * " "
        else:
            message_username_20_bytes = 20 * " "
        if self._message_body is None:
            message_body = ""
        else:
            message_body = self._message_body
        return f"tmp://{message_type_32_bytes}::/{message_username_20_bytes}::/{message_body}" 

    @classmethod
    def _parse_message(cls, message: str, origin: _MessageOrigin) -> _TMPMessage:
        if not isinstance(origin, _MessageOrigin):
            # TODO: Refine raised exceptions
            raise ValueError("origin must be a MessageOrigin enum")

        message_header = message[:64]
        if message_header[:6] != "tmp://":
            # TODO: Refine raised errors
            raise Exception("message hasn't been formatted to follow TMP")
        if message_header[38:41] != "::/":
            # TODO: Refine raised errors
            raise Exception("message hasn't been formatted to follow TMP") 
        if message_header[61:64] != "::/":
            # TODO: Refine raised errors
            raise Exception("message hasn't been formatted to follow TMP")
        message_type_segment = message_header[6:38]
        message_type = message_type_segment.strip()
        if origin == _MessageOrigin._CLIENT:
            message_type = _ClientMessageType._get_ClientMessageType_enum_from_string(message_type)
        elif origin == _MessageOrigin._SERVER:
            message_type = _ServerMessageType._get_ServerMessageType_enum_from_string(message_type)
        else:
            # TODO: Refine raised exceptions
            raise ValueError("origin must be a MessageOrigin enum")
        username_segment = message_header[41:61]
        username = username_segment.strip()
        if len(username) == 0:
            username = None
        message_body = message[64:]
        return cls(
            message_type,
            username,
            message_body
        )

    @property
    def message_type(self) -> Union[_ServerMessageType, _ClientMessageType]:
        return self._message_type

    @property
    def message_username(self) -> Union[str, None]:
        return self._message_username

    @property
    def message_body(self) -> Union[str, None]:
        return self._message_body



@_tmp_client_statemachine.state_handler(str(_ClientState._DISCONNECTED))
async def _DISCONNECTED_handler(
    websocket: websockets.server.WebsocketServerProtocol, 
    tmp_server: TMPServer
):
    return str(_ClientState._DISCONNECTED)


@_tmp_client_statemachine.state_handler(str(_ClientState._CONNECTED_INIT), True)
async def _CONNECTED_INIT_handler(
    websocket: websockets.server.WebsocketServerProtocol, 
    tmp_server: TMPServer
):
    if tmp_server._count_connected_clients >= tmp_server._server_max_clients:
        server_message = _TMPMessage(
            message_type=_ServerMessageType._DISCONNECT
        )
        try:
            await websocket.send(server_message._build_message())
        except (websockets.exceptions.ConnectionClosedOK, websockets.exceptions.ConnectionClosedError):
            return str(_ClientState._DISCONNECTED)
        else:
            return str(_ClientState._DISCONNECTED)
    else:
        server_message = _TMPMessage(
            message_type=_ServerMessageType._STATE_UPG_1,
        )
        try:
            await websocket.send(server_message._build_message())
        except (websockets.exceptions.ConnectionClosedOK, websockets.exceptions.ConnectionClosedError):
            return str(_ClientState._DISCONNECTED)
        else:
            tmp_server._count_connected_clients += 1
            return str(_ClientState._CONNECTED_USR_NOTSET)


@_tmp_client_statemachine.state_handler(str(_ClientState._CONNECTED_USR_NOTSET))
async def _CONNECTED_USR_NOTSET_handler(
    websocket: websockets.server.WebsocketServerProtocol, 
    tmp_server: TMPServer
):
    total_elapsed_time = 0
    while True:
        start_time = time.time()
        try:
            client_message = await asyncio.wait_for(
                fut=websocket.recv(), 
                timeout=tmp_server._usr_notset_timeout-total_elapsed_time
            )
        except asyncio.TimeoutError:
            server_message = _TMPMessage(
                message_type=_ServerMessageType._DISCONNECT
            )
            tmp_server._count_connected_clients -= 1
            try:
                await websocket.send(server_message._build_message())
            except (websockets.exceptions.ConnectionClosedOK, websockets.exceptions.ConnectionClosedError):
                return str(_ClientState._DISCONNECTED)
            else:
                return str(_ClientState._DISCONNECTED)
        except (websockets.exceptions.ConnectionClosedOK, websockets.exceptions.ConnectionClosedError):
            tmp_server._count_connected_clients -= 1
            return str(_ClientState._DISCONNECTED)
        else:
            elapsed_time = time.time()-start_time
            try:
                message = _TMPMessage._parse_message(
                    message=client_message,
                    origin=_MessageOrigin._CLIENT
                )
            except:
                tmp_server._count_connected_clients -= 1
                server_message = _TMPMessage(
                    message_type=_ServerMessageType._DISCONNECT
                )
                try:
                    await websocket.send(server_message._build_message())
                except (websockets.exceptions.ConnectionClosedOK, websockets.exceptions.ConnectionClosedError):
                    return str(_ClientState._DISCONNECTED)
                else:
                    return str(_ClientState._DISCONNECTED)
            else:
                if message.message_type == _ClientMessageType._SET_USR:
                    if tmp_server._check_if_username_in_record(message.message_username) is True:
                        server_message = _TMPMessage(
                            message_type=_ServerMessageType._SET_USR_CONFLICT,
                            message_username=message.message_username
                        )
                        try:
                            await websocket.send(server_message._build_message())
                        except (websockets.exceptions.ConnectionClosedOK, websockets.exceptions.ConnectionClosedError):
                            tmp_server._count_connected_clients -= 1
                            return str(_ClientState._DISCONNECTED)
                        else:
                            total_elapsed_time += elapsed_time
                    else:
                        tmp_server._add_client_to_server_record(websocket, message.message_username)
                        server_message = _TMPMessage(
                            message_type=_ServerMessageType._STATE_UPG_2,
                            message_username=message.message_username
                        )
                        try:
                            await websocket.send(server_message._build_message())
                        except (websockets.exceptions.ConnectionClosedOK, websockets.exceptions.ConnectionClosedError):
                            tmp_server._remove_client_from_server_record(websocket, message.message_username)
                            return str(_ClientState._DISCONNECTED)
                        else:
                            return str(_ClientState._CONNECTED_USR_SET)
                elif message.message_type == _ClientMessageType._EXIT_CHAT:
                    tmp_server._count_connected_clients -= 1
                    server_message = _TMPMessage(
                        message_type=_ServerMessageType._DISCONNECT
                    )
                    try:
                        await websocket.send(server_message._build_message())
                    except (websockets.exceptions.ConnectionClosedOK, websockets.exceptions.ConnectionClosedError):
                        return str(_ClientState._DISCONNECTED)
                    else:
                        return str(_ClientState._DISCONNECTED)
                else:
                    tmp_server._count_connected_clients -= 1
                    server_message = _TMPMessage(
                        message_type=_ServerMessageType._DISCONNECT
                    )
                    try:
                        await websocket.send(server_message._build_message())
                    except (websockets.exceptions.ConnectionClosedOK, websockets.exceptions.ConnectionClosedError):
                        return str(_ClientState._DISCONNECTED)
                    else:
                        return str(_ClientState._DISCONNECTED)


@_tmp_client_statemachine.state_handler(str(_ClientState._CONNECTED_USR_SET))
async def _CONNECTED_USR_SET_handler(
    websocket: websockets.server.WebsocketServerProtocol, 
    tmp_server: TMPServer
):
    while True:
        try:
            client_message = await asyncio.wait_for(
                fut=websocket.recv(),
                timeout=_TMPSERVER_DEFAULT_USR_SET_TIMEOUT
            )
        except asyncio.TimeoutError:
            tmp_server._remove_client_from_server_record(websocket)
            server_message = _TMPMessage(
                message_type=_ServerMessageType._DISCONNECT
            )
            try:
                await websocket.send(server_message._build_message())
            except (websockets.exceptions.ConnectionClosedOK, websockets.exceptions.ConnectionClosedError):
                return str(_ClientState._DISCONNECTED)
            else:
                return str(_ClientState._DISCONNECTED)
        except (websockets.exceptions.ConnectionClosedOK, websockets.exceptions.ConnectionClosedError):
            tmp_server._remove_client_from_server_record(websocket)
            return str(_ClientState._DISCONNECTED)
        else:
            try:
                message = _TMPMessage._parse_message(
                    message=client_message,
                    origin=_MessageOrigin._CLIENT
                )
            except:
                tmp_server._remove_client_from_server_record(websocket)
                server_message = _TMPMessage(
                    message_type=_ServerMessageType._DISCONNECT
                )
                try:
                    await websocket.send(server_message._build_message())
                except (websockets.exceptions.ConnectionClosedOK, websockets.exceptions.ConnectionClosedError):
                    return str(_ClientState._DISCONNECTED)
                else:
                    return str(_ClientState._DISCONNECTED)
            else:
                if message.message_type == _ClientMessageType._CHAT_MSSG:
                    await tmp_server._broadcast_queue.put(client_message)
                elif message.message_type == _ClientMessageType._EXIT_CHAT:
                    tmp_server._remove_client_from_server_record(websocket)
                    server_message = _TMPMessage(
                        message_type=_ServerMessageType._DISCONNECT
                    )
                    try:
                        await websocket.send(server_message._build_message())
                    except (websockets.exceptions.ConnectionClosedOK, websockets.exceptions.ConnectionClosedError):
                        return str(_ClientState._DISCONNECTED)
                    else:
                        return str(_ClientState._DISCONNECTED)
                else:
                    tmp_server._remove_client_from_server_record(websocket)
                    server_message = _TMPMessage(
                        message_type=_ServerMessageType._DISCONNECT
                    )
                    try:
                        await websocket.send(server_message._build_message())
                    except (websockets.exceptions.ConnectionClosedOK, websockets.exceptions.ConnectionClosedError):
                        return str(_ClientState._DISCONNECTED)
                    else:
                        return str(_ClientState._DISCONNECTED)

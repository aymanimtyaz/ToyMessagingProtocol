import { TMPClient } from "./tmp_client.js";



const TMP_SERVER_URI = "ws://0.0.0.0:5050"

const tmp_client = new TMPClient(
    TMP_SERVER_URI,
    new_message_callback,
    server_connect_callback,
    request_username,
    rerequest_username,
    render_chat,
    reset_page
)


const connect_button = document.getElementById("connect-button")
const disconnect_button = document.getElementById("disconnect-button")
const chat_area = document.getElementById("message-area")
const main = document.getElementById("main")

var current_typing = new Set()


function render_current_typing() {
    let current_typing_str = "";
    if (current_typing.size == 0) {
        current_typing_str = ""
    } else if (current_typing.size == 1) {
        current_typing_str = `${Array.from(current_typing)[0]} is typing...`
    } else if (current_typing.size > 1 && current_typing.size < 4) {
        current_typing_str = Array.from(current_typing).join(", ") + " are typing..."
    } else {
        current_typing_str = "many people are typing..."
    }
    const current_typing_text = document.getElementById("peer-typing-text")
    current_typing_text.textContent = current_typing_str
}

function scrollToBottom(element) {
    element.scrollTop = element.scrollHeight - element.clientHeight
}

function render_new_message(message, user) {
    if (current_typing.has(user)) {
        current_typing.delete(user)
        render_current_typing()
    }
    const new_peer_message_bubble = `
        <div class="peer-message-bubble">
            <div class="peer-message-username-area">
                <p class="peer-username-text">${user}</p>
            </div>
            <div class="peer-message-text-area">
                <p class="peer-message-text">${message}</p>
            </div>
        </div>
    `
    if (document.documentElement.scrollHeight - document.documentElement.clientHeight - document.documentElement.scrollTop <= 1) {
        chat_area.insertAdjacentHTML("beforeend", new_peer_message_bubble)
        scrollToBottom(document.documentElement)
    } else {
        chat_area.insertAdjacentHTML("beforeend", new_peer_message_bubble)
    }
}

function new_message_callback(message, user) {
    if (message === "CHAT_TYPING_INDICATOR") {
        if (user !== tmp_client._username) {
            current_typing.add(user)
            render_current_typing()
            setTimeout(() => {
                current_typing.delete(user)
                render_current_typing()
            }, 5000);
        }
    } else if (message.substring(0, 12) === "CHAT_MESSAGE") {
        render_new_message(message.substring(13), user)
    }
}

function render_client_message(message, user) {
    const new_client_message_bubble = `
        <div class="client-message-bubble">
            <div class="client-message-username-area">
                <p class="client-username-text">${user}</p>
            </div>
            <div class="client-message-text-area">
                <p class="client-message-text">${message}</p>
            </div>
        </div>
    `
    chat_area.insertAdjacentHTML("beforeend", new_client_message_bubble)
    scrollToBottom(document.documentElement)
    const message_input = document.getElementById("message-input")
    message_input.addEventListener("keydown", typing_event_handler)
}

function server_connect_callback() {
    connect_button.disabled = true
    disconnect_button.disabled = false
}

async function request_username() {
    main.insertAdjacentHTML("beforeend", `
            <div id="username-modal" class="username-modal">
                <div class="username-modal-text-area">
                    <p id="username-modal-text" class="username-modal-text">Please enter a username: </p>
                </div>
                <div class="username-modal-input-area">
                    <div class="username-modal-input">
                        <input id="username-input">
                    </div>
                    <button id="username-submit-button" class="username-submit-button">
                        SELECT
                    </button>
                </div>
            </div>
        `
    )
    const username_input = document.getElementById("username-input")
    const username_submit = document.getElementById("username-submit-button")
    const username = new Promise((resolve, reject) => {
            username_submit.addEventListener('click', async (event) => {
                    const username_entered = username_input.value.trim()
                    if (username_entered.length > 0 && username_entered.length < 21) {
                        resolve(username_entered)
                    }
                }
            )
            username_input.addEventListener("keydown", function(event) {
                    if (event.key === "Enter") {
                        const username_entered = username_input.value.trim()
                        if (username_entered.length > 0 && username_entered.length < 21) {
                            resolve(username_entered)
                        }
                    }
                }
            )
            username_input.focus();
        }
    )
    return username
}

async function rerequest_username(unallowed_username) {
    const username_modal = document.getElementById("username-modal")
    username_modal.parentNode.removeChild(username_modal)
    main.insertAdjacentHTML("beforeend", `
            <div id="username-modal" class="username-modal">
                <div class="username-modal-text-area">
                    <p id="username-modal-text" class="username-modal-text">'${unallowed_username}' is already taken, Please enter a different username: </p>
                </div>
                <div class="username-modal-input-area">
                    <div class="username-modal-input">
                        <input id="username-input">
                    </div>
                    <button id="username-submit-button" class="username-submit-button">
                        SELECT
                    </button>
                </div>
            </div>
        `
    )
    const username_input = document.getElementById("username-input")
    const username_submit = document.getElementById("username-submit-button")
    const username = new Promise((resolve, reject) => {
            username_submit.addEventListener('click', async (event) => {
                    let username_entered = username_input.value.trim()
                    if (username.length > 0 && username.length < 21 && username_entered !== unallowed_username) {
                        resolve(username_entered)
                    }
                }
            )
            username_input.addEventListener("keydown", function(event) {
                    if (event.key === "Enter") {
                        const username_entered = username_input.value.trim()
                        if (username_entered.length > 0 && username_entered.length < 21 && username_entered !== unallowed_username) {
                            resolve(username_entered)
                        }
                    }
                }
            )
            username_input.focus();
        }
    )
    return username
}

async function blink_underscore() {
    const blinking_underscore = document.getElementById("tmp-chat-heading-blinker")
    let color = "black"
    while (true) {
        if (color === "black") {
            color = "white"
        } else {
            color = "black"
        }
        blinking_underscore.style.color = color
        await new Promise(resolve => setTimeout(resolve, 500));
    }
}

function typing_event_handler(event) {
    if (event.key !== "Enter") {
        const typing_message = "CHAT_TYPING_INDICATOR"
        tmp_client.send_message(typing_message)
        const message_input = document.getElementById("message-input")
        message_input.removeEventListener("keydown", typing_event_handler)
        setTimeout(() => {
            message_input.addEventListener("keydown", typing_event_handler)
        }, 5000);
    }
}

function render_chat(client_username) {
    const username_modal = document.getElementById("username-modal")
    username_modal.parentNode.removeChild(username_modal)
    const content = `
        <div id="downbar" class="downbar">
            <div class="peer-typing-indicator">
                <p id="peer-typing-text" class="peer-typing-text"></p>
            </div>
            <div class="message-input-container">
                <input type="text" id="message-input" classname="message-input" placeholder="${client_username} says...">
            </div>
            <button id="send-message-button" class="send-message-button">
                SEND
            </button>
        </div>
    `
    main.insertAdjacentHTML('beforeend', content);
    const send_message_button = document.getElementById("send-message-button")
    const message_input = document.getElementById("message-input")
    send_message_button.onclick = (event) => {
        const message = message_input.value
        if (message.length > 0) {
            tmp_client.send_message(message)
            message_input.value = ""
            render_client_message(message, tmp_client._username)
        }
    }
    message_input.addEventListener("keydown", function(event) {
            if (event.key === "Enter") {
                const message = message_input.value
                if (message.length > 0) {
                    const chat_message = `CHAT_MESSAGE ${message}`
                    tmp_client.send_message(chat_message)
                    message_input.value = ""
                    render_client_message(message, tmp_client._username)
                }
            }
        }
    )
    message_input.addEventListener("keydown", typing_event_handler)
    // chat_area.innerHTML = ``;
    message_input.focus()
}

function reset_page() {
    const username_modal = document.getElementById("username-modal")
    if (username_modal !== null) {
        username_modal.parentElement.removeChild(username_modal)
    }
    const downbar = document.getElementById('downbar');
    if (downbar !== null) {
        downbar.parentNode.removeChild(downbar);
    }
    connect_button.disabled = false
    disconnect_button.disabled = true
}


blink_underscore()

connect_button.onclick = (event) => {
    tmp_client.connect()
}

disconnect_button.onclick = (event) => {
    tmp_client.disconnect()
}

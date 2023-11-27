let clientName = "unknown";

const sendButton =
    document.querySelector<HTMLButtonElement>(".chat-send-button")!;

if (sendButton) {
    sendButton.onclick = sendMessage;
}

function sendMessage() {
    const chatInput = document.querySelector<HTMLInputElement>(".chat-input")!;
    if (!chatInput) {
        return;
    }
    exampleSocket.send(`${clientName} >> ${chatInput.value}`);
}

function displayMessage(messageContent: string) {
    const chatArea = document.querySelector(".chat-box-area")!;
    const message = document.createElement("div")!;
    message.innerHTML = messageContent;

    chatArea?.appendChild(message);
    chatInput.value = "";
}

const chatInput = document.querySelector<HTMLInputElement>(".chat-input")!;

chatInput.addEventListener("keydown", function (e) {
    if (e.code === "Enter") {
        sendMessage();
    }
});

const infoModalSubmitButton =
    document.querySelector<HTMLButtonElement>("#info-modal-submit");

function infoModalSubmit() {
    const infoModalNameField =
        document.querySelector<HTMLInputElement>("#info-name")!;
    clientName = infoModalNameField.value;
    infoModalNameField.value = "";
    document.querySelector<HTMLDivElement>(".chat-area")!.style.display =
        "flex";
    document.querySelector<HTMLDivElement>(".info-modal")!.style.display =
        "none";
    document.querySelector<HTMLInputElement>(".chat-input")!.focus();
    console.log(clientName);
}

if (infoModalSubmitButton) {
    infoModalSubmitButton.onclick = infoModalSubmit;
}

const nameInput = document.querySelector<HTMLInputElement>("#info-name")!;

nameInput.onkeydown = (e: KeyboardEvent) => {
    if (e.code === "Enter") {
        infoModalSubmit();
    }
};

const exampleSocket = new WebSocket("ws://localhost:7777/");

exampleSocket.onopen = () => {
    console.log("connected");
};

exampleSocket.onmessage = (message) => {
    console.log(message.data);
    displayMessage(message.data);
};

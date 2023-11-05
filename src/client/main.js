let clientName = "unknown";

const sendButton = document.querySelector(".chat-send-button");

if (sendButton) {
    sendButton.onclick = sendMessage;
}

function sendMessage() {
    const chatInput = document.querySelector(".chat-input");
    if (!chatInput) {
        return;
    }
    const chatArea = document.querySelector(".chat-box-area");
    const message = document.createElement("div");
    message.innerHTML = `${clientName} >> ${chatInput.value}`;

    chatArea?.appendChild(message);
    chatInput.value = "";
}

const chatInput = document.querySelector(".chat-input");

chatInput.addEventListener("keydown", function (e) {
    if (e.code === "Enter") {
        sendMessage();
    }
});

const infoModalSubmitButton = document.querySelector("#info-modal-submit");

if (infoModalSubmitButton) {
    infoModalSubmitButton.onclick = () => {
        const infoModalNameField = document.querySelector("#info-name");
        clientName = infoModalNameField.value;
        infoModalNameField.value = "";
        document.querySelector(".info-modal").style.display = "none";
        console.log(clientName);
    };
}

const sendButton: any = document.querySelector(".chat-send-button");

if (sendButton) {
    sendButton.onclick = sendMessage;
}

function sendMessage() {
    const chatInput: any = document.querySelector(".chat-input");
    if (!chatInput) {
        return;
    }
    const chatArea = document.querySelector(".chat-box-area");
    const message = document.createElement("div");
    message.innerHTML = `>> ${chatInput.value}`;

    chatArea?.appendChild(message);
    chatInput.value = "";
}

const chatInput: any = document.querySelector(".chat-input");

chatInput.addEventListener("keydown", function (e: any) {
    if (e.code === "Enter") {
        //checks whether the pressed key is "Enter"
        sendMessage();
    }
});

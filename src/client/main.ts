const sendButton: any = document.querySelector(".chat-send-button");

if (sendButton) {
    sendButton.onclick = () => {
        const chatInput: any = document.querySelector(".chat-input");
        if (!chatInput) {
            return;
        }
        const chatArea = document.querySelector(".chat-box-area");
        const message = document.createElement("div");
        message.innerHTML = chatInput.value;

        chatArea?.appendChild(message);
    };
}

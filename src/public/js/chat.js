/**
 * Chat Client Implementation
 * 
 * This file contains the client-side implementation of the chat feature.
 * It uses Socket.IO to establish a connection with the server and handle real-time messaging.
 */

class ChatClient {
    constructor(orderId, userId) {
        this.orderId = orderId;
        this.userId = userId;
        this.socket = null;
        this.typingTimeout = null;
        this.messageContainer = document.getElementById('message-container');
        this.messageInput = document.getElementById('message-input');
        this.sendButton = document.getElementById('send-button');
        this.typingIndicator = document.getElementById('typing-indicator');
        
        this.initialize();
    }

    /**
     * Initialize the chat client
     */
    initialize() {
        // Get access token from local storage
        const token = localStorage.getItem('accessToken');
        if (!token) {
            console.error('No access token found');
            return;
        }

        // Initialize Socket.IO connection
        this.socket = io({
            auth: {
                token
            }
        });

        // Set up event listeners
        this.setupSocketListeners();
        this.setupUIListeners();

        // Join the order chat room
        this.joinOrderChat();
    }

    /**
     * Set up Socket.IO event listeners
     */
    setupSocketListeners() {
        // Handle connection
        this.socket.on('connect', () => {
            console.log('Connected to chat server');
            this.addSystemMessage('Connected to chat');
        });

        // Handle connection error
        this.socket.on('connect_error', (error) => {
            console.error('Connection error:', error);
            this.addSystemMessage('Failed to connect to chat server');
        });

        // Handle previous messages
        this.socket.on('previous-messages', (messages) => {
            this.displayPreviousMessages(messages);
        });

        // Handle new message
        this.socket.on('new-message', (message) => {
            this.displayMessage(message);
        });

        // Handle user typing
        this.socket.on('user-typing', (data) => {
            if (data.user.id !== this.userId) {
                if (data.isTyping) {
                    this.typingIndicator.textContent = `${data.user.name} is typing...`;
                    this.typingIndicator.style.display = 'block';
                } else {
                    this.typingIndicator.style.display = 'none';
                }
            }
        });

        // Handle user joined
        this.socket.on('user-joined', (data) => {
            this.addSystemMessage(`${data.name} joined the chat`);
        });

        // Handle user left
        this.socket.on('user-left', (data) => {
            this.addSystemMessage(`${data.name} left the chat`);
        });

        // Handle errors
        this.socket.on('error', (error) => {
            console.error('Socket error:', error);
            this.addSystemMessage(`Error: ${error.message}`);
        });

        // Handle disconnect
        this.socket.on('disconnect', () => {
            console.log('Disconnected from chat server');
            this.addSystemMessage('Disconnected from chat server');
        });
    }

    /**
     * Set up UI event listeners
     */
    setupUIListeners() {
        // Send message on button click
        this.sendButton.addEventListener('click', () => {
            this.sendMessage();
        });

        // Send message on Enter key press
        this.messageInput.addEventListener('keypress', (event) => {
            if (event.key === 'Enter') {
                this.sendMessage();
            }
        });

        // Handle typing indicator
        this.messageInput.addEventListener('input', () => {
            this.handleTyping();
        });
    }

    /**
     * Join the order chat room
     */
    joinOrderChat() {
        this.socket.emit('join-order-chat', this.orderId);
    }

    /**
     * Send a message
     */
    sendMessage() {
        const message = this.messageInput.value.trim();
        if (!message) return;

        this.socket.emit('send-message', {
            orderId: this.orderId,
            message
        });

        // Clear input
        this.messageInput.value = '';

        // Reset typing indicator
        this.socket.emit('typing', {
            orderId: this.orderId,
            isTyping: false
        });
    }

    /**
     * Handle typing indicator
     */
    handleTyping() {
        // Send typing indicator
        this.socket.emit('typing', {
            orderId: this.orderId,
            isTyping: true
        });

        // Clear previous timeout
        if (this.typingTimeout) {
            clearTimeout(this.typingTimeout);
        }

        // Set timeout to stop typing indicator after 2 seconds
        this.typingTimeout = setTimeout(() => {
            this.socket.emit('typing', {
                orderId: this.orderId,
                isTyping: false
            });
        }, 2000);
    }

    /**
     * Display previous messages
     * @param {Array} messages - Array of message objects
     */
    displayPreviousMessages(messages) {
        // Clear message container
        this.messageContainer.innerHTML = '';

        // Display each message
        messages.forEach(message => {
            this.displayMessage(message);
        });

        // Scroll to bottom
        this.scrollToBottom();
    }

    /**
     * Display a message
     * @param {Object} message - Message object
     */
    displayMessage(message) {
        const messageElement = document.createElement('div');
        messageElement.classList.add('message');
        
        // Add class based on sender
        if (message.sender.id === this.userId) {
            messageElement.classList.add('message-sent');
        } else {
            messageElement.classList.add('message-received');
        }

        // Create message content
        const messageContent = document.createElement('div');
        messageContent.classList.add('message-content');
        
        // Create sender info
        const senderInfo = document.createElement('div');
        senderInfo.classList.add('sender-info');
        senderInfo.textContent = message.sender.name;
        
        // Create message text
        const messageText = document.createElement('div');
        messageText.classList.add('message-text');
        messageText.textContent = message.message;
        
        // Create message time
        const messageTime = document.createElement('div');
        messageTime.classList.add('message-time');
        messageTime.textContent = new Date(message.createdAt).toLocaleTimeString();
        
        // Append elements
        messageContent.appendChild(senderInfo);
        messageContent.appendChild(messageText);
        messageContent.appendChild(messageTime);
        messageElement.appendChild(messageContent);
        
        // Append to container
        this.messageContainer.appendChild(messageElement);
        
        // Scroll to bottom
        this.scrollToBottom();
    }

    /**
     * Add a system message
     * @param {string} text - Message text
     */
    addSystemMessage(text) {
        const messageElement = document.createElement('div');
        messageElement.classList.add('message', 'message-system');
        messageElement.textContent = text;
        
        // Append to container
        this.messageContainer.appendChild(messageElement);
        
        // Scroll to bottom
        this.scrollToBottom();
    }

    /**
     * Scroll to bottom of message container
     */
    scrollToBottom() {
        this.messageContainer.scrollTop = this.messageContainer.scrollHeight;
    }

    /**
     * Leave the chat
     */
    leaveChat() {
        if (this.socket) {
            this.socket.emit('leave-order-chat', this.orderId);
            this.socket.disconnect();
        }
    }
}

// Example usage:
// const chat = new ChatClient('order-id-123', 'user-id-456');
// 
// // When leaving the page:
// window.addEventListener('beforeunload', () => {
//     chat.leaveChat();
// });

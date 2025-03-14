# Busy2Shop Chat Feature

This document provides an overview of the real-time chat feature implemented for Busy2Shop, which allows agents and customers to communicate during an ongoing order.

## Features

- Real-time messaging using Socket.IO
- Typing indicators
- Message history
- Read receipts
- User presence (joined/left notifications)
- Secure authentication using JWT tokens

## Technical Implementation

### Server-Side Components

1. **Socket Configuration (`src/clients/socket.config.ts`)**
   - Handles Socket.IO server initialization
   - Manages authentication and connection events
   - Maintains user-socket mappings

2. **Chat Service (`src/services/chat.service.ts`)**
   - Manages message storage and retrieval
   - Handles message read status
   - Provides methods for retrieving message history

3. **Chat Controller (`src/controllers/chat.controller.ts`)**
   - Provides REST API endpoints for:
     - Retrieving message history
     - Getting unread message counts
     - Marking messages as read

4. **Chat Model (`src/models/chatMessage.model.ts`)**
   - Defines the database schema for chat messages
   - Establishes relationships with User and Order models

### Client-Side Components

1. **Chat Client (`src/public/js/chat.js`)**
   - Manages Socket.IO client connection
   - Handles message sending and receiving
   - Manages typing indicators and UI updates

2. **Chat Interface (`src/public/chat.html`)**
   - Provides a user interface for the chat feature
   - Displays messages, typing indicators, and user status

## API Endpoints

### REST API

- **GET `/api/v0/chat/messages/:orderId`**
  - Retrieves chat messages for a specific order
  - Requires authentication

- **GET `/api/v0/chat/unread`**
  - Gets the count of unread messages for the authenticated user
  - Can be filtered by orderId using query parameter

- **POST `/api/v0/chat/read/:orderId`**
  - Marks all messages in an order as read
  - Requires authentication

### Socket.IO Events

#### Client to Server

- **`join-order-chat`**: Join a specific order's chat room
- **`send-message`**: Send a new message
- **`typing`**: Indicate user is typing
- **`leave-order-chat`**: Leave a specific order's chat room

#### Server to Client

- **`previous-messages`**: Receive message history
- **`new-message`**: Receive a new message
- **`user-typing`**: Notification that a user is typing
- **`user-joined`**: Notification that a user has joined the chat
- **`user-left`**: Notification that a user has left the chat
- **`error`**: Error notification

## Usage

### Integrating Chat into Order Pages

To integrate the chat feature into an order page:

1. Include the Socket.IO client library and chat client script:
   ```html
   <script src="/socket.io/socket.io.js"></script>
   <script src="/js/chat.js"></script>
   ```

2. Initialize the chat client with order and user IDs:
   ```javascript
   const chat = new ChatClient(orderId, userId);
   ```

3. Handle cleanup when leaving the page:
   ```javascript
   window.addEventListener('beforeunload', () => {
       chat.leaveChat();
   });
   ```

### Standalone Chat Page

A standalone chat page is available at `/chat.html?orderId={orderId}&userId={userId}`.

## Security Considerations

- All Socket.IO connections require a valid JWT token for authentication
- Users can only access chat rooms for orders they are involved with
- Messages are stored in the database with sender information for audit purposes

## Future Enhancements

- Media sharing (images, documents)
- Message reactions
- Group chats for orders with multiple agents
- Push notifications for new messages
- Message search functionality

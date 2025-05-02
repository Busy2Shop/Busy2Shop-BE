export const chatNotificationTemplate = (data: {
    recipientName: string;
    senderName: string;
    message: string;
    notificationType: string;
    resourceId: string;
    appUrl: string;
}): string => {
    const { recipientName, senderName, message, notificationType, resourceId, appUrl } = data;

    let subject: string;
    let notificationHeading: string;
    const actionText = 'View Conversation';

    // Set the appropriate heading based on the notification type
    switch (notificationType) {
    case 'CHAT_MESSAGE_RECEIVED':
        subject = 'New Chat Message';
        notificationHeading = 'You have a new message';
        break;
    case 'CHAT_ACTIVATED':
        subject = 'Chat Activated';
        notificationHeading = 'Chat has been activated';
        break;
    case 'USER_LEFT_CHAT':
        subject = 'User Left Chat';
        notificationHeading = 'A user has left the chat';
        break;
    default:
        subject = 'Chat Notification';
        notificationHeading = 'You have a new notification';
    }

    return `
  <!DOCTYPE html>
  <html lang="en-GB">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${subject}</title>
    <style>
      body {
        font-family: Arial, sans-serif;
        line-height: 1.6;
        color: #333;
        margin: 0;
        padding: 0;
      }
      .container {
        max-width: 600px;
        margin: 0 auto;
        padding: 20px;
      }
      .header {
        background-color: #4a69bd;
        color: white;
        padding: 20px;
        text-align: center;
      }
      .content {
        padding: 20px;
        background-color: #f9f9f9;
      }
      .message {
        background-color: white;
        border-left: 4px solid #4a69bd;
        margin: 20px 0;
        padding: 15px;
        border-radius: 4px;
      }
      .button {
        display: inline-block;
        padding: 10px 20px;
        background-color: #4a69bd;
        color: white;
        text-decoration: none;
        border-radius: 4px;
        margin-top: 20px;
      }
      .footer {
        text-align: center;
        color: #888;
        font-size: 12px;
        margin-top: 30px;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h2>${subject}</h2>
      </div>
      <div class="content">
        <p>Hello ${recipientName},</p>
        <p>${notificationHeading}</p>
        
        <div class="message">
          <p><strong>${senderName}</strong></p>
          <p>${message}</p>
        </div>
        
        <a href="${appUrl}/order/${resourceId}/chat" class="button">${actionText}</a>
        
        <p>Thank you for using our platform!</p>
      </div>
      <div class="footer">
        <p>This is an automated message, please do not reply directly to this email.</p>
      </div>
    </div>
  </body>
  </html>
  `;
};
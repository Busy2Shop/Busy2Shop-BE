import { NotificationTypes } from '../../interface';

export const chatNotificationTemplate = (data: {
    recipientName: string;
    senderName: string;
    message: string;
    notificationType: string;
    resourceId: string;
    websiteUrl: string;
    orderNumber?: string;
    recipientType?: string;
    metadata?: any;
}): string => {
    const { recipientName, senderName, message, notificationType, resourceId, websiteUrl, orderNumber, recipientType } = data;

    let subject: string;
    let notificationHeading: string;
    const actionText = 'View Conversation';

    // Set the appropriate heading based on the notification type
    switch (notificationType) {
        case NotificationTypes.CHAT_MESSAGE_RECEIVED:
            subject = 'New Chat Message';
            notificationHeading = orderNumber
                ? `You have a new message for order #${orderNumber}`
                : 'You have a new message';
            break;
        case NotificationTypes.CHAT_ACTIVATED:
            subject = 'Chat Activated';
            notificationHeading = orderNumber
                ? `Chat has been activated for order #${orderNumber}`
                : 'Chat has been activated';
            break;
        case NotificationTypes.USER_LEFT_CHAT:
            subject = 'User Left Chat';
            notificationHeading = orderNumber
                ? `A user has left the chat for order #${orderNumber}`
                : 'A user has left the chat';
            break;
        default:
            subject = 'Chat Notification';
            notificationHeading = 'You have a new notification';
    }

    // Generate proper links based on user type
    const generateChatLink = (baseUrl: string, orderId: string, userType: string): string => {
        switch (userType) {
            case 'customer':
                return `${baseUrl}/customer/orders/${orderId}`;
            case 'agent':
                return `${baseUrl}/agent/orders/${orderId}`;
            default:
                return `${baseUrl}/order/${orderId}/chat`;
        }
    };

    const chatLink = generateChatLink(websiteUrl, resourceId, recipientType || 'user');

    return `
<table style="width: 95%; max-width: 670px; margin: 0 auto; background: #fff; border-radius: 3px; text-align: center; box-shadow: 0 6px 18px 0 rgba(0,0,0,.06);">
    <tr>
        <td style="height: 40px;"></td>
    </tr>
    <tr>
        <td style="padding: 35px;">
            <div style="width: 100%;">
                <h1 style="color: #1e1e2d; margin: 10px 0; font-size: 35px; font-weight: 300; font-family: 'Rubik', sans-serif; text-transform: capitalize;">
                    Hi ${recipientName}, 
                </h1>
                <p style="color: #1e1e2d; font-size: 18px; margin: 10px 0;">${notificationHeading}</p>
            </div>
            
            <div style="margin: 30px 0; background: #f9f9f9; border-left: 4px solid #F04950; padding: 15px; text-align: left; border-radius: 5px;">
                <p style="margin: 0; font-weight: bold; color: #1e1e2d; font-size: 18px;">${senderName}</p>
                <p style="margin: 10px 0 0; color: #555; font-size: 16px;">${message}</p>
            </div>
            
            <div style="margin-top: 25px;">
                <a href="${chatLink}" style="text-decoration: none; display: inline-block; background: #F04950; color: #fff; font-weight: 800; text-transform: uppercase; font-size: 16px; padding: 10px 24px; border-radius: 5px;">
                    ${actionText}
                </a>
            </div>

            <p style="color: #1e1e2d; font-size: 16px; margin: 30px 0 0;">If you can't click the button, copy and paste the following link into your browser:</p>
            <div style="background: #eee; padding: 10px; border-radius: 5px; word-wrap: break-word; margin-top: 10px; text-align: left;">
                <code style="font-size: 14px;">${chatLink}</code>
            </div>
            
            <p style="color: #1e1e2d; font-size: 16px; margin: 30px 0 10px;">Thank you for using our platform!</p>
        </td>
    </tr>
    <tr>
        <td style="height: 40px; background-color: #f5f5f5; font-size: 12px; color: #777; text-align: center; padding: 10px 20px;">
            <p>This is an automated message, please do not reply directly to this email.</p>
        </td>
    </tr>
</table>
  `;
};

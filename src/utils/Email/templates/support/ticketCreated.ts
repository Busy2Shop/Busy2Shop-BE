export const ticketCreatedTemplate = ({
    name,
    ticketId,
    subject,
    category,
}: {
    name: string;
    ticketId: string;
    subject: string;
    category: string;
}) => {
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f4; font-family: Arial, sans-serif;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
            <td style="padding: 0;">
                <table role="presentation" style="width: 95%; max-width: 670px; margin: 20px auto; background: #fff; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                    <tr>
                        <td style="padding: 35px;">
                            <div style="text-align: center; margin-bottom: 30px;">
                                <h1 style="color: #F04950; margin: 0; font-size: 28px;">Busy2Shop Support</h1>
                            </div>

                            <div style="color: #333; line-height: 1.6;">
                                <h2 style="color: #333; margin-bottom: 20px;">Hi ${name},</h2>

                                <p style="margin-bottom: 15px;">
                                    Thank you for contacting Busy2Shop support! We've received your support ticket and our team will review it shortly.
                                </p>

                                <div style="background: #f9f9f9; border-left: 4px solid #F04950; padding: 20px; margin: 25px 0; border-radius: 4px;">
                                    <h3 style="margin: 0 0 15px 0; color: #333; font-size: 16px;">Ticket Details:</h3>
                                    <table style="width: 100%; border-collapse: collapse;">
                                        <tr>
                                            <td style="padding: 8px 0; color: #666; font-weight: bold;">Ticket ID:</td>
                                            <td style="padding: 8px 0; color: #333;">${ticketId}</td>
                                        </tr>
                                        <tr>
                                            <td style="padding: 8px 0; color: #666; font-weight: bold;">Subject:</td>
                                            <td style="padding: 8px 0; color: #333;">${subject}</td>
                                        </tr>
                                        <tr>
                                            <td style="padding: 8px 0; color: #666; font-weight: bold;">Category:</td>
                                            <td style="padding: 8px 0; color: #333; text-transform: capitalize;">${category}</td>
                                        </tr>
                                    </table>
                                </div>

                                <p style="margin-bottom: 15px;">
                                    Our support team typically responds within <strong>24-48 hours</strong>. You'll receive an email notification when we reply to your ticket.
                                </p>

                                <p style="margin-bottom: 25px;">
                                    Please keep your ticket ID handy for future reference.
                                </p>

                                <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
                                    <p style="color: #666; font-size: 14px; margin: 5px 0;">
                                        Best regards,<br>
                                        <strong>Busy2Shop Support Team</strong>
                                    </p>
                                </div>
                            </div>
                        </td>
                    </tr>
                    <tr>
                        <td style="background: #f9f9f9; padding: 20px; text-align: center; border-radius: 0 0 8px 8px;">
                            <p style="margin: 0; color: #999; font-size: 12px;">
                                This is an automated message. Please do not reply directly to this email.<br>
                                For urgent matters, please contact us through the app.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
`;
};

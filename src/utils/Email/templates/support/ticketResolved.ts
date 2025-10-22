export const ticketResolvedTemplate = ({
    name,
    ticketId,
    subject,
    resolvedBy,
}: {
    name: string;
    ticketId: string;
    subject: string;
    resolvedBy: string;
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

                                <div style="text-align: center; margin: 30px 0;">
                                    <div style="display: inline-block; background: #28a745; color: white; padding: 15px 30px; border-radius: 50px; font-size: 18px; font-weight: bold;">
                                        ✓ Ticket Resolved
                                    </div>
                                </div>

                                <p style="margin-bottom: 15px;">
                                    Great news! Your support ticket has been marked as resolved by our team.
                                </p>

                                <div style="background: #f9f9f9; border-left: 4px solid #28a745; padding: 20px; margin: 25px 0; border-radius: 4px;">
                                    <h3 style="margin: 0 0 15px 0; color: #333; font-size: 16px;">Ticket Details:</h3>
                                    <table style="width: 100%; border-collapse: collapse;">
                                        <tr>
                                            <td style="padding: 8px 0; color: #666; font-weight: bold; width: 120px;">Ticket ID:</td>
                                            <td style="padding: 8px 0; color: #333;">${ticketId}</td>
                                        </tr>
                                        <tr>
                                            <td style="padding: 8px 0; color: #666; font-weight: bold;">Subject:</td>
                                            <td style="padding: 8px 0; color: #333;">${subject}</td>
                                        </tr>
                                        <tr>
                                            <td style="padding: 8px 0; color: #666; font-weight: bold;">Resolved By:</td>
                                            <td style="padding: 8px 0; color: #333;">${resolvedBy}</td>
                                        </tr>
                                    </table>
                                </div>

                                <div style="background: #e8f5e9; border: 1px solid #28a745; padding: 20px; margin: 20px 0; border-radius: 4px;">
                                    <h3 style="margin: 0 0 10px 0; color: #2e7d32; font-size: 16px;">Was your issue resolved?</h3>
                                    <p style="margin: 0; color: #2e7d32; line-height: 1.6;">
                                        If your issue has been fully resolved, no further action is needed.
                                        However, if you still need assistance or have additional questions,
                                        you can reopen this ticket by replying through your account.
                                    </p>
                                </div>

                                <p style="margin-bottom: 15px;">
                                    We hope we were able to help you. If you need any further assistance in the future,
                                    please don't hesitate to reach out to us again.
                                </p>

                                <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
                                    <p style="color: #666; font-size: 14px; margin: 5px 0;">
                                        Thank you for choosing Busy2Shop!<br>
                                        <strong>Busy2Shop Support Team</strong>
                                    </p>
                                </div>
                            </div>
                        </td>
                    </tr>
                    <tr>
                        <td style="background: #f9f9f9; padding: 20px; text-align: center; border-radius: 0 0 8px 8px;">
                            <p style="margin: 0; color: #999; font-size: 12px;">
                                This ticket will be automatically closed after 7 days if no further action is taken.<br>
                                You can reopen it at any time through your account.
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

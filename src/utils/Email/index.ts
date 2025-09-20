import EmailTemplate from './templates';
import { chatNotificationTemplate } from './templates/chatNotification';
import { logger } from '../logger';
import { RESEND_API_KEY, EMAIL_SERVICE } from '../constants';
import { Resend } from 'resend';
import { NotificationTypes } from '../interface';

export type postmarkInfo = {
    postMarkTemplateData: Record<string, unknown>;
    recipientEmail: string;
};

type EmailOptions = {
    email: string;
    subject: string;
    html?: string;
    from?: string;
    message?: string;
    attachments?: [];
    // Legacy fields for compatibility
    isTemplate?: boolean;
    templateId?: string;
    templateData?: object;
    isPostmarkTemplate?: boolean;
    postMarkTemplateAlias?: string;
    postmarkInfo?: postmarkInfo[];
};

// eslint-disable-next-line no-unused-vars
type SendEmailFunction = (options: EmailOptions) => Promise<void | Error>;

export default class EmailService {
    private readonly sendEmail: SendEmailFunction;
    private readonly resend: Resend;

    constructor(service: string) {
        if (service === 'resend') {
            this.resend = new Resend(RESEND_API_KEY);
            this.sendEmail = this.createResendEmail();
        } else {
            throw new Error('Invalid email service specified. Only "resend" is supported.');
        }
    }

    private createResendEmail(): SendEmailFunction {
        if (!RESEND_API_KEY) {
            throw new Error('RESEND_API_KEY is not configured');
        }

        return async options => {
            try {
                logger.info('Sending emails with Resend', { 
                    recipientCount: options.postmarkInfo?.length || 1,
                    subject: options.subject 
                });

                // Extract recipients from postmarkInfo or fallback to email field
                const recipients = options.postmarkInfo?.map(info => info.recipientEmail) || [options.email];

                // Send emails to all recipients
                const emailPromises = recipients.map(async (recipientEmail) => {
                    try {
                        // Determine sender email based on 'from' parameter or use default
                        const fromEmail = this.getSenderEmail(options.from || 'auth');

                        // Prepare email data for Resend
                        const emailData = {
                            from: fromEmail,
                            to: recipientEmail,
                            subject: options.subject,
                            html: options.html || options.message || '',
                            // Resend doesn't support attachments in the same way as nodemailer
                            // For production use, consider using Resend's file upload feature
                        };

                        // Send email using Resend
                        const result = await this.resend.emails.send(emailData);

                        if (result.error) {
                            logger.error(`Resend error for ${recipientEmail}:`, result.error);
                            throw new Error(result.error.message);
                        }

                        logger.info(`Email sent successfully to ${recipientEmail}`, { 
                            messageId: result.data?.id 
                        });

                        return result;
                    } catch (error) {
                        logger.error(`Error sending email to ${recipientEmail}:`, error);
                        throw error;
                    }
                });

                // Wait for all emails to complete
                await Promise.allSettled(emailPromises);

                logger.info('Batch email sending completed');
            } catch (error) {
                logger.error('Error in Resend email sending:', error);
                throw error;
            }
        };
    }

    // Get sender email based on type
    private getSenderEmail(type: string): string {
        const defaultSender = 'Busy2Shop <noreply@busy2shop.com>';
        
        switch (type) {
            case 'auth':
                return 'Busy2Shop Accounts <accounts@busy2shop.com>';
            case 'support':
                return 'Busy2Shop Support <support@busy2shop.com>';
            case 'notifications':
                return 'Busy2Shop Notifications <notifications@busy2shop.com>';
            case 'marketing':
                return 'Busy2Shop <hello@busy2shop.com>';
            default:
                return defaultSender;
        }
    }

    // Enhanced chat notification method with Resend
    async sendChatNotificationEmail(
        recipientEmail: string,
        data: {
            recipientName: string;
            senderName: string;
            message: string;
            notificationType: string;
            resourceId: string;
            orderNumber?: string;
            recipientType?: string;
            metadata?: any;
        },
    ): Promise<boolean> {
        try {
            // Determine subject based on notification type
            let subject = 'Chat Notification';
            switch (data.notificationType) {
                case NotificationTypes.CHAT_MESSAGE_RECEIVED:
                    subject = 'New Chat Message';
                    break;
                case NotificationTypes.CHAT_ACTIVATED:
                    subject = 'Chat Activated';
                    break;
                case NotificationTypes.USER_LEFT_CHAT:
                    subject = 'User Left Chat';
                    break;
            }

            // Get frontend URL
            const frontendUrl = process.env.WEBSITE_URL ?? 'http://localhost:5173';

            // Generate HTML using the chat notification template
            const html = chatNotificationTemplate({
                ...data,
                websiteUrl: frontendUrl,
            });

            // Send the email using the main send method
            await this.send({
                email: recipientEmail,
                subject,
                html,
                from: 'notifications',
                postmarkInfo: [
                    {
                        recipientEmail,
                        postMarkTemplateData: {},
                    },
                ],
            });

            logger.info(`Chat notification email sent to ${recipientEmail}`);
            return true;
        } catch (error) {
            logger.error('Error sending chat notification email:', error);
            return false;
        }
    }

    // Public send method - maintains existing interface
    public send(options: EmailOptions): Promise<void | Error> {
        logger.info('Sending email via Resend service');
        return this.sendEmail(options);
    }

    // Utility method to verify Resend API key and domain
    public async verifyConnection(): Promise<boolean> {
        try {
            // Test the connection by attempting to send a test email to a safe address
            const testResult = await this.resend.emails.send({
                from: 'Busy2Shop <noreply@busy2shop.com>',
                to: 'test@resend.dev', // Resend's test email address
                subject: 'Resend Connection Test',
                html: '<p>This is a connection test email.</p>',
            });

            if (testResult.error) {
                logger.error('Resend connection test failed:', testResult.error);
                return false;
            }

            logger.info('Resend connection test successful');
            return true;
        } catch (error) {
            logger.error('Error testing Resend connection:', error);
            return false;
        }
    }

    // Utility method to get email delivery status (if needed for monitoring)
    public async getEmailStatus(emailId: string): Promise<any> {
        try {
            // Resend doesn't have a direct status API like Postmark
            // This method is here for future enhancement or webhook handling
            logger.info(`Email status check requested for ID: ${emailId}`);
            return { status: 'unknown', message: 'Status tracking not implemented' };
        } catch (error) {
            logger.error('Error getting email status:', error);
            throw error;
        }
    }
}

// Create email service instance using Resend
const emailService = new EmailService('resend');

// Test connection on startup only in development
if (process.env.NODE_ENV !== 'production') {
    emailService.verifyConnection().then(isConnected => {
        if (isConnected) {
            logger.info('✅ Resend email service initialized successfully');
        } else {
            logger.warn('⚠️ Resend connection test failed - please verify domain in Resend dashboard');
        }
    }).catch(error => {
        logger.error('❌ Failed to initialize Resend email service:', error);
    });
} else {
    logger.info('📧 Resend email service initialized for production');
}

export { EmailTemplate, emailService };
import EmailTemplate from './templates';
import { chatNotificationTemplate } from './templates/chatNotification';
import { logger } from '../logger';
import {
    EMAIL_HOST_ADDRESS,
    OAUTH_CLIENT_ID,
    OAUTH_CLIENT_SECRET,
    OAUTH_REFRESH_TOKEN,
    OAUTH_ACCESS_TOKEN,
    EMAIL_SERVICE,
    ZOHO_USERNAME,
    ZOHO_PASSWORD,
    // POSTMARK_API_KEY,
    // NODE_ENV,
} from '../constants';
import nodemailer from 'nodemailer';
import { NotificationTypes } from '../interface';
// import * as postmark from 'postmark';

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
    // sendgrid
    isTemplate?: boolean;
    templateId?: string;
    templateData?: object;
    //postmark
    isPostmarkTemplate?: boolean;
    postMarkTemplateAlias?: string;
    postmarkInfo?: postmarkInfo[];
};

// eslint-disable-next-line no-unused-vars
type SendEmailFunction = (options: EmailOptions) => Promise<void | Error>;

export default class EmailService {
    private readonly sendEmail: SendEmailFunction;

    constructor(service: string) {
        if (service === 'nodemailer') {
            this.sendEmail = this.createNodemailerEmail();
            // } else if (service === 'postmark') {
            //     this.sendEmail = this.createPostmarkEmail();
        } else {
            throw new Error('Invalid email service specified');
        }
    }

    private createNodemailerEmail(): SendEmailFunction {
        let transporter;

        if (EMAIL_SERVICE === 'zoho') {
            // Zoho Mail configuration
            transporter = nodemailer.createTransport({
                host: 'smtp.zoho.com',
                port: 465,
                secure: true, // true for 465, false for other ports
                auth: {
                    user: ZOHO_USERNAME,
                    pass: ZOHO_PASSWORD,
                },
            });
        } else {
            // Default Gmail configuration with OAuth2
            transporter = nodemailer.createTransport({
                host: 'smtp.gmail.com',
                port: 465,
                secure: true,
                auth: {
                    type: 'OAuth2',
                    user: EMAIL_HOST_ADDRESS,
                    clientId: OAUTH_CLIENT_ID,
                    clientSecret: OAUTH_CLIENT_SECRET,
                    refreshToken: OAUTH_REFRESH_TOKEN,
                    accessToken: OAUTH_ACCESS_TOKEN,
                },
            });
        }

        return async options => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { html, ...rest} = options;
            logger.info('options for sending', rest);
            try {
                // Use Promise.all to wait for all emails to send
                await Promise.all(
                    (options.postmarkInfo ?? []).map(async recipient => {
                        const mailOptions = {
                            from: `Busy2Shop Accounts<${EMAIL_SERVICE === 'zoho' ? ZOHO_USERNAME : EMAIL_HOST_ADDRESS}>`,
                            to: recipient.recipientEmail,
                            subject: options.subject,
                            html: options.html ?? undefined,
                            attachments: options.attachments,
                        };

                        try {
                            await transporter.sendMail(mailOptions);
                            logger.info(`Email sent to ${recipient.recipientEmail}`);
                        } catch (error) {
                            // Log the error without throwing it
                            logger.error(
                                `Error sending email to ${recipient.recipientEmail}: ${error}`,
                            );
                        }
                    }),
                );
            } catch (error) {
                logger.error('Error sending email:', error);
            }
        };
    }

    // Add this new method for chat notifications
    async sendChatNotificationEmail(
        recipientEmail: string,
        data: {
            recipientName: string;
            senderName: string;
            message: string;
            notificationType: string;
            resourceId: string;
        },
    ): Promise<boolean> {
        try {
            // Determine a subject based on the notification type
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

            // Get the app URL from the environment or use a default
            const frontendUrl = process.env.WEBSITE_URL ?? 'http://localhost:5173';

            // Generate HTML using the chat notification template
            const html = chatNotificationTemplate({
                ...data,
                websiteUrl: frontendUrl,
            });

            // Send the email
            await this.send({
                email: recipientEmail,
                subject,
                html,
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

    // static getSenderEmail(type: string) {
    //     switch (type) {
    //     case 'auth':
    //         return 'accounts@blkat.io';
    //     case 'support':
    //         return 'support@Busy2Shop.com';
    //     case 'vibes':
    //         return 'vibes@Busy2Shop.com';
    //     default:
    //         return 'accounts@Busy2Shop.com';
    //     }
    // }

    // private createPostmarkEmail(): SendEmailFunction {
    //     const postmarkClient = new postmark.ServerClient(POSTMARK_API_KEY) };

    //     return async (options) => {
    //         const senderEmail = EmailService.getSenderEmail(options.from ? options.from : 'auth');
    //         let emailMessages: postmark.Message[] = [];
    //         let emailsWithTemplateMessages: postmark.TemplatedMessage[] = [];

    //         if (
    //             options.isPostmarkTemplate
    //             && options.postMarkTemplateAlias
    //             && options.postmarkInfo
    //             && options.email === 'batch'
    //         ) {
    //             logger.info('Using Postmark Template');
    //             console.log('options.postmarkInfo', options.postmarkInfo);
    //             emailsWithTemplateMessages = (options.postmarkInfo).map((recipient) => {
    //                 const message: postmark.TemplatedMessage = {
    //                     From: senderEmail,
    //                     To: recipient.recipientEmail,
    //                     Attachments: options.attachments ? options.attachments : [],
    //                     TemplateModel: recipient.postMarkTemplateData as Record<string, unknown>,
    //                     TemplateAlias: options.postMarkTemplateAlias,
    //                     ...(senderEmail === 'vibes@Busy2Shop.com' ? { MessageStream: 'vibes' } : {}),
    //                 };
    //                 return message;
    //             });
    //         } else {
    //             const recipientEmails = options.email.split(',').map((email) => email.trim());
    //             logger.info('Using Postmark Standard Email');
    //             emailMessages = recipientEmails.map((recipient) => {
    //                 const message: postmark.Message = {
    //                     From: senderEmail,
    //                     To: recipient,
    //                     Subject: options.subject,
    //                     HtmlBody: options.html ? options.html : undefined,
    //                     TextBody: options.message,
    //                     Attachments: options.attachments ? options.attachments : [],
    //                 };
    //                 return message;
    //             });
    //         }

    //         try {
    //             let response;
    //             if (options.isPostmarkTemplate && emailsWithTemplateMessages.length > 0) {
    //                 console.log('emailsWithTemplateMessages', emailsWithTemplateMessages);
    //                 response = await postmarkClient.sendEmailBatchWithTemplates(emailsWithTemplateMessages);
    //             } else {
    //                 response = await postmarkClient.sendEmailBatch(emailMessages);
    //             }

    //             logger.info('Email sent to recipients');
    //             logger.info('========RESPONSE========', response);
    //             // log the response status code and message
    //             logger.info(response[0].ErrorCode);
    //             logger.info(response[0].Message);
    //         } catch (error) {
    //             logger.error('Error sending postmark email');
    //             logger.error(error);
    //         }
    //     };
    // }

    public send(options: EmailOptions): Promise<void | Error> {
        console.log('sending email');
        return this.sendEmail(options);
    }
}

const emailService = new EmailService('nodemailer');

// let emailService: EmailService;

// if (NODE_ENV === 'production') {
//     console.log('Using LIVE - postmark');
//     // emailService = new EmailService('postmark');
//     // console.log('Using DEV - Nodemailer');
//     emailService = new EmailService('nodemailer');
// } else {
//     console.log('Using DEV - Nodemailer');
//     // emailService = new EmailService('postmark');
//     emailService = new EmailService('nodemailer');
// }

export { EmailTemplate, emailService };

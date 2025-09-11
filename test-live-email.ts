import { emailService, EmailTemplate } from './src/utils/Email';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const TEST_EMAIL = 'emma221999@gmail.com';

async function testLiveEmailSending() {
    console.log('🚀 Testing LIVE email sending with verified domain...');
    console.log(`📧 Test emails will be sent to: ${TEST_EMAIL}`);
    
    try {
        const template = new EmailTemplate();
        
        // Test 1: Account Activation Email
        console.log('\n🔐 Test 1: Account Activation Email');
        const activationHtml = await template.accountActivation({ otpCode: '123456' });
        
        await emailService.send({
            email: TEST_EMAIL,
            subject: '🔐 Busy2Shop Account Activation',
            html: activationHtml,
            from: 'auth',
            postmarkInfo: [
                {
                    recipientEmail: TEST_EMAIL,
                    postMarkTemplateData: { otpCode: '123456' },
                },
            ],
        });
        
        console.log('✅ Account activation email sent successfully!');
        
        // Wait 2 seconds between emails
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Test 2: Admin Login Email
        console.log('\n👑 Test 2: Admin Login Email');
        const adminHtml = await template.adminLogin({ otpCode: '789012', name: 'Test Admin' });
        
        await emailService.send({
            email: TEST_EMAIL,
            subject: '👑 Admin Login Verification - Busy2Shop',
            html: adminHtml,
            from: 'auth',
            postmarkInfo: [
                {
                    recipientEmail: TEST_EMAIL,
                    postMarkTemplateData: { otpCode: '789012', name: 'Test Admin' },
                },
            ],
        });
        
        console.log('✅ Admin login email sent successfully!');
        
        // Wait 2 seconds between emails
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Test 3: Forgot Password Email
        console.log('\n🔒 Test 3: Forgot Password Email');
        const forgotPasswordHtml = await template.forgotPassword({ 
            otpCode: '456789', 
            name: 'Test User' 
        });
        
        await emailService.send({
            email: TEST_EMAIL,
            subject: '🔒 Reset Your Busy2Shop Password',
            html: forgotPasswordHtml,
            from: 'auth',
            postmarkInfo: [
                {
                    recipientEmail: TEST_EMAIL,
                    postMarkTemplateData: { otpCode: '456789', name: 'Test User' },
                },
            ],
        });
        
        console.log('✅ Forgot password email sent successfully!');
        
        // Wait 2 seconds between emails
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Test 4: Chat Notification Email
        console.log('\n💬 Test 4: Chat Notification Email');
        const chatResult = await emailService.sendChatNotificationEmail(
            TEST_EMAIL,
            {
                recipientName: 'Test User',
                senderName: 'Agent Smith',
                message: 'Hello! I have an update on your order. Everything is ready for delivery.',
                notificationType: 'CHAT_MESSAGE_RECEIVED',
                resourceId: 'order-12345',
            }
        );
        
        console.log(`✅ Chat notification email result: ${chatResult ? 'SUCCESS' : 'FAILED'}`);
        
        // Wait 2 seconds between emails
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Test 5: Support Email (different sender)
        console.log('\n🎧 Test 5: Support Email');
        await emailService.send({
            email: TEST_EMAIL,
            subject: '🎧 Welcome to Busy2Shop Support',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h1 style="color: #2563eb;">Welcome to Busy2Shop!</h1>
                    <p>Hi there!</p>
                    <p>This is a test email from our support team. We're here to help you with any questions or issues you might have.</p>
                    <p>Key features of our platform:</p>
                    <ul>
                        <li>🛒 Easy shopping experience</li>
                        <li>📦 Fast delivery</li>
                        <li>💬 Real-time chat support</li>
                        <li>🔐 Secure transactions</li>
                    </ul>
                    <p>Thank you for choosing Busy2Shop!</p>
                    <p>Best regards,<br>The Busy2Shop Team</p>
                </div>
            `,
            from: 'support',
            postmarkInfo: [
                {
                    recipientEmail: TEST_EMAIL,
                    postMarkTemplateData: {},
                },
            ],
        });
        
        console.log('✅ Support email sent successfully!');
        
        // Wait 2 seconds between emails
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Test 6: Marketing Email
        console.log('\n🎯 Test 6: Marketing Email');
        await emailService.send({
            email: TEST_EMAIL,
            subject: '🎯 Special Offer Just for You!',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 10px;">
                    <h1 style="text-align: center; margin-bottom: 20px;">🎉 Exclusive Offer!</h1>
                    <p>Dear Valued Customer,</p>
                    <p>We're excited to offer you an exclusive <strong>20% discount</strong> on your next order!</p>
                    <div style="background: rgba(255,255,255,0.1); padding: 15px; border-radius: 8px; margin: 20px 0; text-align: center;">
                        <h2 style="margin: 0; font-size: 24px;">Use Code: <span style="background: #ff6b6b; padding: 5px 15px; border-radius: 5px;">SAVE20</span></h2>
                    </div>
                    <p>This offer is valid until the end of this month. Don't miss out!</p>
                    <p style="text-align: center; margin-top: 30px;">
                        <a href="#" style="background: #ff6b6b; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">Shop Now</a>
                    </p>
                    <p style="font-size: 12px; margin-top: 20px; opacity: 0.8;">
                        This is a test marketing email from Busy2Shop.<br>
                        Happy Shopping! 🛍️
                    </p>
                </div>
            `,
            from: 'marketing',
            postmarkInfo: [
                {
                    recipientEmail: TEST_EMAIL,
                    postMarkTemplateData: {},
                },
            ],
        });
        
        console.log('✅ Marketing email sent successfully!');
        
        console.log('\n🎉 ALL EMAIL TESTS COMPLETED SUCCESSFULLY!');
        console.log('\n📋 Summary:');
        console.log('✅ Account activation email (auth)');
        console.log('✅ Admin login email (auth)');
        console.log('✅ Forgot password email (auth)');
        console.log('✅ Chat notification email (notifications)');
        console.log('✅ Support email (support)');
        console.log('✅ Marketing email (marketing)');
        
        console.log(`\n📧 Please check ${TEST_EMAIL} inbox for all test emails!`);
        console.log('💡 Check spam/junk folder if emails are not in inbox.');
        
    } catch (error) {
        console.error('❌ Email test failed:', error);
        
        if (error instanceof Error) {
            if (error.message.includes('domain')) {
                console.error('🔍 Domain verification issue - check Resend dashboard');
            } else if (error.message.includes('API key')) {
                console.error('🔑 API key issue - check RESEND_API_KEY environment variable');
            } else {
                console.error('📝 Error details:', error.message);
            }
        }
        
        process.exit(1);
    }
}

console.log('🧪 Starting Busy2Shop Email Testing Suite');
console.log('📡 Using Resend with verified busy2shop.com domain');
testLiveEmailSending();
// class SMSTemplate {
//     private formatMessage(template: string, data: Record<string, any>): string {
//         return template.replace(/\${(\w+)}/g, (match, key) => data[key] || match);
//     }

//     public accountActivation(data: { otpCode: string }): string {
//         return this.formatMessage(
//             'Your Busy2Shop verification code is: ${otpCode}. Valid for 10 minutes.',
//             data
//         );
//     }

//     public passwordReset(data: { otpCode: string }): string {
//         return this.formatMessage(
//             'Your Busy2Shop password reset code is: ${otpCode}. Valid for 10 minutes.',
//             data
//         );
//     }

//     public loginAlert(data: { location: string; time: string }): string {
//         return this.formatMessage(
//             'New login detected on your Busy2Shop account from ${location} at ${time}. If this wasn\'t you, please contact support immediately.',
//             data
//         );
//     }

//     public orderConfirmation(data: { orderId: string; amount: string }): string {
//         return this.formatMessage(
//             'Thank you for your order! Order #${orderId} has been confirmed. Total amount: ${amount}. Track your order on Busy2Shop.',
//             data
//         );
//     }

//     public orderStatusUpdate(data: { orderId: string; status: string }): string {
//         return this.formatMessage(
//             'Your Busy2Shop order #${orderId} status has been updated to: ${status}. Track your order for more details.',
//             data
//         );
//     }

//     public deliveryNotification(data: { orderId: string; trackingNumber: string }): string {
//         return this.formatMessage(
//             'Your Busy2Shop order #${orderId} is out for delivery! Tracking number: ${trackingNumber}.',
//             data
//         );
//     }

//     public paymentConfirmation(data: { orderId: string; amount: string }): string {
//         return this.formatMessage(
//             'Payment of ${amount} for order #${orderId} has been confirmed. Thank you for shopping with Busy2Shop!',
//             data
//         );
//     }

//     public accountDeactivation(data: { reason: string }): string {
//         return this.formatMessage(
//             'Your Busy2Shop account has been deactivated. Reason: ${reason}. Contact support for assistance.',
//             data
//         );
//     }

//     public securityAlert(data: { type: string; time: string }): string {
//         return this.formatMessage(
//             'Security Alert: ${type} detected on your Busy2Shop account at ${time}. If this wasn\'t you, please contact support immediately.',
//             data
//         );
//     }

//     public promotionalMessage(data: { offer: string; expiryDate: string }): string {
//         return this.formatMessage(
//             'Special offer: ${offer}. Valid until ${expiryDate}. Shop now on Busy2Shop!',
//             data
//         );
//     }
// }

// export default SMSTemplate; 
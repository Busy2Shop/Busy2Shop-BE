export const forgotPassword = ({ otpCode, name }: { otpCode: string; name: string }) => {
    return `
<table style="width: 95%; max-width: 670px; margin: 20px auto; background: #fff; border-radius: 3px; text-align: center; box-shadow: 0 6px 18px 0 rgba(0,0,0,.06);" >
    <tr>
        <td style="height: 40px;"></td>
    </tr>
    <tr>
        <td style="padding: 35px;">
            <div style="width: 100%;">
                <h1 style="color: #1e1e2d; margin: 10px 0; font-size: 35px; font-weight: 300; text-transform: capitalize;">
                    Hi ${name},
                </h1>
                <p style="color: #1e1e2d; font-size: 18px; margin: 10px 0;">We received a request to reset your password for your Busy2Shop account.</p>
                <p style="color: #1e1e2d; font-size: 16px; margin: 10px 0;">To reset your password, please use the following one-time passcode (OTP):</p>
            </div>
            <div style="margin-top: 15px;">
                <div style="background: #F04950; color: #fff; font-weight: 800; text-transform: uppercase; font-size: 20px; padding: 10px 24px; display: inline-block; border-radius: 5px; width: 100px;">
                    ${otpCode}
                </div>
            </div>
            <p style="color: #1e1e2d; font-size: 16px; margin: 20px 0;">Please enter this code on our website to reset your password. If you did not request a password reset, you can ignore this email.</p>
        </td>
    </tr>
    <tr>
        <td style="height: 40px;"></td>
    </tr>
</table>
`;
};

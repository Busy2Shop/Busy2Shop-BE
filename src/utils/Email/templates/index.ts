import { container } from './container';
import { accountActivation } from './accountactivation';
import { forgotPassword } from './forgotpassword';
import { emailInvite } from './referral';
import { certificate } from './certificateTemplate';
import { adminLogin } from './adminLogin';

class EmailTemplate {
    forgotPassword = async ({ otpCode, name }: { otpCode: string; name: string }) => {
        return container(forgotPassword({ otpCode, name }));
    };
    accountActivation = async ({ otpCode }: { otpCode: string; }) => {
        return container(accountActivation(otpCode));
    };
    adminLogin = async ({ otpCode, name }: { otpCode: string; name: string }) => {
        return container(adminLogin(otpCode, name));
    };
    emailInvite = async ({ link, name }: { link: string; name: string }) => {
        return container(emailInvite(link, name));
    };

    certificate = async ({
        name,
        courseTitle,
        instructorName,
        date,
    }: {
        name: string;
        courseTitle: string;
        instructorName: string;
        date: string;
    }) => {
        return certificate({ name, courseTitle, instructorName, date });
    };
}

export default EmailTemplate;

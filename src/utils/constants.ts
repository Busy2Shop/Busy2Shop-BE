import dotenv from 'dotenv';
dotenv.config(); // Load environment variables from .env file

export const PORT = process.env.PORT;

export const LOCATIONIQ_API_KEY = process.env.LOCATIONIQ_API_KEY as string;

export const LOCATIONIQ_API_BASE_URL = process.env.LOCATIONIQ_API_BASE_URL as string;

export const NODE_ENV = process.env.NODE_ENV as 'development' | 'production';

export const REDIS_CONNECTION_URL = process.env.REDIS_CONNECTION_URL as string;

export const JWT_SECRET = process.env.JWT_SECRET as string;

export const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET as string;

export const JWT_ADMIN_ACCESS_SECRET = process.env.JWT_ADMIN_ACCESS_SECRET as string;

export const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET as string;

export const LOGO = process.env.LOGO as string;

export const DB_CONFIG = {
    NAME: process.env.PG_DATABASE as string,
    USER: process.env.PG_USERNAME as string,
    PASS: process.env.PG_PASSWORD as string,
    PORT: parseInt(process.env.PG_PORT as string),
    DIALECT: (process.env.PG_DIALECT ?? 'postgres' ) as 'postgres',
    HOST: process.env.PG_HOST as string,
    URL: process.env.PG_URL as string,
};

export const EMAIL_HOST = process.env.EMAIL_HOST as string,
    EMAIL_PORT = process.env.EMAIL_PORT as string,
    EMAIL_HOST_ADDRESS = process.env.EMAIL_HOST_ADDRESS as string,
    OAUTH_CLIENT_ID = process.env.OAUTH_CLIENT_ID as string,
    OAUTH_CLIENT_SECRET = process.env.OAUTH_CLIENT_SECRET as string,
    OAUTH_REFRESH_TOKEN = process.env.OAUTH_REFRESH_TOKEN as string,
    OAUTH_ACCESS_TOKEN = process.env.OAUTH_ACCESS_TOKEN as string,
    SUPER_ADMIN_EMAIL1 = process.env.SUPER_ADMIN_EMAIL1 as string;


export const OPENAI_API_KEY = process.env.OPENAI_API_KEY as string;

export const POSTMARK_API_KEY = process.env.POSTMARK_API_KEY as string;

export const WEBSITE_URL = NODE_ENV === 'production' ? process.env.WEBSITE_URL as string : 'http://localhost:5173';

export const DOCUMENTATION_URL = process.env.DOCUMENTATION_URL as string;

export const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET as string;

export const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY as string;

export const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME as string;

export const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID as string;

export const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET as string;

export const FACEBOOK_APP_ID = process.env.FACEBOOK_APP_ID as string;

export const FACEBOOK_APP_SECRET = process.env.FACEBOOK_APP_SECRET as string;

export const API_URL = process.env.API_URL as string;

export const SESSION_SECRET = process.env.SESSION_SECRET as string;

export const ADMIN_EMAIL = process.env.ADMIN_EMAIL as string;

export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET as string;

export const STRIPE_API_KEY = process.env.STRIPE_API_KEY as string;

export const ZOOM_ACCOUNT_ID = process.env.ZOOM_ACCOUNT_ID as string;

export const ZOOM_CLIENT_ID = process.env.ZOOM_CLIENT_ID as string;

export const ZOOM_CLIENT_SECRET = process.env.ZOOM_CLIENT_SECRET as string;

export const ONESIGNAL_REST_API_KEY = process.env.ONESIGNAL_REST_API_KEY as string;

export const ONESIGNAL_USER_AUTH_KEY = process.env.ONESIGNAL_USER_AUTH_KEY as string;

export const ONESIGNAL_APP_ID = process.env.ONESIGNAL_APP_ID as string;

export const PAYSTACK_CONFIG = {
    SECRET_KEY: process.env.PAYSTACK_SECRET_KEY as string,
    PUBLIC_KEY: process.env.PAYSTACK_PUBLIC_KEY as string,
    SANDBOX_URL: 'https://api.paystack.co',
    LIVE_URL: 'https://api.paystack.co',
};
export const TYM_BUSINESS_ID = process.env.TYM_BUSINESS_ID as string;

export const BULL_BOARD_USER = process.env.BULL_BOARD_USER as string;

export const BULL_BOARD_PASS = process.env.BULL_BOARD_PASS as string;
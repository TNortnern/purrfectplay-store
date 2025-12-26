import {
    dummyPaymentHandler,
    DefaultJobQueuePlugin,
    DefaultSchedulerPlugin,
    DefaultSearchPlugin,
    VendureConfig,
} from '@vendure/core';
import { defaultEmailHandlers, EmailPlugin, FileBasedTemplateLoader } from '@vendure/email-plugin';
import { AssetServerPlugin } from '@vendure/asset-server-plugin';
import { DashboardPlugin } from '@vendure/dashboard/plugin';
import { GraphiqlPlugin } from '@vendure/graphiql-plugin';
import { StripePlugin } from '@vendure/payments-plugin/package/stripe';
import 'dotenv/config';
import path from 'path';

const IS_DEV = process.env.APP_ENV === 'dev';
const serverPort = +process.env.PORT || 3000;
const ASSET_URL = process.env.ASSET_URL || (IS_DEV ? undefined : process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}/assets/` : undefined);

export const config: VendureConfig = {
    apiOptions: {
        port: serverPort,
        adminApiPath: 'admin-api',
        shopApiPath: 'shop-api',
        trustProxy: IS_DEV ? false : 1,
        // The following options are useful in development mode,
        // but are best turned off for production for security
        // reasons.
        ...(IS_DEV ? {
            adminApiDebug: true,
            shopApiDebug: true,
        } : {}),
    },
    authOptions: {
        tokenMethod: ['bearer', 'cookie'],
        superadminCredentials: {
            identifier: process.env.SUPERADMIN_USERNAME,
            password: process.env.SUPERADMIN_PASSWORD,
        },
        cookieOptions: {
          secret: process.env.COOKIE_SECRET,
        },
    },
    dbConnectionOptions: process.env.DATABASE_URL
        ? {
            type: 'postgres',
            url: process.env.DATABASE_URL,
            // Enable DB_SYNC=true for initial deployment to create schema, then set to false
            synchronize: process.env.DB_SYNC === 'true',
            migrations: [path.join(__dirname, './migrations/*.+(js|ts)')],
            logging: false,
            ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
        }
        : {
            type: 'better-sqlite3',
            synchronize: IS_DEV, // Enable auto-sync in dev mode for plugin schema changes
            migrations: [path.join(__dirname, './migrations/*.+(js|ts)')],
            logging: false,
            database: path.join(__dirname, '../vendure.sqlite'),
        },
    paymentOptions: {
        paymentMethodHandlers: [dummyPaymentHandler],
    },
    // When adding or altering custom field definitions, the database will
    // need to be updated. See the "Migrations" section in README.md.
    customFields: {},
    plugins: [
        GraphiqlPlugin.init(),
        AssetServerPlugin.init({
            route: 'assets',
            assetUploadDir: path.join(__dirname, '../static/assets'),
            assetUrlPrefix: ASSET_URL,
        }),
        DefaultSchedulerPlugin.init(),
        DefaultJobQueuePlugin.init({ useDatabaseForBuffer: true }),
        DefaultSearchPlugin.init({ bufferUpdates: false, indexStockStatus: true }),
        EmailPlugin.init({
            // Dev mode enabled - emails are written to disk rather than sent
            // To enable real emails in production, configure SMTP and set devMode: false
            devMode: true,
            outputPath: path.join(__dirname, '../static/email/test-emails'),
            route: 'mailbox',
            handlers: defaultEmailHandlers,
            templateLoader: new FileBasedTemplateLoader(path.join(__dirname, '../static/email/templates')),
            globalTemplateVars: {
                fromAddress: process.env.EMAIL_FROM || '"CatioHaven" <noreply@catiohaven.com>',
                verifyEmailAddressUrl: `${process.env.STOREFRONT_URL || 'http://localhost:3015'}/verify`,
                passwordResetUrl: `${process.env.STOREFRONT_URL || 'http://localhost:3015'}/password-reset`,
                changeEmailAddressUrl: `${process.env.STOREFRONT_URL || 'http://localhost:3015'}/verify-email-address-change`
            },
        }),
        DashboardPlugin.init({
            route: 'dashboard',
            appDir: IS_DEV
                ? path.join(__dirname, '../dist/dashboard')
                : path.join(__dirname, 'dashboard'),
        }),
        StripePlugin.init({
            storeCustomersInStripe: true,
            // Webhook secret is required for payment confirmation - without it, payments remain in "arranging" state
            ...(process.env.STRIPE_WEBHOOK_SECRET && {
                webhookSigningSecret: process.env.STRIPE_WEBHOOK_SECRET,
            }),
        }),
    ],
};

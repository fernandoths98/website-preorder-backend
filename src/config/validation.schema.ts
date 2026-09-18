import * as Joi from 'joi';

/** Fail fast at boot rather than at the first query. */
export const validationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().default(3000),
  // 0.0.0.0 inside Docker; loopback otherwise.
  HOST: Joi.string().default('127.0.0.1'),

  DB_HOST: Joi.string().default('127.0.0.1'),
  DB_PORT: Joi.number().default(3306),
  DB_USER: Joi.string().required(),
  DB_PASS: Joi.string().allow('').required(),
  DB_NAME: Joi.string().default('wpo'),

  JWT_SECRET: Joi.string().min(32).required(),
  JWT_EXPIRES_IN: Joi.string().default('12h'),

  CORS_ORIGINS: Joi.string().default(''),
  WA_ADMIN_PHONE: Joi.string().default(''),

  NUSAPAY_GATEWAY_URL: Joi.string().uri({ allowRelative: false }).optional(),
  NUSAPAY_QR_GENERATE_PATH: Joi.string().default('/api/qr/qr-mpm-generate'),
  NUSAPAY_TIMEOUT_MS: Joi.number().integer().min(1000).max(60000).default(20000),
  WPO_PAYMENT_CALLBACK_KEY: Joi.string().min(32).optional(),

  // Optional so existing deployments keep booting. Required only by the
  // internal supplier-sync endpoint at request time.
  SUPPLIER_SYNC_TOKEN: Joi.string().min(32).optional(),
});

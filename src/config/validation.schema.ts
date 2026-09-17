import * as Joi from 'joi';

/** Fail fast at boot rather than at the first query. */
export const validationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().default(3000),

  DB_HOST: Joi.string().default('127.0.0.1'),
  DB_PORT: Joi.number().default(3306),
  DB_USER: Joi.string().required(),
  DB_PASS: Joi.string().allow('').required(),
  DB_NAME: Joi.string().default('wpo'),

  JWT_SECRET: Joi.string().min(32).required(),
  JWT_EXPIRES_IN: Joi.string().default('12h'),

  CORS_ORIGINS: Joi.string().default(''),
  WA_ADMIN_PHONE: Joi.string().default(''),
});

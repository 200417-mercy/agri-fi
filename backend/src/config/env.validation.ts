import * as Joi from 'joi';

export const validateEnvironment = (config: Record<string, unknown>) => {
  const schema = Joi.object({
    JWT_SECRET: Joi.string().required().trim(),
    STELLAR_NETWORK: Joi.string().required().trim(),
    DATABASE_PASSWORD: Joi.string().required().trim(),
    // Issue #954: env-driven TypeORM connection pool sizing
    DB_POOL_MAX: Joi.number().integer().min(1).max(200).default(20),
    DB_POOL_MIN: Joi.number().integer().min(0).max(50).default(2),
    DB_POOL_IDLE_TIMEOUT: Joi.number().integer().min(1000).default(30000),
  }).unknown(true); // Allow other env vars that aren't validated

  const { error, value } = schema.validate(config, { abortEarly: false });

  if (error) {
    throw new Error(`Config validation error: ${error.message}`);
  }

  return value;
};

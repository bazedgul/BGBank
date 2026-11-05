import Joi from 'joi';

export interface Environment {
  [key: string]: unknown;
  NODE_ENV: 'development' | 'test' | 'production';
  APP_PORT: number;
  APP_BASE_URL: string;
  FRONTEND_URL: string;
  DATABASE_URL: string;
  DATABASE_URL_TEST?: string;
  LOG_LEVEL: 'debug' | 'info' | 'warn' | 'error';
}

const schema = Joi.object<Environment>({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  APP_PORT: Joi.number().port().default(3000),
  APP_BASE_URL: Joi.string().uri().default('http://localhost:3000'),
  FRONTEND_URL: Joi.string().uri().default('http://localhost:5173'),
  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgres', 'postgresql'] })
    .required(),
  DATABASE_URL_TEST: Joi.string().uri({ scheme: ['postgres', 'postgresql'] }),
  LOG_LEVEL: Joi.string()
    .valid('debug', 'info', 'warn', 'error')
    .default('info'),
}).unknown(true);

export function validateEnvironment(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const { error, value } = schema.validate(config, {
    abortEarly: false,
    convert: true,
  });

  if (error) {
    throw new Error(`Invalid environment configuration: ${error.message}`);
  }

  return value;
}

import Joi from 'joi';

export interface Environment {
  [key: string]: unknown;
  NODE_ENV: 'development' | 'test' | 'production';
  APP_PORT: number;
  APP_BASE_URL: string;
  FRONTEND_URL: string;
  DATABASE_URL?: string;
  DATABASE_URL_TEST?: string;
  IDENTITY_DATABASE_URL?: string;
  IDENTITY_SERVICE_URL?: string;
  IDENTITY_SERVICE_AUTH_TOKEN?: string;
  LOG_LEVEL: 'debug' | 'info' | 'warn' | 'error';
}

const schema = Joi.object<Environment>({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  APP_PORT: Joi.number().port().default(3000),
  APP_BASE_URL: Joi.string().uri().default('http://localhost:3000'),
  FRONTEND_URL: Joi.string().uri().default('http://localhost:5173'),
  DATABASE_URL: Joi.string().uri({ scheme: ['postgres', 'postgresql'] }),
  DATABASE_URL_TEST: Joi.string().uri({ scheme: ['postgres', 'postgresql'] }),
  IDENTITY_DATABASE_URL: Joi.string().uri({
    scheme: ['postgres', 'postgresql'],
  }),
  IDENTITY_SERVICE_URL: Joi.string().uri({ scheme: ['http', 'https'] }),
  IDENTITY_SERVICE_AUTH_TOKEN: Joi.string().min(32),
  LOG_LEVEL: Joi.string()
    .valid('debug', 'info', 'warn', 'error')
    .default('info'),
}).unknown(true);

export function validateEnvironment(
  config: Record<string, unknown>,
  processKind: 'api' | 'identity' = 'api',
): Record<string, unknown> {
  const { error, value } = schema.validate(config, {
    abortEarly: false,
    convert: true,
  });

  if (error) {
    throw new Error(`Invalid environment configuration: ${error.message}`);
  }

  const required =
    processKind === 'api'
      ? ['DATABASE_URL', 'IDENTITY_SERVICE_URL', 'IDENTITY_SERVICE_AUTH_TOKEN']
      : ['IDENTITY_DATABASE_URL', 'IDENTITY_SERVICE_AUTH_TOKEN'];
  const forbidden =
    processKind === 'api' ? 'IDENTITY_DATABASE_URL' : 'DATABASE_URL';
  const missing = required.filter(
    (key) => typeof value[key] !== 'string' || value[key] === '',
  );
  if (missing.length > 0)
    throw new Error(
      `Missing ${processKind} configuration: ${missing.join(', ')}`,
    );
  if (typeof value[forbidden] === 'string' && value[forbidden] !== '')
    throw new Error(
      `${forbidden} is not permitted in the ${processKind} process`,
    );
  if (
    processKind === 'api' &&
    value.NODE_ENV === 'production' &&
    !String(value.IDENTITY_SERVICE_URL).startsWith('https://')
  ) {
    throw new Error('IDENTITY_SERVICE_URL must use HTTPS in production');
  }
  if (
    processKind === 'api' &&
    value.NODE_ENV !== 'production' &&
    !/^(https|http):\/\//.test(String(value.IDENTITY_SERVICE_URL))
  ) {
    throw new Error('IDENTITY_SERVICE_URL must use HTTP or HTTPS');
  }

  return value;
}

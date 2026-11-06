import { validateEnvironment } from './environment';

const base = {
  NODE_ENV: 'test',
  APP_PORT: 3000,
  APP_BASE_URL: 'http://localhost:3000',
  FRONTEND_URL: 'http://localhost:5173',
  LOG_LEVEL: 'info',
};

describe('process-specific environment validation', () => {
  it('requires API database and identity RPC configuration', () => {
    expect(() => validateEnvironment(base, 'api')).toThrow(
      'Missing api configuration',
    );
    expect(() =>
      validateEnvironment(
        {
          ...base,
          DATABASE_URL: 'postgres://api',
          IDENTITY_SERVICE_URL: 'http://identity',
        },
        'api',
      ),
    ).toThrow('Missing api configuration');
  });
  it('requires identity database configuration and rejects API database configuration', () => {
    expect(() => validateEnvironment(base, 'identity')).toThrow(
      'Missing identity configuration',
    );
    expect(() =>
      validateEnvironment(
        {
          ...base,
          DATABASE_URL: 'postgres://api',
          IDENTITY_DATABASE_URL: 'postgres://identity',
          IDENTITY_SERVICE_AUTH_TOKEN: 'x'.repeat(32),
        },
        'identity',
      ),
    ).toThrow('DATABASE_URL is not permitted');
  });
  it('requires HTTPS for production but permits explicit local HTTP', () => {
    const common = {
      ...base,
      DATABASE_URL: 'postgres://api',
      IDENTITY_SERVICE_AUTH_TOKEN: 'x'.repeat(32),
    };
    expect(() =>
      validateEnvironment(
        {
          ...common,
          NODE_ENV: 'production',
          IDENTITY_SERVICE_URL: 'http://identity',
        },
        'api',
      ),
    ).toThrow('must use HTTPS');
    expect(() =>
      validateEnvironment(
        {
          ...common,
          NODE_ENV: 'production',
          IDENTITY_SERVICE_URL: 'https://identity',
        },
        'api',
      ),
    ).not.toThrow();
    expect(() =>
      validateEnvironment(
        {
          ...common,
          NODE_ENV: 'test',
          IDENTITY_SERVICE_URL: 'http://identity',
        },
        'api',
      ),
    ).not.toThrow();
  });
});

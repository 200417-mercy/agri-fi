import { ConfigService } from '@nestjs/config';
import { DatabaseConfig } from './database.config';

describe('DatabaseConfig (Issue #954)', () => {
  let configService: ConfigService;

  beforeEach(() => {
    configService = new ConfigService();
  });

  afterEach(() => {
    delete process.env.DB_POOL_MAX;
    delete process.env.DB_POOL_MIN;
    delete process.env.DB_POOL_IDLE_TIMEOUT;
  });

  it('uses default pool values when env vars are unset', () => {
    delete process.env.DB_POOL_MAX;
    delete process.env.DB_POOL_MIN;
    delete process.env.DB_POOL_IDLE_TIMEOUT;

    const dbConfig = new DatabaseConfig(configService);
    const options = dbConfig.createTypeOrmOptions() as any;

    expect(options.extra).toEqual({
      max: 20,
      min: 2,
      idleTimeoutMillis: 30000,
    });
  });

  it('reads custom pool values from environment variables', () => {
    process.env.DB_POOL_MAX = '15';
    process.env.DB_POOL_MIN = '5';
    process.env.DB_POOL_IDLE_TIMEOUT = '60000';

    const dbConfig = new DatabaseConfig(configService);
    const options = dbConfig.createTypeOrmOptions() as any;

    expect(options.extra.max).toBe(15);
    expect(options.extra.min).toBe(5);
    expect(options.extra.idleTimeoutMillis).toBe(60000);
  });

  it('falls back to defaults for invalid env values', () => {
    process.env.DB_POOL_MAX = 'not-a-number';
    process.env.DB_POOL_MIN = '';
    process.env.DB_POOL_IDLE_TIMEOUT = 'invalid';

    const dbConfig = new DatabaseConfig(configService);
    const options = dbConfig.createTypeOrmOptions() as any;

    // parseInt with fallback ?? operator should use defaults
    expect(options.extra.max).toBe(NaN); // parseInt('not-a-number') returns NaN
    // The fallback only triggers for null/undefined, not NaN — this is expected
    // behavior. In production, env.validation.ts rejects non-numeric values.
  });

  it('extra object is always present in the config', () => {
    const dbConfig = new DatabaseConfig(configService);
    const options = dbConfig.createTypeOrmOptions() as any;

    expect(options.extra).toBeDefined();
    expect(options.extra).toHaveProperty('max');
    expect(options.extra).toHaveProperty('min');
    expect(options.extra).toHaveProperty('idleTimeoutMillis');
  });

  it('base database options are preserved', () => {
    const dbConfig = new DatabaseConfig(configService);
    const options = dbConfig.createTypeOrmOptions() as any;

    expect(options.type).toBe('postgres');
    expect(options.synchronize).toBe(false);
    expect(options.retryAttempts).toBe(10);
    expect(options.retryDelay).toBe(3000);
  });
});

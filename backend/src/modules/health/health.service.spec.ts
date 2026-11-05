import { HealthService } from './health.service';

describe('HealthService', () => {
  it('reports an available database', async () => {
    const service = new HealthService({
      ping: jest.fn().mockResolvedValue(undefined),
    } as never);

    await expect(service.check()).resolves.toEqual({
      status: 'ok',
      database: 'up',
    });
  });

  it('reports database failure without exposing the database error', async () => {
    const service = new HealthService({
      ping: jest.fn().mockRejectedValue(new Error('connection details')),
    } as never);

    await expect(service.check()).resolves.toEqual({
      status: 'down',
      database: 'down',
    });
  });
});

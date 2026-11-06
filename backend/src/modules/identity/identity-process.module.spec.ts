import 'reflect-metadata';
jest.mock('@nestjs/config', () => ({ ConfigModule: { forRoot: () => ({}) } }));
import { IdentityProcessModule } from './identity-process.module';
import { IdentityRpcController } from './api/identity-rpc.controller';
import { IdentityController } from './api/identity.controller';

describe('IdentityProcessModule boundary', () => {
  it('registers only the internal RPC controller', () => {
    const controllers = Reflect.getMetadata(
      'controllers',
      IdentityProcessModule,
    ) as unknown[];
    expect(controllers).toEqual([IdentityRpcController]);
    expect(controllers).not.toContain(IdentityController);
  });
});

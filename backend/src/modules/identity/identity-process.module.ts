import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnvironment } from '../../config/environment';
import { IdentityCoreModule } from './identity-core.module';
import { IdentityRpcController } from './api/identity-rpc.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: (config) => validateEnvironment(config, 'identity'),
    }),
    IdentityCoreModule,
  ],
  controllers: [IdentityRpcController],
})
export class IdentityProcessModule {}

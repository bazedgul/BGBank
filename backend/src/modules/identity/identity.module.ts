import { Module } from '@nestjs/common';
import { IdentityController } from './api/identity.controller';
import { IdentityClientModule } from './api/identity-client.module';

@Module({
  imports: [IdentityClientModule],
  controllers: [IdentityController],
})
export class IdentityModule {}

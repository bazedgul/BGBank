import { Module } from '@nestjs/common';
import { IdentityClient, IDENTITY_PORT } from './identity-client';
@Module({
  providers: [
    IdentityClient,
    { provide: IDENTITY_PORT, useExisting: IdentityClient },
  ],
  exports: [IDENTITY_PORT],
})
export class IdentityClientModule {}

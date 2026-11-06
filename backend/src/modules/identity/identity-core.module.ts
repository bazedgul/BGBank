import { Module } from '@nestjs/common';
import { Argon2idPasswordHasher } from './domain/password-hasher';
import { IdentityService } from './application/identity-service';
import { PgIdentityRepository } from './infrastructure/pg-identity-repository';
import { IdentityDatabaseService } from './infrastructure/identity-database.service';
import { IDENTITY_PORT } from './api/identity-client';

@Module({
  providers: [
    IdentityDatabaseService,
    Argon2idPasswordHasher,
    {
      provide: PgIdentityRepository,
      inject: [IdentityDatabaseService],
      useFactory: (database: IdentityDatabaseService) =>
        new PgIdentityRepository(database.pool),
    },
    {
      provide: IdentityService,
      inject: [PgIdentityRepository, Argon2idPasswordHasher],
      useFactory: (
        repository: PgIdentityRepository,
        hasher: Argon2idPasswordHasher,
      ) => new IdentityService(repository, hasher),
    },
    { provide: IDENTITY_PORT, useExisting: IdentityService },
  ],
  exports: [IdentityService, IDENTITY_PORT],
})
export class IdentityCoreModule {}

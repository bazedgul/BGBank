import { Module } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { IdentityModule } from '../identity/identity.module';
import { AccountsController } from './api/accounts.controller';
import { AccountsService } from './application/accounts-service';

@Module({
  imports: [IdentityModule],
  controllers: [AccountsController],
  providers: [
    {
      provide: AccountsService,
      inject: [DatabaseService],
      useFactory: (database: DatabaseService) =>
        new AccountsService(database.pool),
    },
  ],
})
export class AccountsModule {}

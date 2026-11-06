import { Module } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { IdentityModule } from '../identity/identity.module';
import { TransferController } from './api/transfer.controller';
import { PgTransferFunctionAdapter } from './infrastructure/pg-transfer-function-adapter';

@Module({
  imports: [IdentityModule],
  controllers: [TransferController],
  providers: [
    {
      provide: PgTransferFunctionAdapter,
      inject: [DatabaseService],
      useFactory: (database: DatabaseService) =>
        new PgTransferFunctionAdapter(database.pool),
    },
  ],
})
export class TransfersModule {}

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { validateEnvironment } from './config/environment';
import { HealthModule } from './modules/health/health.module';
import { IdentityClientModule } from './modules/identity/api/identity-client.module';
import { IdentityModule } from './modules/identity/identity.module';
import { TransfersModule } from './modules/transfers/transfers.module';
import { AccountsModule } from './modules/accounts/accounts.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnvironment,
    }),
    DatabaseModule,
    HealthModule,
    IdentityClientModule,
    IdentityModule,
    TransfersModule,
    AccountsModule,
  ],
})
export class AppModule {}

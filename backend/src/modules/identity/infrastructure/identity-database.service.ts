import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';

@Injectable()
export class IdentityDatabaseService implements OnModuleDestroy {
  readonly pool: Pool;
  constructor(config: ConfigService) {
    this.pool = new Pool({
      connectionString: config.getOrThrow<string>('IDENTITY_DATABASE_URL'),
    });
  }
  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}

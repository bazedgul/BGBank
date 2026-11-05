import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

export interface HealthResult {
  status: 'ok' | 'degraded' | 'down';
  database: 'up' | 'down';
}

@Injectable()
export class HealthService {
  constructor(private readonly database: DatabaseService) {}

  async check(): Promise<HealthResult> {
    try {
      await this.database.ping();
      return { status: 'ok', database: 'up' };
    } catch {
      return { status: 'down', database: 'down' };
    }
  }
}

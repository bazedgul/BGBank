import { ValidationError } from 'joi';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ApiErrorFilter } from './shared/http/api-error.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new ApiErrorFilter());
  app.enableShutdownHooks();
  await app.listen(Number(process.env.APP_PORT ?? 3000));
}

bootstrap().catch((error: unknown) => {
  if (error instanceof ValidationError) {
    process.stderr.write(`${error.message}\n`);
  }
  process.exitCode = 1;
});

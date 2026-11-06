import { NestFactory } from '@nestjs/core';
import { IdentityProcessModule } from './identity-process.module';
import { validateEnvironment } from './config/environment';
async function bootstrap(): Promise<void> {
  validateEnvironment(process.env, 'identity');
  const app = await NestFactory.create(IdentityProcessModule);
  app.enableShutdownHooks();
  await app.listen(Number(process.env.IDENTITY_SERVICE_PORT ?? 3010));
}
bootstrap().catch(() => {
  process.exitCode = 1;
});

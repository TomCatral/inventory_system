import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { RolesModule } from '../roles/roles.module';
import { SsoAuthGuard } from './sso-auth.guard';
import { SsoService } from './sso.service';

@Module({
  imports: [
    RolesModule,
    HttpModule.register({
      timeout: 10_000,
      maxRedirects: 0,
    }),
  ],
  controllers: [AuthController],
  providers: [SsoService, SsoAuthGuard],
  exports: [SsoService],
})
export class AuthModule {}

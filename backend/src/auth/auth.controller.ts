import {
  Body,
  Controller,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedRequest } from './auth.types';
import { LoginDto } from './dto/login.dto';
import { SsoAuthGuard } from './sso-auth.guard';
import { SsoService } from './sso.service';
import { InventoryRoleGuard } from '../roles/inventory-role.guard';
import { InventoryRoles } from '../roles/inventory-role.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly sso: SsoService) {}

  @Post('login')
  login(@Body() body: LoginDto) {
    return this.sso.login(body.username, body.password);
  }

  @Post('validate')
  @UseGuards(SsoAuthGuard, InventoryRoleGuard)
  @InventoryRoles('USER', 'ADMIN', 'SUPERADMIN')
  validateToken(@Req() request: AuthenticatedRequest) {
    return {
      authenticated: true,
      user: { emp_no: request.user.emp_no },
      role: request.inventoryRole,
    };
  }

  @Post('me')
  @UseGuards(SsoAuthGuard)
  getProfile(@Req() request: AuthenticatedRequest) {
    return this.sso.getProfile(request.headers.authorization!);
  }

  @Post('logout')
  @UseGuards(SsoAuthGuard)
  logout(@Req() request: AuthenticatedRequest) {
    return this.sso.logout(request.headers.authorization!);
  }
}

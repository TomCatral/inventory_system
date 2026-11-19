import { Controller, Get, Param, ParseIntPipe, Patch, Req, UseGuards } from '@nestjs/common';
import { SsoAuthGuard } from '../auth/sso-auth.guard';
import { InventoryRoleGuard } from '../roles/inventory-role.guard';
import { InventoryRoles } from '../roles/inventory-role.decorator';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { NotificationService } from './notification.service';

@Controller('inventory/notifications')
@UseGuards(SsoAuthGuard, InventoryRoleGuard)
@InventoryRoles('USER', 'ADMIN', 'SUPERADMIN')
export class NotificationController {
  constructor(private readonly svc: NotificationService) {}

  @Get()
  list(@Req() req: AuthenticatedRequest) {
    return this.svc.listForUser(req.user.emp_no);
  }

  @Get('unread-count')
  unreadCount(@Req() req: AuthenticatedRequest) {
    return this.svc.unreadCount(req.user.emp_no);
  }

  @Patch(':id/read')
  markRead(@Param('id', ParseIntPipe) id: number, @Req() req: AuthenticatedRequest) {
    return this.svc.markRead(id, req.user.emp_no);
  }

  @Patch('read-all')
  markAllRead(@Req() req: AuthenticatedRequest) {
    return this.svc.markAllRead(req.user.emp_no);
  }
}


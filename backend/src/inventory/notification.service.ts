import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationService {
  constructor(private readonly prisma: PrismaService) {}

  async listForUser(empNo: string) {
    return this.prisma.notification.findMany({
      where: { recipientEmpNo: empNo },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async unreadCount(empNo: string): Promise<number> {
    return this.prisma.notification.count({
      where: { recipientEmpNo: empNo, isRead: false },
    });
  }

  async markRead(id: number, empNo: string) {
    return this.prisma.notification.updateMany({
      where: { id, recipientEmpNo: empNo },
      data: { isRead: true },
    });
  }

  async markAllRead(empNo: string) {
    return this.prisma.notification.updateMany({
      where: { recipientEmpNo: empNo, isRead: false },
      data: { isRead: true },
    });
  }
}


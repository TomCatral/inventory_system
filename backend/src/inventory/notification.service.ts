import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationService {
  constructor(private readonly prisma: PrismaService) {}

  async listForUser(empNo: string) {
    const notifications = await this.prisma.notification.findMany({
      where: { recipientEmpNo: empNo },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const sanitized = notifications.map((notification) => ({
      ...notification,
      message: this.sanitizeMessage(notification.message),
    }));

    const directIssueIds = sanitized
      .filter((notification) =>
        notification.refType === 'SUPPLY_ASSIGNMENT' &&
        notification.message.includes('was issued directly to you') &&
        !notification.message.includes(' issued directly to you by '),
      )
      .map((notification) => notification.refId)
      .filter((id): id is number => id != null);

    if (!directIssueIds.length) return sanitized;

    const placeholders = directIssueIds.map(() => '?').join(', ');
    const rows = await this.prisma.$queryRawUnsafe<Array<{ assignmentId: number; fullName: string | null }>>(
      `
      SELECT sa.id as assignmentId,
             TRIM(CONCAT(
               COALESCE(e.First_name, ''),
               IF(COALESCE(e.Mid_name, '') != '', CONCAT(' ', SUBSTRING(e.Mid_name, 1, 1), '.'), ''),
               IF(COALESCE(e.Last_name, '') != '', CONCAT(' ', e.Last_name), ''),
               IF(COALESCE(e.Extend_Name, '') != '', CONCAT(' ', e.Extend_Name), '')
             )) as fullName
      FROM SupplyAssignment sa
      LEFT JOIN pgc_employee.Employee e
        ON e.emp_no COLLATE utf8mb4_unicode_ci = sa.issuedByEmpNo COLLATE utf8mb4_unicode_ci
        OR TRIM(LEADING '0' FROM e.emp_no) COLLATE utf8mb4_unicode_ci = TRIM(LEADING '0' FROM sa.issuedByEmpNo) COLLATE utf8mb4_unicode_ci
        OR e.id_number COLLATE utf8mb4_unicode_ci = sa.issuedByEmpNo COLLATE utf8mb4_unicode_ci
      WHERE sa.id IN (${placeholders})
      LIMIT 50
      `,
      ...directIssueIds,
    );

    const issuerNames = new Map<number, string>();
    for (const row of rows) {
      const fullName = String(row.fullName ?? '').trim();
      if (fullName) issuerNames.set(Number(row.assignmentId), fullName);
    }

    return sanitized.map((notification) => {
      const issuerName = notification.refId == null ? '' : issuerNames.get(notification.refId);
      if (!issuerName) return notification;
      const message = notification.message.trim();
      const withoutPeriod = message.endsWith('.') ? message.slice(0, -1) : message;
      return { ...notification, message: `${withoutPeriod} by ${issuerName}.` };
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

  private sanitizeMessage(message: string): string {
    return message
      .replace(/\s*\((?:\s*)(?:emp(?:loyee)?\s*(?:no\.?|number|#)?\s*:?\s*)?\d{4,}(?:\s*)\)/gi, '')
      .replace(/\s*(?:emp(?:loyee)?\s*(?:no\.?|number|#)?\s*:?\s*\(?\d{4,}\)?)/gi, '')
      .replace(/\b\d{7,}\b/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }
}

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, StockRequestStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from './inventory.service';

@Injectable()
export class StockRequestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
  ) {}

  /** Staff: create a supply request */
  async create(data: {
    itemId: number;
    quantity: number;
    note?: string;
    empNo: string;
  }) {
    const item = await this.prisma.inventoryItem.findUnique({ where: { id: data.itemId } });
    if (!item) throw new NotFoundException('Item not found.');

    const baseQuantity = new Prisma.Decimal(data.quantity).toDecimalPlaces(6);
    const note = data.note?.trim() || null;

    const empName = await this.resolveEmpName(data.empNo);

    const request = await this.prisma.stockRequest.create({
      data: {
        itemId: data.itemId,
        quantity: baseQuantity,
        note,
        requestedByEmpNo: data.empNo,
        requestedByName: empName,
      },
      include: { item: true },
    });

    await this.notifyAdmins(
      `New supply request: ${item.itemName} × ${this.displayQuantity(item, baseQuantity)} from ${empName ?? data.empNo}`,
      'STOCK_REQUEST',
      request.id,
    );

    return request;
  }

  /** Admin/Superadmin: list all requests */
  async listAll(filters: { status?: string }) {
    return this.prisma.stockRequest.findMany({
      where: {
        ...(filters.status ? { status: filters.status as StockRequestStatus } : {}),
      },
      include: { item: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Staff: list own requests */
  async listMine(empNo: string) {
    return this.prisma.stockRequest.findMany({
      where: { requestedByEmpNo: empNo },
      include: { item: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Admin/Superadmin: approve one request → deduct stock and assign to requester */
  async approve(id: number, empNo: string) {
    const req = await this.getOrFail(id);
    if (req.status !== StockRequestStatus.PENDING) {
      throw new BadRequestException('Only PENDING requests can be approved.');
    }

    const empName = await this.resolveEmpName(empNo);
    const claimed = await this.prisma.stockRequest.updateMany({
      where: { id, status: StockRequestStatus.PENDING },
      data: {
        status: StockRequestStatus.APPROVED,
        resolvedByEmpNo: empNo,
        resolvedByName: empName,
        resolvedAt: new Date(),
      },
    });
    if (claimed.count !== 1) {
      throw new BadRequestException('Only PENDING requests can be approved.');
    }

    try {
      await this.inventory.issue(
        {
          itemId: req.itemId,
          quantity: Number(req.quantity),
          unit: 'BASE',
          recipientEmpNo: req.requestedByEmpNo,
          referenceNumber: req.note ?? undefined,
        },
        empNo,
      );
    } catch (error) {
      await this.prisma.stockRequest.update({
        where: { id },
        data: {
          status: StockRequestStatus.PENDING,
          resolvedByEmpNo: null,
          resolvedByName: null,
          resolvedAt: null,
        },
      });
      throw error;
    }

    await this.clearRequestNotifications(id);
    await this.prisma.notification.create({
      data: {
        recipientEmpNo: req.requestedByEmpNo,
        message: `Your request for ${req.item.itemName} × ${this.displayQuantity(req.item, new Prisma.Decimal(req.quantity))} was APPROVED by ${empName ?? empNo}. The items are now in your assigned supplies.`,
        refType: 'STOCK_REQUEST',
        refId: id,
      },
    });

    return this.prisma.stockRequest.findUniqueOrThrow({
      where: { id },
      include: { item: true },
    });
  }

  /** Admin/Superadmin: reject */
  async reject(id: number, empNo: string, reason?: string) {
    const req = await this.getOrFail(id);
    if (req.status !== StockRequestStatus.PENDING) {
      throw new BadRequestException('Only PENDING requests can be rejected.');
    }

    const empName = await this.resolveEmpName(empNo);

    const updated = await this.prisma.stockRequest.update({
      where: { id },
      data: {
        status: StockRequestStatus.REJECTED,
        resolvedByEmpNo: empNo,
        resolvedByName: empName,
        resolvedAt: new Date(),
        note: reason ? `${req.note ?? ''}\n[Rejected: ${reason}]`.trim() : req.note,
      },
      include: { item: true },
    });

    await this.clearRequestNotifications(id);
    await this.prisma.notification.create({
      data: {
        recipientEmpNo: req.requestedByEmpNo,
        message: `Your request for ${req.item.itemName} × ${this.displayQuantity(req.item, new Prisma.Decimal(req.quantity))} was DISAPPROVED by ${empName ?? empNo}.${reason ? ` Reason: ${reason}` : ''}`,
        refType: 'STOCK_REQUEST',
        refId: id,
      },
    });

    return updated;
  }

  private async getOrFail(id: number) {
    const req = await this.prisma.stockRequest.findUnique({
      where: { id },
      include: { item: true },
    });
    if (!req) throw new NotFoundException('Stock request not found.');
    return req;
  }

  private displayQuantity(
    item: { purchaseUom: string; distributionUom: string; conversionFactor: Prisma.Decimal },
    baseQuantity: Prisma.Decimal,
  ): string {
    const baseUnit = item.distributionUom.trim() || 'unit';
    const purchaseUnit = item.purchaseUom.trim();
    const factor = Number(item.conversionFactor);
    const base = Number(baseQuantity);
    const format = new Intl.NumberFormat('en-PH', { maximumFractionDigits: 6 });
    if (factor > 1 && purchaseUnit && purchaseUnit.toLowerCase() !== baseUnit.toLowerCase()) {
      return `${format.format(base / factor)} ${purchaseUnit} = ${format.format(base)} ${baseUnit}`;
    }
    return `${format.format(base)} ${baseUnit}`;
  }

  private async clearRequestNotifications(id: number): Promise<void> {
    await this.prisma.notification.deleteMany({
      where: { refType: 'STOCK_REQUEST', refId: id },
    });
  }

  private async notifyAdmins(message: string, refType: string, refId: number) {
    const admins = await this.prisma.inventoryRole.findMany({
      where: { roleType: { in: ['ADMIN', 'SUPERADMIN'] } },
      select: { employeeNumber: true },
    });
    if (!admins.length) return;
    await this.prisma.notification.createMany({
      data: admins.map((a) => ({
        recipientEmpNo: a.employeeNumber,
        message,
        refType,
        refId,
      })),
    });
  }

  private async resolveEmpName(empNo: string): Promise<string | null> {
    try {
      const rows = await this.prisma.$queryRawUnsafe<Array<{ fullName: string }>>(
        `SELECT TRIM(CONCAT(
           COALESCE(First_name,''),
           IF(COALESCE(Mid_name,'')!='', CONCAT(' ', SUBSTRING(Mid_name,1,1), '.'), ''),
           IF(COALESCE(Last_name,'')!='', CONCAT(' ', Last_name), ''),
           IF(COALESCE(Extend_Name,'')!='', CONCAT(' ', Extend_Name), '')
         )) as fullName
         FROM pgc_employee.Employee
         WHERE emp_no = ? OR id_number = ?
         LIMIT 1`,
        empNo, empNo,
      );
      return rows[0]?.fullName ?? null;
    } catch {
      return null;
    }
  }
}


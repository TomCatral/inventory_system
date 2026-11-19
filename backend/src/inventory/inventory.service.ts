/*
 * NOTE:
 * ONLY the Inventory System (this service) should perform any database
 * write operations such as inserting, updating, or deleting records.
 * Other modules or services must NOT directly modify tables – they should
 * delegate to this service via its public methods.
 * This comment serves as a reminder to keep the data integrity logic
 * centralized here.
 */

import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
/*
 * NOTE:
 * ONLY the Inventory System (this service) should perform any database
 * write operations such as inserting, updating, or deleting records.
 * Other modules or services must NOT directly modify tables – they should
 * delegate to this service via its public methods.
 * This comment serves as a reminder to keep the data integrity logic
 * centralized here.
 */

import {
  BorrowedSupplyStatus,
  InventoryItemStatus,
  InventoryMovementType,
  ItemCategory,
  Prisma,
  SupplyAssignmentStatus,
  SupplyTransferType,
} from '@prisma/client';
/*
 * NOTE:
 * ONLY the Inventory System (this service) should perform any database
 * write operations such as inserting, updating, or deleting records.
 * Other modules or services must NOT directly modify tables – they should
 * delegate to this service via its public methods.
 * This comment serves as a reminder to keep the data integrity logic
 * centralized here.
 */

import { randomInt } from 'node:crypto';
/*
 * NOTE:
 * ONLY the Inventory System (this service) should perform any database
 * write operations such as inserting, updating, or deleting records.
 * Other modules or services must NOT directly modify tables – they should
 * delegate to this service via its public methods.
 * This comment serves as a reminder to keep the data integrity logic
 * centralized here.
 */

import { PrismaService } from '../prisma/prisma.service';
/*
 * NOTE:
 * ONLY the Inventory System (this service) should perform any database
 * write operations such as inserting, updating, or deleting records.
 * Other modules or services must NOT directly modify tables – they should
 * delegate to this service via its public methods.
 * This comment serves as a reminder to keep the data integrity logic
 * centralized here.
 */

import { ItemSetupDto } from './dto/item-setup.dto';
/*
 * NOTE:
 * ONLY the Inventory System (this service) should perform any database
 * write operations such as inserting, updating, or deleting records.
 * Other modules or services must NOT directly modify tables – they should
 * delegate to this service via its public methods.
 * This comment serves as a reminder to keep the data integrity logic
 * centralized here.
 */

import { CreateStockMovementDto } from './dto/create-stock-movement.dto';
/*
 * NOTE:
 * ONLY the Inventory System (this service) should perform any database
 * write operations such as inserting, updating, or deleting records.
 * Other modules or services must NOT directly modify tables – they should
 * delegate to this service via its public methods.
 * This comment serves as a reminder to keep the data integrity logic
 * centralized here.
 */

import { CreateStockReceiptDto } from './dto/create-stock-receipt.dto';
/*
 * NOTE:
 * ONLY the Inventory System (this service) should perform any database
 * write operations such as inserting, updating, or deleting records.
 * Other modules or services must NOT directly modify tables – they should
 * delegate to this service via its public methods.
 * This comment serves as a reminder to keep the data integrity logic
 * centralized here.
 */

import { CreateGoodsReceiptDto } from './dto/create-goods-receipt.dto';
import { UpdateStockInDto } from './dto/update-stock-in.dto';
/*
 * NOTE:
 * ONLY the Inventory System (this service) should perform any database
 * write operations such as inserting, updating, or deleting records.
 * Other modules or services must NOT directly modify tables – they should
 * delegate to this service via its public methods.
 * This comment serves as a reminder to keep the data integrity logic
 * centralized here.
 */

import { CreateStockReturnDto } from './dto/create-stock-return.dto';
/*
 * NOTE:
 * ONLY the Inventory System (this service) should perform any database
 * write operations such as inserting, updating, or deleting records.
 * Other modules or services must NOT directly modify tables – they should
 * delegate to this service via its public methods.
 * This comment serves as a reminder to keep the data integrity logic
 * centralized here.
 */

import { SupplyQuantityDto, TransferSupplyDto } from './dto/supply-assignment.dto';
import { CreateBorrowedSupplyDto } from './dto/create-borrowed-supply.dto';
import { ReturnBorrowedSupplyDto } from './dto/return-borrowed-supply.dto';

const MAX_STOCK_NUMBER_ATTEMPTS = 5;
const DECIMAL_ZERO = new Prisma.Decimal(0);

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async listItems(filters: {
    category?: string;
    status?: string;
    search?: string;
  }) {
    const category = filters.category
      ? this.parseCategory(filters.category)
      : undefined;
    const status = filters.status
      ? this.parseStatus(filters.status)
      : undefined;
    const search = filters.search?.trim();

    return this.prisma.inventoryItem.findMany({
      where: {
        ...(category ? { category } : {}),
        ...(status ? { status } : {}),
        ...(search
          ? {
              OR: [
                { itemCode: { contains: search } },
                { itemName: { contains: search } },
                { brand: { contains: search } },
              ],
            }
          : {}),
      },
      include: { balance: true },
      orderBy: { itemName: 'asc' },
      take: 500,
    });
  }

  async getItem(id: number) {
    const item = await this.prisma.inventoryItem.findUnique({
      where: { id },
      include: { balance: true },
    });
    if (!item) {
      throw new NotFoundException('Inventory item not found.');
    }
    return item;
  }

  private async resolveEmployeeName(employeeNumber: string): Promise<string | null> {
    const empNo = employeeNumber?.trim();
    if (!empNo) return null;
    try {
      const rows = await this.prisma.$queryRawUnsafe<Array<{ fullName: string }>>(
        `
        SELECT TRIM(CONCAT(
          COALESCE(e.First_name, ''),
          IF(COALESCE(e.Mid_name, '') != '', CONCAT(' ', SUBSTRING(e.Mid_name, 1, 1), '.'), ''),
          IF(COALESCE(e.Last_name, '') != '', CONCAT(' ', e.Last_name), ''),
          IF(COALESCE(e.Extend_Name, '') != '', CONCAT(' ', e.Extend_Name), '')
        )) as fullName
        FROM pgc_employee.Employee e
        WHERE e.emp_no COLLATE utf8mb4_unicode_ci = ?
           OR TRIM(LEADING '0' FROM e.emp_no) COLLATE utf8mb4_unicode_ci = TRIM(LEADING '0' FROM ?)
           OR e.id_number COLLATE utf8mb4_unicode_ci = ?
        LIMIT 1
        `,
        empNo,
        empNo,
        empNo,
      );
      return rows[0]?.fullName || null;
    } catch {
      return null;
    }
  }

  private async resolveEmployeeProfile(employeeNumber: string): Promise<{
    employeeNumber: string;
    employeeName: string;
    departmentName: string | null;
  } | null> {
    const empNo = employeeNumber.trim();
    if (!empNo) return null;
    try {
      const rows = await this.prisma.$queryRawUnsafe<Array<{
        employeeNumber: string;
        employeeName: string;
        departmentName: string | null;
      }>>(
        `SELECT e.emp_no as employeeNumber,
                TRIM(CONCAT(COALESCE(e.First_name, ''),
                  IF(COALESCE(e.Mid_name, '') != '', CONCAT(' ', SUBSTRING(e.Mid_name, 1, 1), '.'), ''),
                  IF(COALESCE(e.Last_name, '') != '', CONCAT(' ', e.Last_name), ''),
                  IF(COALESCE(e.Extend_Name, '') != '', CONCAT(' ', e.Extend_Name), ''))) as employeeName,
                d.DeptDesc as departmentName
         FROM pgc_employee.Employee e
         LEFT JOIN pgc_employee.Department d ON e.Department COLLATE utf8mb4_unicode_ci = d.DeptCode COLLATE utf8mb4_unicode_ci
         WHERE e.emp_no COLLATE utf8mb4_unicode_ci = ?
            OR TRIM(LEADING '0' FROM e.emp_no) COLLATE utf8mb4_unicode_ci = TRIM(LEADING '0' FROM ?)
            OR e.id_number COLLATE utf8mb4_unicode_ci = ?
         LIMIT 1`,
        empNo,
        empNo,
        empNo,
      );
      return rows[0] ?? null;
    } catch {
      return null;
    }
  }

  private async resolveEmployeeNumberKeys(
    employeeNumber: string,
  ): Promise<string[]> {
    const raw = employeeNumber?.trim() ?? '';
    if (!raw) return [];
    const keys = new Set<string>([raw]);
    const withoutLeadingZeros = raw.replace(/^0+/, '');
    if (withoutLeadingZeros) keys.add(withoutLeadingZeros);
    const profile = await this.resolveEmployeeProfile(raw);
    if (profile?.employeeNumber) keys.add(profile.employeeNumber);
    return [...keys];
  }

  async listIssuanceRecipients(search = '', allDepartments = false) {
    const pattern = `%${search.trim()}%`;
    const departmentFilter = allDepartments ? '1 = 1' : "e.Department = '009'";
    try {
      return await this.prisma.$queryRawUnsafe<Array<{
        employeeNumber: string;
        employeeName: string;
        departmentName: string | null;
      }>>(
        `SELECT e.emp_no as employeeNumber,
                TRIM(CONCAT(COALESCE(e.First_name, ''),
                  IF(COALESCE(e.Mid_name, '') != '', CONCAT(' ', SUBSTRING(e.Mid_name, 1, 1), '.'), ''),
                  IF(COALESCE(e.Last_name, '') != '', CONCAT(' ', e.Last_name), ''),
                  IF(COALESCE(e.Extend_Name, '') != '', CONCAT(' ', e.Extend_Name), ''))) as employeeName,
                d.DeptDesc as departmentName
         FROM pgc_employee.Employee e
         LEFT JOIN pgc_employee.Department d ON e.Department COLLATE utf8mb4_unicode_ci = d.DeptCode COLLATE utf8mb4_unicode_ci
         WHERE ${departmentFilter}
           AND (? = '%%' OR e.emp_no LIKE ? OR e.First_name LIKE ? OR e.Last_name LIKE ? OR e.id_number LIKE ?)
         ORDER BY e.Last_name ASC, e.First_name ASC
         LIMIT 50`,
        pattern,
        pattern,
        pattern,
        pattern,
        pattern,
      );
    } catch {
      return [];
    }
  }

  async createItem(dto: ItemSetupDto) {
    this.validateConversion(dto.purchaseUom, dto.distributionUom, dto.conversionFactor);
    const trimmedName = dto.itemName.trim();
    const trimmedBrand = dto.brand?.trim() || null;
    const trimmedCode = dto.itemCode?.trim() || null;
    return this.prisma.$transaction(async (transaction) => {
      if (trimmedCode) {
        const codeDuplicate = await transaction.inventoryItem.findFirst({
          where: { itemCode: trimmedCode },
        });
        if (codeDuplicate) {
          throw new ConflictException(`Item code "${trimmedCode}" is already in use.`);
        }
      }
      const duplicate = await transaction.inventoryItem.findFirst?.({
        where: {
          itemName: trimmedName,
          ...(trimmedBrand ? { brand: trimmedBrand } : { brand: null }),
        },
      });
      if (duplicate) {
        throw new ConflictException(
          `An item named "${trimmedName}" ${trimmedBrand ? `(Brand: ${trimmedBrand})` : ''} already exists in the catalog.`,
        );
      }
      const item = await transaction.inventoryItem.create({
        data: {
          itemCode: trimmedCode,
          itemName: trimmedName,
          description: dto.description?.trim() || null,
          brand: trimmedBrand,
          category: dto.category,
          purchaseUom: dto.purchaseUom.trim(),
          distributionUom: dto.distributionUom.trim(),
          conversionFactor: new Prisma.Decimal(dto.conversionFactor),
          reorderLevel: new Prisma.Decimal(dto.reorderLevel ?? 0),
          status: dto.status ?? InventoryItemStatus.ACTIVE,
        },
      });
      const codedItem = trimmedCode
        ? item
        : await transaction.inventoryItem.update({
            where: { id: item.id },
            data: { itemCode: this.itemCode(item.id) },
          });
      await transaction.inventoryBalance.create({
        data: { itemId: item.id, quantity: DECIMAL_ZERO },
      });
      return { ...codedItem, balance: { quantity: DECIMAL_ZERO } };
    });
  }

  async updateItem(id: number, dto: ItemSetupDto) {
    this.validateConversion(dto.purchaseUom, dto.distributionUom, dto.conversionFactor);
    const existing = await this.prisma.inventoryItem.findUnique({
      where: { id },
      include: { balance: true, movements: { take: 1, select: { id: true } } },
    });
    if (!existing) {
      throw new NotFoundException('Inventory item not found.');
    }
    const trimmedName = dto.itemName.trim();
    const trimmedBrand = dto.brand?.trim() || null;
    const trimmedCode = dto.itemCode?.trim() || null;
    if (trimmedCode && trimmedCode !== existing.itemCode) {
      const codeDuplicate = await this.prisma.inventoryItem.findFirst({
        where: { id: { not: id }, itemCode: trimmedCode },
      });
      if (codeDuplicate) {
        throw new ConflictException(`Item code "${trimmedCode}" is already in use.`);
      }
    }
    const duplicate = await this.prisma.inventoryItem.findFirst({
      where: {
        id: { not: id },
        itemName: trimmedName,
        ...(trimmedBrand ? { brand: trimmedBrand } : { brand: null }),
      },
    });
    if (duplicate) {
      throw new ConflictException(
        `An item named "${trimmedName}" ${trimmedBrand ? `(Brand: ${trimmedBrand})` : ''} already exists in the catalog.`,
      );
    }
    if (
      existing.movements.length > 0 &&
      (existing.distributionUom !== dto.distributionUom.trim() ||
        !existing.conversionFactor.equals(dto.conversionFactor))
    ) {
      throw new ConflictException(
        'Distribution unit and conversion factor cannot change after inventory movements exist.',
      );
    }

    return this.prisma.inventoryItem.update({
      where: { id },
      data: {
        ...(trimmedCode ? { itemCode: trimmedCode } : {}),
        itemName: trimmedName,
        description: dto.description?.trim() || null,
        ...(dto.brand === undefined
          ? {}
          : { brand: trimmedBrand }),
        category: dto.category,
        purchaseUom: dto.purchaseUom.trim(),
        distributionUom: dto.distributionUom.trim(),
        conversionFactor: new Prisma.Decimal(dto.conversionFactor),
        reorderLevel: new Prisma.Decimal(dto.reorderLevel ?? 0),
        status: dto.status ?? existing.status,
      },
      include: { balance: true },
    });
  }

  async receive(dto: CreateStockReceiptDto, employeeNumber: string) {
    for (let attempt = 0; attempt < MAX_STOCK_NUMBER_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (transaction) => {
          const item = await transaction.inventoryItem.findUnique({
            where: { id: dto.itemId },
          });
          if (!item) {
            throw new NotFoundException('Inventory item not found.');
          }
          if (item.status !== InventoryItemStatus.ACTIVE) {
            throw new ConflictException('Inactive items cannot receive stock.');
          }

          const enteredQuantity = new Prisma.Decimal(dto.quantity);
          const baseQuantity = enteredQuantity.mul(item.conversionFactor).toDecimalPlaces(6);
          if (baseQuantity.lessThanOrEqualTo(0)) {
            throw new BadRequestException(
              'Quantity is below the supported inventory precision.',
            );
          }
          if (baseQuantity.greaterThan('999999999999.999999')) {
            throw new BadRequestException(
              'Quantity exceeds the supported inventory precision.',
            );
          }
          const year = new Date().getFullYear();
          await transaction.stockInSequence.upsert({
            where: { year },
            create: { year, sequence: 1 },
            update: { sequence: { increment: 1 } },
          });
          const rows = await transaction.$queryRaw<
            Array<{ sequence: number }>
          >`SELECT \`sequence\` FROM \`StockInSequence\` WHERE \`year\` = ${year} FOR UPDATE`;
          const sequence = rows[0]?.sequence;
          if (sequence === undefined) {
            throw new InternalServerErrorException(
              'Unable to generate a stock number.',
            );
          }

          const barcode = randomInt(1_000_000_000, 10_000_000_000).toString();
          const stockEntry = await transaction.stockItem.create({
            data: {
              stockNumber: `${year}-${String(sequence).padStart(3, '0')}-${barcode}`,
              itemName: item.itemName,
              unitOfMeasurement: item.purchaseUom,
              quantity: new Prisma.Decimal(dto.quantity),
              baseQuantity,
              remainingQuantity: baseQuantity,
              expirationDate: dto.expirationDate
                ? new Date(dto.expirationDate)
                : null,
              supplier: dto.supplier?.trim() || null,
              deliveredBy: dto.deliveredBy?.trim() || null,
              delivererCode: dto.delivererCode?.trim() || null,
              deliveryReference: dto.deliveryReference?.trim() || null,
              deliveryDate: dto.deliveryDate ? new Date(dto.deliveryDate) : new Date(),
              remarks: dto.remarks?.trim() || null,
              itemId: item.id,
            },
          });

          const updatedBalance = await transaction.inventoryBalance.upsert({
            where: { itemId: item.id },
            create: { itemId: item.id, quantity: baseQuantity },
            update: { quantity: { increment: baseQuantity } },
          });

          const employeeName = await this.resolveEmployeeName(employeeNumber);
          const receiptNote = [
            dto.supplier?.trim() ? `Supplier: ${dto.supplier.trim()}` : '',
            dto.deliveredBy?.trim() ? `Delivered by: ${dto.deliveredBy.trim()}` : '',
            dto.delivererCode?.trim() ? `Deliverer code: ${dto.delivererCode.trim()}` : '',
            dto.deliveryReference?.trim() ? `Delivery ref: ${dto.deliveryReference.trim()}` : '',
            dto.remarks?.trim() ? `Remarks: ${dto.remarks.trim()}` : '',
          ].filter(Boolean).join(' | ') || null;
          await transaction.inventoryMovement.create({
            data: {
              itemId: item.id,
              employeeNumber,
              employeeName,
              movementType: 'STOCK_IN',
              quantityEntered: enteredQuantity,
              enteredUom: item.purchaseUom,
              quantityBase: baseQuantity,
              balanceAfter: updatedBalance.quantity,
              note: receiptNote,
            },
          });

          return {
            stockEntry,
            receivedQuantity: enteredQuantity,
            receivedUom: item.purchaseUom,
            baseQuantity,
            baseUom: item.distributionUom,
            balance: updatedBalance.quantity,
          };
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002' &&
          attempt < MAX_STOCK_NUMBER_ATTEMPTS - 1
        ) {
          continue;
        }
        throw error;
      }
    }
    throw new InternalServerErrorException(
      'Unable to generate a unique stock number. Please try again.',
    );
  }

  async createGoodsReceipt(dto: CreateGoodsReceiptDto, employeeNumber: string) {
    const supplier = dto.supplier.trim();
    const deliveredBy = dto.deliveredBy.trim();
    if (!supplier || !deliveredBy) {
      throw new BadRequestException('Supplier/source and delivered by are required.');
    }
    const uniqueItemIds = new Set(dto.items.map((line) => line.itemId));
    if (uniqueItemIds.size !== dto.items.length) {
      throw new BadRequestException('Each item may only appear once in a goods receipt.');
    }
    const employeeName = await this.resolveEmployeeName(employeeNumber);

    return this.prisma.$transaction(async (transaction) => {
      const year = new Date(dto.deliveryDate).getFullYear();
      await transaction.goodsReceiptSequence.upsert({
        where: { year },
        create: { year, sequence: 1 },
        update: { sequence: { increment: 1 } },
      });
      const sequenceRows = await transaction.$queryRaw<Array<{ sequence: number }>>`SELECT \`sequence\` FROM \`GoodsReceiptSequence\` WHERE \`year\` = ${year} FOR UPDATE`;
      const sequence = sequenceRows[0]?.sequence;
      if (sequence === undefined) throw new InternalServerErrorException('Unable to generate a receipt number.');
      const receiptNumber = `GR-${year}-${String(sequence).padStart(6, '0')}`;
      const receipt = await transaction.goodsReceipt.create({
        data: {
          receiptNumber,
          supplier,
          deliveredBy,
          delivererCode: dto.delivererCode?.trim() || null,
          deliveryReference: dto.deliveryReference?.trim() || null,
          deliveryDate: new Date(dto.deliveryDate),
          stockClassification: dto.stockClassification,
          remarks: dto.remarks?.trim() || null,
          receivedByEmpNo: employeeNumber,
          receivedByName: employeeName,
        },
      });

      const postedItems = [];
      for (const [index, line] of dto.items.entries()) {
        const item = await transaction.inventoryItem.findUnique({ where: { id: line.itemId } });
        if (!item) throw new NotFoundException(`Inventory item ${line.itemId} not found.`);
        if (item.status !== InventoryItemStatus.ACTIVE) {
          throw new ConflictException(`${item.itemName} is inactive and cannot receive stock.`);
        }
        const enteredQuantity = new Prisma.Decimal(line.quantity);
        const expectedQuantity = new Prisma.Decimal(line.expectedQuantity ?? line.quantity);
        if (expectedQuantity.lessThan(enteredQuantity)) {
          throw new BadRequestException(`Expected quantity for ${item.itemName} cannot be less than received quantity.`);
        }
        const shortageQuantity = expectedQuantity.minus(enteredQuantity);
        const baseQuantity = enteredQuantity.mul(item.conversionFactor).toDecimalPlaces(6);
        if (baseQuantity.lessThanOrEqualTo(0)) {
          throw new BadRequestException(`Received quantity for ${item.itemName} is below the supported inventory precision.`);
        }
        const stockEntry = await transaction.stockItem.create({
          data: {
            stockNumber: `${receiptNumber}-${String(index + 1).padStart(2, '0')}`,
            itemName: item.itemName,
            unitOfMeasurement: item.purchaseUom,
            quantity: enteredQuantity,
            baseQuantity,
            remainingQuantity: baseQuantity,
            expectedQuantity,
            shortageQuantity,
            expirationDate: line.expirationDate ? new Date(line.expirationDate) : null,
            supplier,
            deliveredBy,
            delivererCode: dto.delivererCode?.trim() || null,
            deliveryReference: dto.deliveryReference?.trim() || null,
            deliveryDate: new Date(dto.deliveryDate),
            stockClassification: dto.stockClassification,
            remarks: dto.remarks?.trim() || null,
            goodsReceiptId: receipt.id,
            itemId: item.id,
          },
        });
        const balance = await transaction.inventoryBalance.upsert({
          where: { itemId: item.id },
          create: { itemId: item.id, quantity: baseQuantity },
          update: { quantity: { increment: baseQuantity } },
        });
        await transaction.inventoryMovement.create({
          data: {
            itemId: item.id,
            employeeNumber,
            employeeName,
            movementType: InventoryMovementType.STOCK_IN,
            quantityEntered: enteredQuantity,
            enteredUom: item.purchaseUom,
            quantityBase: baseQuantity,
            balanceAfter: balance.quantity,
            note: `Goods receipt: ${receiptNumber} | Supplier: ${supplier} | Delivered by: ${deliveredBy} | Expected: ${expectedQuantity.toString()} ${item.purchaseUom} | Received: ${enteredQuantity.toString()} ${item.purchaseUom} | Converted: ${baseQuantity.toString()} ${item.distributionUom} | Short: ${shortageQuantity.toString()} ${item.purchaseUom}${dto.remarks?.trim() ? ` | Remarks: ${dto.remarks.trim()}` : ''}`,
          },
        });
        postedItems.push({ stockEntry, itemName: item.itemName, expectedQuantity, receivedQuantity: enteredQuantity, shortageQuantity, baseQuantity, balance: balance.quantity });
      }
      return { ...receipt, items: postedItems };
    });
  }

  listGoodsReceipts() {
    return this.prisma.goodsReceipt.findMany({
      include: { items: { orderBy: { id: 'asc' } } },
      orderBy: [{ deliveryDate: 'desc' }, { id: 'desc' }],
      take: 50,
    });
  }

  async updateStockInLine(
    stockItemId: number,
    dto: UpdateStockInDto,
    employeeNumber: string,
  ) {
    const employeeName = await this.resolveEmployeeName(employeeNumber);
    return this.prisma.$transaction(async (transaction) => {
      const stock = await transaction.stockItem.findUnique({
        where: { id: stockItemId },
        include: { item: true, goodsReceipt: true },
      });
      if (!stock || !stock.item) {
        throw new NotFoundException('Stock-in entry not found.');
      }
      const item = stock.item;
      if (item.status !== InventoryItemStatus.ACTIVE) {
        throw new ConflictException(`${item.itemName} is inactive and cannot be updated.`);
      }

      const oldEntered = stock.quantity;
      const oldBase = stock.baseQuantity ?? oldEntered.mul(item.conversionFactor).toDecimalPlaces(6);
      const oldRemaining = stock.remainingQuantity ?? oldBase;
      const consumed = oldBase.minus(oldRemaining);

      const newEntered = dto.quantity !== undefined
        ? new Prisma.Decimal(dto.quantity)
        : oldEntered;
      const newExpected = dto.expectedQuantity !== undefined
        ? new Prisma.Decimal(dto.expectedQuantity)
        : stock.expectedQuantity ?? newEntered;
      if (newExpected.lessThan(newEntered)) {
        throw new BadRequestException(
          `Expected quantity for ${item.itemName} cannot be less than the received quantity.`,
        );
      }
      let newBase = oldBase;
      let newRemaining = oldRemaining;
      if (dto.quantity !== undefined) {
        newBase = newEntered.mul(item.conversionFactor).toDecimalPlaces(6);
        if (newBase.lessThanOrEqualTo(0)) {
          throw new BadRequestException(
            `Received quantity for ${item.itemName} is below the supported inventory precision.`,
          );
        }
        if (newBase.lessThan(consumed)) {
          throw new ConflictException(
            `Cannot reduce ${item.itemName} below the ${consumed.toString()} ${item.distributionUom} already issued from this delivery.`,
          );
        }
        newRemaining = newBase.minus(consumed);
      }
      const shortage = newExpected.minus(newEntered);
      const difference = newBase.minus(oldBase);

      await transaction.stockItem.update({
        where: { id: stock.id },
        data: {
          quantity: newEntered,
          baseQuantity: newBase,
          remainingQuantity: newRemaining,
          expectedQuantity: newExpected,
          shortageQuantity: shortage,
          ...(dto.expirationDate !== undefined
            ? { expirationDate: dto.expirationDate ? new Date(dto.expirationDate) : null }
            : {}),
        },
      });

      if (!difference.isZero()) {
        const current = await transaction.inventoryBalance.findUnique({
          where: { itemId: item.id },
        });
        if (!current) {
          throw new NotFoundException('Inventory balance not found.');
        }
        const nextQuantity = current.quantity.plus(difference);
        if (nextQuantity.lessThan(0)) {
          throw new ConflictException('The adjustment would make the stock balance negative.');
        }
        const balance = await transaction.inventoryBalance.update({
          where: { itemId: item.id },
          data: { quantity: nextQuantity },
        });
        const absoluteDifference = difference.abs();
        await transaction.inventoryMovement.create({
          data: {
            itemId: item.id,
            employeeNumber,
            employeeName,
            movementType: difference.greaterThan(0)
              ? InventoryMovementType.STOCK_IN
              : InventoryMovementType.STOCK_OUT,
            quantityEntered: absoluteDifference,
            enteredUom: item.distributionUom,
            quantityBase: absoluteDifference,
            balanceAfter: balance.quantity,
            note: `Stock-in ${stock.stockNumber}${stock.goodsReceipt ? ` (${stock.goodsReceipt.receiptNumber})` : ''} adjusted from ${oldEntered.toString()} to ${newEntered.toString()} ${item.purchaseUom}. Expected ${newExpected.toString()} ${item.purchaseUom}, supplier balance ${shortage.toString()} ${item.purchaseUom}.`,
          },
        });
      }

      return {
        ...stock,
        quantity: newEntered,
        baseQuantity: newBase,
        remainingQuantity: newRemaining,
        expectedQuantity: newExpected,
        shortageQuantity: shortage,
      };
    });
  }

  async deleteStockInLine(stockItemId: number, employeeNumber: string) {
    const employeeName = await this.resolveEmployeeName(employeeNumber);
    return this.prisma.$transaction(async (transaction) => {
      const stock = await transaction.stockItem.findUnique({
        where: { id: stockItemId },
        include: { item: true },
      });
      if (!stock || !stock.item) throw new NotFoundException('Stock-in entry not found.');

      const baseQuantity = stock.baseQuantity ?? stock.quantity.mul(stock.item.conversionFactor).toDecimalPlaces(6);
      const remainingQuantity = stock.remainingQuantity ?? baseQuantity;
      if (baseQuantity.minus(remainingQuantity).greaterThan(0)) {
        throw new ConflictException('This delivery entry cannot be deleted because stock has already been issued from it.');
      }

      const current = await transaction.inventoryBalance.findUnique({ where: { itemId: stock.item.id } });
      if (!current || current.quantity.lessThan(baseQuantity)) {
        throw new ConflictException('The stock balance is no longer sufficient to delete this delivery entry.');
      }
      const balance = await transaction.inventoryBalance.update({
        where: { itemId: stock.item.id },
        data: { quantity: { decrement: baseQuantity } },
      });
      await transaction.inventoryMovement.create({
        data: {
          itemId: stock.item.id,
          employeeNumber,
          employeeName,
          movementType: InventoryMovementType.STOCK_OUT,
          quantityEntered: baseQuantity,
          enteredUom: stock.item.distributionUom,
          quantityBase: baseQuantity,
          balanceAfter: balance.quantity,
          note: `Deleted stock-in entry ${stock.stockNumber} from ${stock.supplier || 'unspecified supplier'}.`,
        },
      });
      await transaction.stockItem.delete({ where: { id: stock.id } });
      return { deleted: true, id: stock.id };
    });
  }

  async listItemBatches(itemId: number) {
    await this.initializeItemBatchBalances(itemId);
    return this.prisma.stockItem.findMany({
      where: { itemId, remainingQuantity: { gt: 0 } },
      select: {
        id: true,
        stockNumber: true,
        supplier: true,
        deliveredBy: true,
        deliveryReference: true,
        deliveryDate: true,
        stockClassification: true,
        expirationDate: true,
        baseQuantity: true,
        remainingQuantity: true,
        quantity: true,
        expectedQuantity: true,
        shortageQuantity: true,
        unitOfMeasurement: true,
        remarks: true,
        createdAt: true,
      },
      orderBy: [{ stockClassification: 'desc' }, { deliveryDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  private async initializeItemBatchBalances(itemId: number): Promise<void> {
    const legacyBatch = await this.prisma.stockItem.findFirst({
      where: { itemId, remainingQuantity: null },
      select: { id: true },
    });
    if (!legacyBatch) return;
    await this.prisma.$transaction(async (transaction) => {
      const item = await transaction.inventoryItem.findUnique({
        where: { id: itemId },
        include: { balance: true },
      });
      if (!item) throw new NotFoundException('Inventory item not found.');
      const batches = await transaction.stockItem.findMany({
        where: { itemId },
        orderBy: [{ deliveryDate: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      });
      if (!batches.some((batch) => batch.remainingQuantity === null)) return;
      const allocated = batches.reduce(
        (total, batch) => total.plus(batch.remainingQuantity ?? 0),
        new Prisma.Decimal(0),
      );
      let unallocated = Prisma.Decimal.max(new Prisma.Decimal(0), (item.balance?.quantity ?? new Prisma.Decimal(0)).minus(allocated));
      for (const batch of batches) {
        if (batch.remainingQuantity !== null) continue;
        const enteredInPurchaseUom = batch.unitOfMeasurement.trim().toLowerCase() === item.purchaseUom.trim().toLowerCase();
        const estimatedBase = enteredInPurchaseUom
          ? batch.quantity.mul(item.conversionFactor).toDecimalPlaces(6)
          : batch.quantity.toDecimalPlaces(6);
        const remaining = Prisma.Decimal.min(estimatedBase, unallocated);
        await transaction.stockItem.update({
          where: { id: batch.id },
          data: { baseQuantity: estimatedBase, remainingQuantity: remaining },
        });
        unallocated = unallocated.minus(remaining);
      }
    });
  }

  async issue(dto: CreateStockMovementDto, employeeNumber: string) {
    if (dto.stockItemId) await this.initializeItemBatchBalances(dto.itemId);
    const recipient = dto.recipientEmpNo
      ? await this.resolveEmployeeProfile(dto.recipientEmpNo)
      : null;
    if (dto.recipientEmpNo && !recipient) {
      throw new NotFoundException('The selected SSO recipient could not be found.');
    }
    return this.prisma.$transaction(async (transaction) => {
      const item = await transaction.inventoryItem.findUnique({
        where: { id: dto.itemId },
      });
      if (!item) {
        throw new NotFoundException('Inventory item not found.');
      }

      const enteredQuantity = new Prisma.Decimal(dto.quantity);
      const hasPurchaseConversion =
        item.purchaseUom.trim().toLowerCase() !== item.distributionUom.trim().toLowerCase() ||
        item.conversionFactor.toNumber() !== 1;
      if (dto.unit === 'PURCHASE' && !hasPurchaseConversion) {
        throw new BadRequestException(`This item has no separate ${item.purchaseUom} conversion.`);
      }
      const usesPurchaseUnit = dto.unit === 'PURCHASE';
      const conversionFactor = usesPurchaseUnit ? item.conversionFactor : new Prisma.Decimal(1);
      const quantity = enteredQuantity.mul(conversionFactor).toDecimalPlaces(6);
      const enteredUom = usesPurchaseUnit ? item.purchaseUom : item.distributionUom;
      let selectedBatch: { stockNumber: string; deliveryDate: Date | null; supplier: string | null } | null = null;
      if (dto.stockItemId) {
        selectedBatch = await transaction.stockItem.findFirst({
          where: { id: dto.stockItemId, itemId: item.id },
          select: { stockNumber: true, deliveryDate: true, supplier: true },
        });
        if (!selectedBatch) throw new NotFoundException('Selected delivery batch was not found for this item.');
        const changedBatch = await transaction.stockItem.updateMany({
          where: { id: dto.stockItemId, itemId: item.id, remainingQuantity: { gte: quantity } },
          data: { remainingQuantity: { decrement: quantity } },
        });
        if (changedBatch.count !== 1) throw new ConflictException('Issued quantity exceeds the selected delivery batch balance.');
      }
      const changed = await transaction.inventoryBalance.updateMany({
        where: { itemId: item.id, quantity: { gte: quantity } },
        data: { quantity: { decrement: quantity } },
      });
      if (changed.count !== 1) {
        throw new ConflictException('Issued quantity exceeds available stock.');
      }

      const balance = await transaction.inventoryBalance.findUniqueOrThrow({
        where: { itemId: item.id },
      });
      const note = [
        dto.referenceNumber?.trim() ? `Purpose: ${dto.referenceNumber.trim()}` : '',
        recipient ? `Issued to: ${recipient.employeeName} (${recipient.employeeNumber})` : '',
        !recipient && dto.recipientOffice?.trim() ? `Issued to: ${dto.recipientOffice.trim()}` : '',
        selectedBatch ? `Batch: ${selectedBatch.stockNumber} | Delivered: ${selectedBatch.deliveryDate?.toISOString().slice(0, 10) ?? 'No date'} | Supplier: ${selectedBatch.supplier ?? 'Not recorded'}` : '',
      ].filter(Boolean).join(' | ') || null;
      const employeeName = await this.resolveEmployeeName(employeeNumber);
      await transaction.inventoryMovement.create({
        data: {
          itemId: item.id,
          employeeNumber,
          employeeName,
          movementType: 'STOCK_OUT',
          quantityEntered: enteredQuantity,
          enteredUom,
          quantityBase: quantity,
          balanceAfter: balance.quantity,
          note,
        },
      });

      const assignment = recipient
        ? await transaction.supplyAssignment.create({
            data: {
              itemId: item.id,
              recipientEmpNo: recipient.employeeNumber,
              recipientName: recipient.employeeName,
              issuedByEmpNo: employeeNumber,
              quantity,
              remainingQuantity: quantity,
              enteredUom,
              enteredQuantity,
              conversionFactor,
              referenceNumber: dto.referenceNumber?.trim() || null,
            },
          })
        : null;
      if (assignment && recipient) {
        const formatQty = new Intl.NumberFormat('en-PH', { maximumFractionDigits: 6 });
        const issuedDisplay =
          !usesPurchaseUnit &&
          hasPurchaseConversion &&
          item.purchaseUom.trim().toLowerCase() !== item.distributionUom.trim().toLowerCase()
            ? `${formatQty.format(enteredQuantity.div(item.conversionFactor).toNumber())} ${item.purchaseUom} = ${formatQty.format(enteredQuantity.toNumber())} ${enteredUom}`
            : `${formatQty.format(enteredQuantity.toNumber())} ${enteredUom}`;
        await transaction.notification.create({
          data: {
            recipientEmpNo: recipient.employeeNumber,
            message: `${issuedDisplay} of ${item.itemName} was issued directly to you.`,
            refType: 'SUPPLY_ASSIGNMENT',
            refId: assignment.id,
          },
        });
      }

      return {
        itemId: item.id,
        itemName: item.itemName,
        issuedQuantity: enteredQuantity,
        issuedUom: enteredUom,
        baseQuantity: quantity,
        baseUom: item.distributionUom,
        balance: balance.quantity,
        balanceUom: item.distributionUom,
        assignment,
      };
    });
  }

  async listMySupplies(employeeNumber: string) {
    const recipientKeys = await this.resolveEmployeeNumberKeys(employeeNumber);
    if (!recipientKeys.length) return [];
    return this.prisma.supplyAssignment.findMany({
      where: { recipientEmpNo: { in: recipientKeys } },
      include: { item: true, transfers: { orderBy: { createdAt: 'desc' }, take: 5 } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }

  async listMyItemBatches(itemId: number, employeeNumber: string) {
    const recipientKeys = await this.resolveEmployeeNumberKeys(employeeNumber);
    if (!recipientKeys.length) return [];
    const assigned = await this.prisma.supplyAssignment.findFirst({
      where: { itemId, recipientEmpNo: { in: recipientKeys } },
      select: { id: true },
    });
    if (!assigned) throw new NotFoundException('Assigned supply not found.');
    return this.prisma.stockItem.findMany({
      where: { itemId, remainingQuantity: { gt: 0 } },
      select: {
        id: true,
        stockNumber: true,
        supplier: true,
        deliveredBy: true,
        deliveryReference: true,
        deliveryDate: true,
        stockClassification: true,
        expirationDate: true,
        baseQuantity: true,
        remainingQuantity: true,
        quantity: true,
        expectedQuantity: true,
        shortageQuantity: true,
        unitOfMeasurement: true,
        remarks: true,
        createdAt: true,
      },
      orderBy: [{ stockClassification: 'desc' }, { deliveryDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  async returnAssignedSupply(id: number, dto: SupplyQuantityDto, employeeNumber: string) {
    const quantity = new Prisma.Decimal(dto.quantity);
    const recipientKeys = await this.resolveEmployeeNumberKeys(employeeNumber);
    return this.prisma.$transaction(async (transaction) => {
      const changed = await transaction.supplyAssignment.updateMany({
        where: { id, recipientEmpNo: { in: recipientKeys }, status: SupplyAssignmentStatus.ACTIVE, remainingQuantity: { gte: quantity } },
        data: { remainingQuantity: { decrement: quantity } },
      });
      if (changed.count !== 1) throw new ConflictException('Return quantity exceeds your assigned supply balance.');
      const assignment = await transaction.supplyAssignment.findUniqueOrThrow({ where: { id }, include: { item: true } });
      if (assignment.remainingQuantity.equals(0)) {
        await transaction.supplyAssignment.update({ where: { id }, data: { status: SupplyAssignmentStatus.RETURNED } });
      }
      const balance = await transaction.inventoryBalance.upsert({
        where: { itemId: assignment.itemId },
        create: { itemId: assignment.itemId, quantity },
        update: { quantity: { increment: quantity } },
      });
      await transaction.inventoryMovement.create({
        data: {
          itemId: assignment.itemId,
          employeeNumber,
          employeeName: assignment.recipientName,
          movementType: InventoryMovementType.RETURN_IN,
          quantityEntered: quantity,
          enteredUom: assignment.item.distributionUom,
          quantityBase: quantity,
          balanceAfter: balance.quantity,
          note: `Returned assigned supply${dto.note?.trim() ? `: ${dto.note.trim()}` : ''}`,
        },
      });
      await transaction.supplyTransfer.create({
        data: { assignmentId: id, transferType: SupplyTransferType.RETURN_TO_ADMIN, fromEmpNo: employeeNumber, quantity, note: dto.note?.trim() || null },
      });
      await transaction.notification.create({
        data: {
          recipientEmpNo: assignment.issuedByEmpNo,
          message: `${assignment.recipientName} returned ${quantity.toString()} ${assignment.item.distributionUom} of ${assignment.item.itemName} to inventory.`,
          refType: 'SUPPLY_RETURN',
          refId: id,
        },
      });
      return assignment;
    });
  }

  async transferAssignedSupply(id: number, dto: TransferSupplyDto, employeeNumber: string) {
    const recipientKeys = await this.resolveEmployeeNumberKeys(employeeNumber);
    const recipient = await this.resolveEmployeeProfile(dto.recipientEmpNo);
    if (!recipient) throw new NotFoundException('The selected SSO recipient could not be found.');
    if (recipientKeys.includes(recipient.employeeNumber)) {
      throw new BadRequestException('Select another staff recipient.');
    }
    const quantity = new Prisma.Decimal(dto.quantity);
    return this.prisma.$transaction(async (transaction) => {
      const changed = await transaction.supplyAssignment.updateMany({
        where: { id, recipientEmpNo: { in: recipientKeys }, status: SupplyAssignmentStatus.ACTIVE, remainingQuantity: { gte: quantity } },
        data: { remainingQuantity: { decrement: quantity } },
      });
      if (changed.count !== 1) throw new ConflictException('Transfer quantity exceeds your assigned supply balance.');
      const source = await transaction.supplyAssignment.findUniqueOrThrow({ where: { id }, include: { item: true } });
      if (source.remainingQuantity.equals(0)) {
        await transaction.supplyAssignment.update({ where: { id }, data: { status: SupplyAssignmentStatus.TRANSFERRED } });
      }
      const target = await transaction.supplyAssignment.create({
        data: {
          itemId: source.itemId,
          recipientEmpNo: recipient.employeeNumber,
          recipientName: recipient.employeeName,
          issuedByEmpNo: source.issuedByEmpNo,
          quantity,
          remainingQuantity: quantity,
          referenceNumber: source.referenceNumber,
        },
      });
      await transaction.supplyTransfer.create({
        data: { assignmentId: id, transferType: SupplyTransferType.TRANSFER_TO_STAFF, fromEmpNo: source.recipientEmpNo, toEmpNo: recipient.employeeNumber, toName: recipient.employeeName, quantity, note: dto.note?.trim() || null },
      });
      await transaction.notification.create({
        data: {
          recipientEmpNo: recipient.employeeNumber,
          message: `${source.recipientName} transferred ${quantity.toString()} ${source.item.distributionUom} of ${source.item.itemName} to you.`,
          refType: 'SUPPLY_ASSIGNMENT',
          refId: target.id,
        },
      });
      return target;
    });
  }

  async listBorrowedSupplies(
    status?: string,
    filters: { from?: string; to?: string } = {},
  ) {
    const borrowedStatus = status
      ? this.parseBorrowedSupplyStatus(status)
      : undefined;
    const createdAt = this.dateRange(filters.from, filters.to);
    const supplies = await this.prisma.borrowedSupply.findMany({
      where: {
        ...(borrowedStatus ? { status: borrowedStatus } : {}),
        ...(createdAt ? { createdAt } : {}),
      },
      include: {
        item: {
          select: {
            itemName: true,
            itemCode: true,
            purchaseUom: true,
            distributionUom: true,
            conversionFactor: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 300,
    });
    return supplies.map((supply) => this.serializeBorrowedSupply(supply));
  }

  async getBorrowedSupplyPhoto(id: number) {
    const record = await this.prisma.borrowedSupply.findUnique({
      where: { id },
      select: { photoData: true },
    });
    if (!record) {
      throw new NotFoundException('Borrowed supply not found.');
    }
    return { photoData: record.photoData };
  }

  async createBorrowedSupply(dto: CreateBorrowedSupplyDto, employeeNumber: string) {
    const referenceNumber =
      dto.referenceNumber?.trim() || (await this.nextBorrowedSupplyReference());
    const issuedByName = await this.resolveEmployeeName(employeeNumber);
    const customItemName = dto.customItemName?.trim();
    const customUnit = dto.customUnit?.trim();
    if (!dto.itemId && !customItemName) {
      throw new BadRequestException('Select an item or type the item name.');
    }

    const item = dto.itemId
      ? await this.prisma.inventoryItem.findUnique({ where: { id: dto.itemId } })
      : null;
    if (dto.itemId && !item) {
      throw new NotFoundException('Inventory item not found.');
    }
    if (item && item.status !== InventoryItemStatus.ACTIVE) {
      throw new ConflictException('Inactive items cannot be borrowed.');
    }

    const enteredQuantity = new Prisma.Decimal(dto.quantity);
    const usesCustomUnit = !!customUnit;
    let conversionFactor = new Prisma.Decimal(1);
    let enteredUom: string;
    let baseUom: string;
    if (item) {
      const hasPurchaseConversion =
        item.purchaseUom.trim().toLowerCase() !== item.distributionUom.trim().toLowerCase() ||
        item.conversionFactor.toNumber() !== 1;
      if (dto.unit === 'PURCHASE' && !hasPurchaseConversion) {
        throw new BadRequestException(`This item has no separate ${item.purchaseUom} conversion.`);
      }
      if (usesCustomUnit) {
        enteredUom = customUnit!;
        baseUom = customUnit!;
      } else if (dto.unit === 'PURCHASE') {
        enteredUom = item.purchaseUom;
        baseUom = item.distributionUom;
        conversionFactor = item.conversionFactor;
      } else {
        enteredUom = item.distributionUom;
        baseUom = item.distributionUom;
      }
    } else {
      enteredUom = customUnit || 'unit';
      baseUom = enteredUom;
    }
    const baseQuantity = enteredQuantity.mul(conversionFactor).toDecimalPlaces(6);

    const borrowedSupply = await this.prisma.borrowedSupply.create({
      data: {
        referenceNumber,
        itemId: item?.id ?? null,
        customItemName: item ? null : customItemName,
        borrowerName: dto.borrowerName.trim(),
        borrowerEmpNo: dto.borrowerEmpNo?.trim() || null,
        department: dto.department?.trim() || null,
        contactNumber: dto.contactNumber?.trim() || null,
        quantity: baseQuantity,
        enteredQuantity,
        enteredUom,
        baseUom,
        conversionFactor,
        conditionAtBorrow: dto.conditionAtBorrow ?? 'GOOD',
        purpose: dto.purpose?.trim() || null,
        expectedReturnAt: dto.expectedReturnAt ? new Date(dto.expectedReturnAt) : null,
        borrowedAt: dto.borrowedAt ? new Date(dto.borrowedAt) : new Date(),
        status: BorrowedSupplyStatus.PENDING,
        photoData: dto.photoData || null,
        notes: dto.notes?.trim() || null,
        issuedByEmpNo: employeeNumber,
        issuedByName,
      },
      include: { item: true },
    });

    if (item) {
      try {
        await this.issue({
          itemId: item.id,
          quantity: dto.quantity,
          unit: usesCustomUnit ? 'BASE' : dto.unit,
          recipientEmpNo: dto.borrowerEmpNo,
          referenceNumber: `${referenceNumber}${dto.purpose?.trim() ? ` | ${dto.purpose.trim()}` : ''}`,
        }, employeeNumber);
      } catch (error) {
        await this.prisma.borrowedSupply.delete({ where: { id: borrowedSupply.id } });
        throw error;
      }
    }

    return this.serializeBorrowedSupply(borrowedSupply);
  }

  async returnBorrowedSupply(id: number, dto: ReturnBorrowedSupplyDto, employeeNumber: string) {
    const record = await this.findBorrowedSupply(id);
    if (!record) {
      throw new NotFoundException('Borrowed supply not found.');
    }
    if (record.status === BorrowedSupplyStatus.RETURNED) {
      throw new ConflictException('Borrowed supply has already been returned.');
    }
    const returnedByName = await this.resolveEmployeeName(employeeNumber);
    if (record.item && record.itemId !== null) {
      const enteredUom = record.enteredUom.trim().toLowerCase();
      const usesStandardUnit =
        enteredUom === record.item.purchaseUom.trim().toLowerCase() ||
        enteredUom === record.item.distributionUom.trim().toLowerCase();
      await this.applyBalanceMovement(
        record.itemId,
        usesStandardUnit ? record.enteredQuantity.toNumber() : record.quantity.toNumber(),
        employeeNumber,
        InventoryMovementType.RETURN_IN,
        `Borrowed supply ${record.referenceNumber} returned`,
        usesStandardUnit ? record.enteredUom : record.item.distributionUom,
      );
    }
    const updated = await this.prisma.borrowedSupply.update({
      where: { id },
      data: {
        status: BorrowedSupplyStatus.RETURNED,
        returnedAt: new Date(),
        returnedByEmpNo: employeeNumber,
        returnedByName,
        returnNotes: dto.returnNotes?.trim() || null,
      },
      include: { item: true },
    });
    return this.serializeBorrowedSupply(updated);
  }

  async returnStock(dto: CreateStockReturnDto, employeeNumber: string) {
    return this.applyBalanceMovement(
      dto.itemId,
      dto.quantity,
      employeeNumber,
      InventoryMovementType.DAMAGE_OUT,
      dto.reason,
      dto.unit,
      dto.stockItemId,
    );
  }

  async listMovements(filters: {
    type?: string;
    itemId?: string;
    from?: string;
    to?: string;
  } = {}) {
    const movementType = filters.type
      ? this.parseMovementType(filters.type)
      : undefined;
    const itemId = filters.itemId ? Number(filters.itemId) : undefined;
    if (itemId !== undefined && (!Number.isInteger(itemId) || itemId < 1)) {
      throw new BadRequestException('Invalid inventory item filter.');
    }
    const createdAt = this.dateRange(filters.from, filters.to);
    return this.prisma.inventoryMovement.findMany({
      where: {
        ...(movementType ? { movementType } : {}),
        ...(itemId ? { itemId } : {}),
        ...(createdAt ? { createdAt } : {}),
      },
      include: {
        item: { select: { itemCode: true, itemName: true, distributionUom: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
  }

  async getReport(
    report: string,
    filters: { from?: string; to?: string } = {},
  ) {
    const createdAt = this.dateRange(filters.from, filters.to);
    switch (report) {
      case 'summary': {
        const items = await this.listBalances();
        const batches = await this.prisma.stockItem.findMany({
          where: { itemId: { not: null } },
          include: { goodsReceipt: true },
          orderBy: [
            { itemId: 'asc' },
            { deliveryDate: 'desc' },
            { createdAt: 'desc' },
            { id: 'desc' },
          ],
        });
        const batchesByItem = new Map<number, typeof batches>();
        for (const batch of batches) {
          if (batch.itemId === null) continue;
          const list = batchesByItem.get(batch.itemId) ?? [];
          list.push(batch);
          batchesByItem.set(batch.itemId, list);
        }
        return items.map((item) => ({
          ...item,
          stockItems: batchesByItem.get(item.id) ?? [],
        }));
      }
      case 'stock-in':
        return this.prisma.stockItem.findMany({
          where: createdAt ? { createdAt } : undefined,
          orderBy: { createdAt: 'desc' },
          take: 500,
        });
      case 'stock-out':
        return this.listMovements({
          type: InventoryMovementType.STOCK_OUT,
          ...filters,
        });
      case 'low-stock': {
        const items = await this.listBalances();
        return items
          .map((item) => {
            const balanceQuantity = item.balance?.quantity ?? DECIMAL_ZERO;
            const conversionFactor = item.conversionFactor ?? new Prisma.Decimal(1);
            const reorderBaseQuantity = item.reorderLevel.times(conversionFactor);
            const shortageBaseQuantity = reorderBaseQuantity.minus(balanceQuantity);
            const normalizedShortage = shortageBaseQuantity.greaterThan(DECIMAL_ZERO)
              ? shortageBaseQuantity
              : DECIMAL_ZERO;
            return {
              ...item,
              reorderBaseQuantity,
              shortageBaseQuantity: normalizedShortage,
              shortagePurchaseQuantity: normalizedShortage.dividedBy(conversionFactor),
              isLowStock: balanceQuantity.lessThanOrEqualTo(reorderBaseQuantity),
            };
          })
          .filter((item) => item.isLowStock);
      }
      case 'damage-and-expired-items': {
        const createdAt = this.dateRange(filters.from, filters.to);
        const returns = await this.prisma.inventoryMovement.findMany({
          where: {
            movementType: {
              in: [
                InventoryMovementType.DAMAGE_OUT,
                InventoryMovementType.RETURN_IN,
              ],
            },
            ...(createdAt ? { createdAt } : {}),
          },
          include: {
            item: {
              select: {
                itemCode: true,
                itemName: true,
                brand: true,
                category: true,
                distributionUom: true,
                purchaseUom: true,
                conversionFactor: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 500,
        });
        return { returns };
      }
      case 'employee-supplies': {
        return this.prisma.supplyAssignment.findMany({
          where: createdAt ? { createdAt } : undefined,
          include: { item: true },
          orderBy: [
            { recipientName: 'asc' },
            { createdAt: 'desc' },
            { id: 'desc' },
          ],
          take: 1000,
        });
      }
      case 'borrowed-supplies':
        return this.listBorrowedSupplies(undefined, filters);
      case 'transaction-history': {
        const [movements, legacyReceipts, requests, supplyTransfers] = await Promise.all([
          this.listMovements(filters),
          this.prisma.stockItem.findMany({
            where: {
              itemId: null,
              ...(createdAt ? { createdAt } : {}),
            },
            orderBy: { createdAt: 'desc' },
            take: 500,
          }),
          this.prisma.stockRequest.findMany({
            where: createdAt ? { createdAt } : undefined,
            include: { item: true },
            orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
            take: 500,
          }),
          this.prisma.supplyTransfer.findMany({
            where: createdAt ? { createdAt } : undefined,
            include: { assignment: { include: { item: true } } },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: 500,
          }),
        ]);
        return { movements, legacyReceipts, requests, supplyTransfers };
      }
      default:
        throw new NotFoundException('Inventory report not found.');
    }
  }

  async listBalances() {
    return this.prisma.$transaction(async (transaction) => {
      const items = await transaction.inventoryItem.findMany({
        where: { status: InventoryItemStatus.ACTIVE },
        include: { balance: true },
        orderBy: { itemName: 'asc' },
        take: 1000,
      });

      const missingBalances = items.filter((item) => !item.balance);
      if (missingBalances.length === 0) {
        return items;
      }

      for (const item of missingBalances) {
        const previousBalance = (
          item as typeof item & {
            movements?: Array<{ balanceAfter: Prisma.Decimal }>;
          }
        ).movements?.[0]?.balanceAfter ?? DECIMAL_ZERO;
        await transaction.inventoryBalance.upsert({
          where: { itemId: item.id },
          create: {
            itemId: item.id,
            quantity: previousBalance,
          },
          update: {},
        });
      }

      return transaction.inventoryItem.findMany({
        where: { status: InventoryItemStatus.ACTIVE },
        include: { balance: true },
        orderBy: { itemName: 'asc' },
        take: 1000,
      });
    });
  }

  private async applyBalanceMovement(
    itemId: number,
    quantityValue: number,
    employeeNumber: string,
    movementType: InventoryMovementType,
    note: string,
    enteredUnit?: string,
    preferredStockItemId?: number,
  ) {
    const increasesStock = movementType === InventoryMovementType.RETURN_IN;
    const employeeName = await this.resolveEmployeeName(employeeNumber);
    if (!increasesStock) await this.initializeItemBatchBalances(itemId);

    return this.prisma.$transaction(async (transaction) => {
      const item = await transaction.inventoryItem.findUnique({
        where: { id: itemId },
      });
      if (!item) {
        throw new NotFoundException('Inventory item not found.');
      }
      if (item.status !== InventoryItemStatus.ACTIVE) {
        throw new ConflictException('Inactive items cannot be transacted.');
      }

      const purchaseUom = item.purchaseUom.trim();
      const distributionUom = item.distributionUom.trim();
      const requestedUnit = enteredUnit?.trim();
      const usesPurchaseUnit =
        !!requestedUnit &&
        requestedUnit.toLowerCase() === purchaseUom.toLowerCase() &&
        purchaseUom.toLowerCase() !== distributionUom.toLowerCase();
      if (
        requestedUnit &&
        !usesPurchaseUnit &&
        requestedUnit.toLowerCase() !== distributionUom.toLowerCase()
      ) {
        throw new BadRequestException(
          `Unit must be ${purchaseUom} or ${distributionUom}.`,
        );
      }

      const enteredQuantity = new Prisma.Decimal(quantityValue);
      const conversionFactor = usesPurchaseUnit
        ? item.conversionFactor
        : new Prisma.Decimal(1);
      const quantity = enteredQuantity
        .mul(conversionFactor)
        .toDecimalPlaces(6);
      const selectedReturnBatch = preferredStockItemId
        ? await transaction.stockItem.findFirst({
            where: { id: preferredStockItemId, itemId },
            select: { id: true, stockNumber: true, supplier: true, remainingQuantity: true },
          })
        : null;
      if (preferredStockItemId && !selectedReturnBatch) {
        throw new NotFoundException('Selected supplier delivery was not found for this item.');
      }
      if (quantity.lessThanOrEqualTo(0)) {
        throw new BadRequestException(
          'Quantity is below the supported inventory precision.',
        );
      }
      if (quantity.greaterThan('999999999999.999999')) {
        throw new BadRequestException(
          'Quantity exceeds the supported inventory precision.',
        );
      }
      const changed = await transaction.inventoryBalance.updateMany({
        where: {
          itemId,
          ...(increasesStock ? {} : { quantity: { gte: quantity } }),
        },
        data: {
          quantity: increasesStock
            ? { increment: quantity }
            : { decrement: quantity },
        },
      });
      if (changed.count !== 1) {
        throw new ConflictException('Quantity exceeds available stock.');
      }

      // Keep delivery-level Old/New Stock balances aligned with Stock on Hand.
      // Outgoing returns and decreases consume the oldest available batches first.
      if (!increasesStock) {
        if (selectedReturnBatch) {
          if ((selectedReturnBatch.remainingQuantity ?? new Prisma.Decimal(0)).lessThan(quantity)) {
            throw new ConflictException('Return quantity exceeds the selected supplier stock.');
          }
          const consumed = await transaction.stockItem.updateMany({
            where: {
              id: selectedReturnBatch.id,
              remainingQuantity: { gte: quantity },
            },
            data: { remainingQuantity: { decrement: quantity } },
          });
          if (consumed.count !== 1) {
            throw new ConflictException('Return quantity exceeds the selected supplier stock.');
          }
        } else {
          const batches = await transaction.stockItem.findMany({
          where: { itemId, remainingQuantity: { gt: 0 } },
          select: { id: true, remainingQuantity: true },
          orderBy: [
            { stockClassification: 'desc' },
            { deliveryDate: 'asc' },
            { createdAt: 'asc' },
            { id: 'asc' },
          ],
        });
          let quantityToDeduct = quantity;
          for (const batch of batches) {
            if (quantityToDeduct.lessThanOrEqualTo(0)) break;
            const available = batch.remainingQuantity ?? new Prisma.Decimal(0);
            const deduction = Prisma.Decimal.min(available, quantityToDeduct);
            if (deduction.greaterThan(0)) {
              await transaction.stockItem.update({
                where: { id: batch.id },
                data: { remainingQuantity: { decrement: deduction } },
              });
              quantityToDeduct = quantityToDeduct.minus(deduction);
            }
          }
        }
      }

      const balance = await transaction.inventoryBalance.findUniqueOrThrow({
        where: { itemId },
      });
      await transaction.inventoryMovement.create({
        data: {
          itemId,
          employeeNumber,
          employeeName,
          movementType,
          quantityEntered: enteredQuantity,
          enteredUom: usesPurchaseUnit ? purchaseUom : distributionUom,
          quantityBase: quantity,
          balanceAfter: balance.quantity,
          note: [
            `Reason: ${note.trim()}`,
            selectedReturnBatch?.supplier ? `Supplier: ${selectedReturnBatch.supplier}` : '',
            selectedReturnBatch ? `Batch: ${selectedReturnBatch.stockNumber}` : '',
          ].filter(Boolean).join(' | '),
        },
      });
      return {
        itemId,
        itemName: item.itemName,
        movementType,
        quantity: enteredQuantity,
        unit: usesPurchaseUnit ? purchaseUom : distributionUom,
        balance: balance.quantity,
        balanceUom: item.distributionUom,
      };
    });
  }

  private serializeBorrowedSupply<
    T extends {
      item: {
        itemName: string;
        itemCode: string | null;
        purchaseUom: string;
        distributionUom: string;
        conversionFactor: Prisma.Decimal;
      } | null;
      customItemName: string | null;
      enteredUom: string;
      baseUom: string;
      photoData: string | null;
    },
  >(record: T) {
    const { item, photoData, ...rest } = record;
    const displayUom = item?.distributionUom ?? record.baseUom;
    return {
      ...rest,
      itemName: item?.itemName ?? record.customItemName ?? 'Unnamed item',
      itemCode: item?.itemCode ?? null,
      purchaseUom: item?.purchaseUom ?? displayUom,
      distributionUom: displayUom,
      conversionFactor: item?.conversionFactor ?? new Prisma.Decimal(1),
      photoData,
      hasPhoto: Boolean(photoData),
    };
  }

  private async findBorrowedSupply(id: number) {
    return this.prisma.borrowedSupply.findUnique({
      where: { id },
      include: { item: true },
    });
  }

  private async nextBorrowedSupplyReference(): Promise<string> {
    const year = new Date().getFullYear();
    return this.prisma.$transaction(async (transaction) => {
      await transaction.borrowedSupplySequence.upsert({
        where: { year },
        create: { year, sequence: 1 },
        update: { sequence: { increment: 1 } },
      });
      const rows = await transaction.$queryRaw<Array<{ sequence: number }>>`SELECT \`sequence\` FROM \`BorrowedSupplySequence\` WHERE \`year\` = ${year} FOR UPDATE`;
      const sequence = rows[0]?.sequence;
      if (sequence === undefined) {
        throw new InternalServerErrorException(
          'Unable to generate a borrowed supply reference.',
        );
      }
      return `BOR-${year}-${String(sequence).padStart(5, '0')}`;
    });
  }

  private parseBorrowedSupplyStatus(value: string): BorrowedSupplyStatus {
    if (Object.values(BorrowedSupplyStatus).includes(value as BorrowedSupplyStatus)) {
      return value as BorrowedSupplyStatus;
    }
    throw new BadRequestException('Invalid borrowed supply status filter.');
  }

  private parseMovementType(value: string): InventoryMovementType {
    if (
      Object.values(InventoryMovementType).includes(
        value as InventoryMovementType,
      )
    ) {
      return value as InventoryMovementType;
    }
    throw new BadRequestException('Invalid inventory movement type filter.');
  }

  private dateRange(
    from?: string,
    to?: string,
  ): { gte?: Date; lte?: Date } | undefined {
    const start = from ? new Date(from) : undefined;
    const end = to ? new Date(to) : undefined;
    if (
      (start && Number.isNaN(start.getTime())) ||
      (end && Number.isNaN(end.getTime()))
    ) {
      throw new BadRequestException('Invalid report date filter.');
    }
    if (start && end && start > end) {
      throw new BadRequestException('The start date must not be after the end date.');
    }
    return start || end
      ? {
          ...(start ? { gte: start } : {}),
          ...(end ? { lte: end } : {}),
        }
      : undefined;
  }

  private validateConversion(
    purchaseUom: string,
    distributionUom: string,
    conversionFactor: number,
  ): void {
    if (
      purchaseUom.trim().toLocaleLowerCase() ===
        distributionUom.trim().toLocaleLowerCase() &&
      conversionFactor !== 1
    ) {
      throw new BadRequestException(
        'Conversion factor must be 1 when purchase and distribution units match.',
      );
    }
  }

  private itemCode(id: number): string {
    return `ITM-${String(id).padStart(6, '0')}`;
  }

  private parseCategory(value: string): ItemCategory {
    if (Object.values(ItemCategory).includes(value as ItemCategory)) {
      return value as ItemCategory;
    }
    throw new BadRequestException('Invalid inventory category filter.');
  }

  private parseStatus(value: string): InventoryItemStatus {
    if (Object.values(InventoryItemStatus).includes(value as InventoryItemStatus)) {
      return value as InventoryItemStatus;
    }
    throw new BadRequestException('Invalid inventory status filter.');
  }
}

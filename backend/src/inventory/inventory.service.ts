import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import {
  InventoryItemStatus,
  InventoryMovementType,
  ItemCategory,
  Prisma,
} from '@prisma/client';
import { randomInt } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ItemSetupDto } from './dto/item-setup.dto';
import { CreateStockMovementDto } from './dto/create-stock-movement.dto';
import { CreateStockReturnDto } from './dto/create-stock-return.dto';
import {
  CreateStockAdjustmentDto,
  StockAdjustmentType,
} from './dto/create-stock-adjustment.dto';
import { CreatePhysicalCountDto } from './dto/create-physical-count.dto';

const MAX_BARCODE_ATTEMPTS = 5;
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
                { itemName: { contains: search } },
                { description: { contains: search } },
              ],
            }
          : {}),
      },
      include: { balance: true },
      orderBy: { itemName: 'asc' },
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

  async createItem(dto: ItemSetupDto) {
    this.validateConversion(dto.purchaseUom, dto.distributionUom, dto.conversionFactor);
    return this.prisma.$transaction(async (transaction) => {
      const item = await transaction.inventoryItem.create({
        data: {
          itemName: dto.itemName.trim(),
          description: dto.description?.trim() || null,
          brand: dto.brand?.trim() || null,
          category: dto.category,
          purchaseUom: dto.purchaseUom.trim(),
          distributionUom: dto.distributionUom.trim(),
          conversionFactor: new Prisma.Decimal(dto.conversionFactor),
          reorderLevel: new Prisma.Decimal(dto.reorderLevel ?? 0),
          status: dto.status ?? InventoryItemStatus.ACTIVE,
        },
      });
      await transaction.inventoryBalance.create({
        data: { itemId: item.id, quantity: DECIMAL_ZERO },
      });
      return { ...item, balance: { quantity: DECIMAL_ZERO } };
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
        itemName: dto.itemName.trim(),
        description: dto.description?.trim() || null,
        ...(dto.brand === undefined
          ? {}
          : { brand: dto.brand.trim() || null }),
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

  async receive(dto: CreateStockMovementDto, employeeNumber: string) {
    for (let attempt = 0; attempt < MAX_BARCODE_ATTEMPTS; attempt += 1) {
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
          const baseQuantity = enteredQuantity
            .mul(item.conversionFactor)
            .toDecimalPlaces(6);
          if (baseQuantity.lessThanOrEqualTo(0)) {
            throw new BadRequestException(
              'Converted quantity is below the supported inventory precision.',
            );
          }
          if (baseQuantity.greaterThan('999999999999.999999')) {
            throw new BadRequestException(
              'Converted quantity exceeds the supported inventory precision.',
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
              barcode,
              itemName: item.itemName,
              category: item.category,
              unitOfMeasurement: item.purchaseUom,
              brand: item.brand,
              quantity: new Prisma.Decimal(dto.quantity),
              expirationDate: dto.expirationDate
                ? new Date(dto.expirationDate)
                : null,
              reorderLevel: new Prisma.Decimal(item.reorderLevel.toFixed(3)),
              itemId: item.id,
            },
          });

          const updatedBalance = await transaction.inventoryBalance.upsert({
            where: { itemId: item.id },
            create: { itemId: item.id, quantity: baseQuantity },
            update: { quantity: { increment: baseQuantity } },
          });

          await transaction.inventoryMovement.create({
            data: {
              itemId: item.id,
              employeeNumber,
              movementType: 'STOCK_IN',
              quantityEntered: enteredQuantity,
              enteredUom: item.purchaseUom,
              conversionFactor: item.conversionFactor,
              quantityBase: baseQuantity,
              balanceAfter: updatedBalance.quantity,
            },
          });

          return {
            stockEntry,
            receivedQuantity: enteredQuantity,
            receivedUom: item.purchaseUom,
            baseQuantity,
            baseUom: item.distributionUom,
            balance: updatedBalance.quantity,
            barcode: stockEntry.barcode,
          };
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002' &&
          attempt < MAX_BARCODE_ATTEMPTS - 1
        ) {
          continue;
        }
        throw error;
      }
    }
    throw new InternalServerErrorException(
      'Unable to generate a unique barcode. Please try again.',
    );
  }

  async issue(dto: CreateStockMovementDto, employeeNumber: string) {
    return this.prisma.$transaction(async (transaction) => {
      const item = await transaction.inventoryItem.findUnique({
        where: { id: dto.itemId },
      });
      if (!item) {
        throw new NotFoundException('Inventory item not found.');
      }

      const quantity = new Prisma.Decimal(dto.quantity);
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
      await transaction.inventoryMovement.create({
        data: {
          itemId: item.id,
          employeeNumber,
          movementType: 'STOCK_OUT',
          quantityEntered: quantity,
          enteredUom: item.distributionUom,
          conversionFactor: new Prisma.Decimal(1),
          quantityBase: quantity,
          balanceAfter: balance.quantity,
        },
      });

      return {
        itemId: item.id,
        itemName: item.itemName,
        issuedQuantity: quantity,
        issuedUom: item.distributionUom,
        balance: balance.quantity,
        balanceUom: item.distributionUom,
      };
    });
  }

  async returnStock(dto: CreateStockReturnDto, employeeNumber: string) {
    return this.applyBalanceMovement(
      dto.itemId,
      dto.quantity,
      employeeNumber,
      InventoryMovementType.RETURN_IN,
      dto.reason,
    );
  }

  async adjustStock(dto: CreateStockAdjustmentDto, employeeNumber: string) {
    const movementType =
      dto.adjustmentType === StockAdjustmentType.INCREASE
        ? InventoryMovementType.ADJUSTMENT_IN
        : dto.adjustmentType === StockAdjustmentType.DAMAGE
          ? InventoryMovementType.DAMAGE_OUT
          : InventoryMovementType.ADJUSTMENT_OUT;
    return this.applyBalanceMovement(
      dto.itemId,
      dto.quantity,
      employeeNumber,
      movementType,
      dto.reason,
    );
  }

  async countInventory(dto: CreatePhysicalCountDto, employeeNumber: string) {
    const itemIds = dto.counts.map((count) => count.itemId);
    if (new Set(itemIds).size !== itemIds.length) {
      throw new BadRequestException('An item may only be counted once per session.');
    }

    return this.prisma.$transaction(async (transaction) => {
      const items = await transaction.inventoryItem.findMany({
        where: { status: InventoryItemStatus.ACTIVE },
        include: { balance: true },
        orderBy: { id: 'asc' },
      });
      if (
        items.length !== dto.counts.length ||
        items.some((item) => !itemIds.includes(item.id))
      ) {
        throw new ConflictException(
          'The active item list changed. Reload the physical inventory page and try again.',
        );
      }

      const session = await transaction.physicalInventorySession.create({
        data: {
          employeeNumber,
          note: dto.note?.trim() || null,
        },
      });
      const countByItemId = new Map(
        dto.counts.map((count) => [count.itemId, count.countedQuantity]),
      );
      const results = [];

      for (const item of items) {
        const expected = item.balance?.quantity ?? DECIMAL_ZERO;
        const counted = new Prisma.Decimal(countByItemId.get(item.id)!);
        const variance = counted.minus(expected);
        const updated = await transaction.inventoryBalance.updateMany({
          where: { itemId: item.id, quantity: expected },
          data: { quantity: counted, updatedAt: new Date() },
        });
        if (updated.count !== 1) {
          throw new ConflictException(
            `${item.itemName} changed during the count. Reload inventory and retry.`,
          );
        }

        await transaction.physicalInventoryCount.create({
          data: {
            sessionId: session.id,
            itemId: item.id,
            expected,
            counted,
            variance,
          },
        });
        if (!variance.isZero()) {
          await transaction.inventoryMovement.create({
            data: {
              itemId: item.id,
              employeeNumber,
              movementType: variance.isPositive()
                ? InventoryMovementType.COUNT_IN
                : InventoryMovementType.COUNT_OUT,
              quantityEntered: variance.abs(),
              enteredUom: item.distributionUom,
              conversionFactor: new Prisma.Decimal(1),
              quantityBase: variance.abs(),
              balanceAfter: counted,
              note: dto.note?.trim() || 'Physical inventory count',
            },
          });
        }
        results.push({
          itemId: item.id,
          itemName: item.itemName,
          expected,
          counted,
          variance,
          unit: item.distributionUom,
        });
      }

      return { sessionId: session.id, note: session.note, counts: results };
    });
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
        item: { select: { itemName: true, distributionUom: true } },
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
      case 'summary':
        return this.listBalances();
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
        return items.filter((item) =>
          (item.balance?.quantity ?? DECIMAL_ZERO).lessThanOrEqualTo(
            item.reorderLevel,
          ),
        );
      }
      case 'physical-count':
        return this.prisma.physicalInventorySession.findMany({
          where: createdAt ? { createdAt } : undefined,
          include: {
            counts: {
              include: {
                item: { select: { itemName: true, distributionUom: true } },
              },
              orderBy: { itemId: 'asc' },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 200,
        });
      case 'damage-and-expired-items': {
        const expiredAt = new Date();
        expiredAt.setHours(0, 0, 0, 0);
        const [damaged, expired] = await Promise.all([
          this.listMovements({
            type: InventoryMovementType.DAMAGE_OUT,
            ...filters,
          }),
          this.prisma.stockItem.findMany({
            where: {
              expirationDate: {
                lt: expiredAt,
                ...(filters.from || filters.to
                  ? this.dateRange(filters.from, filters.to)
                  : {}),
              },
            },
            orderBy: { expirationDate: 'desc' },
            take: 500,
          }),
        ]);
        return { damaged, expired };
      }
      case 'transaction-history':
        return {
          movements: await this.listMovements(filters),
          legacyReceipts: await this.prisma.stockItem.findMany({
            where: {
              itemId: null,
              ...(createdAt ? { createdAt } : {}),
            },
            orderBy: { createdAt: 'desc' },
            take: 500,
          }),
        };
      default:
        throw new NotFoundException('Inventory report not found.');
    }
  }

  listBalances() {
    return this.prisma.$transaction(async (transaction) => {
      const items = await transaction.inventoryItem.findMany({
        where: { status: InventoryItemStatus.ACTIVE },
        include: {
          balance: true,
          movements: {
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: 1,
            select: { balanceAfter: true },
          },
        },
      });

      for (const item of items) {
        if (!item.balance) {
          await transaction.inventoryBalance.upsert({
            where: { itemId: item.id },
            create: {
              itemId: item.id,
              quantity: item.movements[0]?.balanceAfter ?? DECIMAL_ZERO,
            },
            update: {},
          });
        }
      }

      return transaction.inventoryItem.findMany({
        where: { status: InventoryItemStatus.ACTIVE },
        include: { balance: true },
        orderBy: { itemName: 'asc' },
      });
    });
  }

  private async applyBalanceMovement(
    itemId: number,
    quantityValue: number,
    employeeNumber: string,
    movementType: InventoryMovementType,
    note: string,
  ) {
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

      const quantity = new Prisma.Decimal(quantityValue);
      const increasesStock =
        movementType === InventoryMovementType.RETURN_IN ||
        movementType === InventoryMovementType.ADJUSTMENT_IN;
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

      const balance = await transaction.inventoryBalance.findUniqueOrThrow({
        where: { itemId },
      });
      await transaction.inventoryMovement.create({
        data: {
          itemId,
          employeeNumber,
          movementType,
          quantityEntered: quantity,
          enteredUom: item.distributionUom,
          conversionFactor: new Prisma.Decimal(1),
          quantityBase: quantity,
          balanceAfter: balance.quantity,
          note: note.trim(),
        },
      });
      return {
        itemId,
        itemName: item.itemName,
        movementType,
        quantity,
        unit: item.distributionUom,
        balance: balance.quantity,
      };
    });
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

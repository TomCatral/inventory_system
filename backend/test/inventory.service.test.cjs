const assert = require('node:assert/strict');
const { test } = require('node:test');
const { ForbiddenException } = require('@nestjs/common');
const { Reflector } = require('@nestjs/core');
const { plainToInstance } = require('class-transformer');
const { validate } = require('class-validator');
const { InventoryItemStatus, ItemCategory, Prisma } = require('@prisma/client');
const { InventoryService } = require('../dist/inventory/inventory.service');
const { InventoryRoleGuard } = require('../dist/roles/inventory-role.guard');
const { ItemSetupDto } = require('../dist/inventory/dto/item-setup.dto');

function createInventoryService() {
  const item = {
    id: 1,
    itemName: 'Bond Paper A4',
    brand: 'Acme',
    category: ItemCategory.CONSUMABLE,
    purchaseUom: 'Box',
    distributionUom: 'Ream',
    conversionFactor: new Prisma.Decimal(5),
    reorderLevel: new Prisma.Decimal(10),
    status: InventoryItemStatus.ACTIVE,
  };
  const calls = {
    movements: [],
    stockEntries: [],
    itemFilters: [],
  };
  let quantity = new Prisma.Decimal(0);
  let sequence = 1;
  const transaction = {
    inventoryItem: {
      findUnique: async () => item,
      findMany: async (args) => {
        calls.itemFilters.push(args);
        return [{ ...item, balance: { quantity } }];
      },
      create: async ({ data }) => ({ id: 2, ...data }),
    },
    inventoryBalance: {
      create: async () => undefined,
      upsert: async ({ create, update }) => {
        quantity = create.quantity ?? quantity.plus(update.quantity.increment);
        return { quantity };
      },
      updateMany: async ({ where, data }) => {
        if (
          where.quantity?.gte instanceof Prisma.Decimal &&
          quantity.lessThan(where.quantity.gte)
        ) {
          return { count: 0 };
        }
        if (
          where.quantity instanceof Prisma.Decimal &&
          !quantity.equals(where.quantity)
        ) {
          return { count: 0 };
        }
        if (data.quantity instanceof Prisma.Decimal) {
          quantity = data.quantity;
        } else if (data.quantity.increment) {
          quantity = quantity.plus(data.quantity.increment);
        } else {
          quantity = quantity.minus(data.quantity.decrement);
        }
        return { count: 1 };
      },
      findUniqueOrThrow: async () => ({ quantity }),
    },
    inventoryMovement: {
      create: async ({ data }) => calls.movements.push(data),
    },
    stockInSequence: {
      upsert: async () => undefined,
    },
    $queryRaw: async () => [{ sequence }],
    stockItem: {
      findMany: async () => [],
      update: async ({ data }) => data,
      create: async ({ data }) => {
        calls.stockEntries.push(data);
        return { id: calls.stockEntries.length, ...data };
      },
    },
  };
  const prisma = {
    inventoryItem: {
      findMany: async (args) => {
        calls.itemFilters.push(args);
        return [];
      },
    },
    stockItem: {
      findFirst: async () => null,
    },
    $transaction: async (callback) => callback(transaction),
  };
  return {
    service: new InventoryService(prisma),
    calls,
    item,
    getQuantity: () => quantity,
    setQuantity: (value) => { quantity = new Prisma.Decimal(value); },
  };
}

test('missing balances are restored from the latest recorded movement', async () => {
  const expectedBalance = new Prisma.Decimal(16);
  let balanceRecord;
  let itemQueries = 0;
  const item = {
    id: 1,
    itemName: 'Bond Paper A4',
    status: InventoryItemStatus.ACTIVE,
    balance: null,
    movements: [{ balanceAfter: expectedBalance }],
  };
  const service = new InventoryService({
    $transaction: async (callback) =>
      callback({
        inventoryItem: {
          findMany: async () => {
            itemQueries += 1;
            return itemQueries === 1
              ? [item]
              : [{ ...item, balance: balanceRecord, movements: undefined }];
          },
        },
        inventoryBalance: {
          upsert: async ({ create, update }) => {
            assert.deepEqual(update, {});
            balanceRecord = { quantity: create.quantity };
            return balanceRecord;
          },
        },
      }),
  });

  const items = await service.listBalances();

  assert.equal(balanceRecord.quantity.toString(), '16');
  assert.equal(items[0].balance.quantity.toString(), '16');
});

test('catalog supports non-consumable items with the same purchase and distribution UOM', async () => {
  let createdItem;
  const prisma = {
    $transaction: async (callback) =>
      callback({
        inventoryItem: {
          create: async ({ data }) => {
            createdItem = data;
            return { id: 2, ...data };
          },
          update: async ({ data }) => ({ id: 2, ...createdItem, ...data }),
        },
        inventoryBalance: { create: async () => undefined },
      }),
  };
  const service = new InventoryService(prisma);

  const result = await service.createItem({
    itemName: 'Office chair',
    brand: 'Office Co.',
    category: ItemCategory.NON_CONSUMABLE,
    purchaseUom: 'Unit',
    distributionUom: 'Unit',
    conversionFactor: 1,
  });

  assert.equal(createdItem.category, ItemCategory.NON_CONSUMABLE);
  assert.equal(createdItem.brand, 'Office Co.');
  assert.equal(createdItem.conversionFactor.toString(), '1');
  assert.equal(result.balance.quantity.toString(), '0');
});

test('receiving 10 boxes converts to 50 reams and issuing 3 leaves 47 reams', async () => {
  const { service, calls, getQuantity } = createInventoryService();

  const received = await service.receive({ itemId: 1, quantity: 10 }, '0000004457');
  assert.equal(received.baseQuantity.toString(), '50');
  assert.equal(received.balance.toString(), '50');
  assert.equal(received.baseUom, 'Ream');
  assert.equal(calls.stockEntries[0].quantity.toString(), '10');

  const issued = await service.issue({ itemId: 1, quantity: 3 }, '0000004457');
  assert.equal(issued.balance.toString(), '47');
  assert.equal(issued.balanceUom, 'Ream');
  assert.equal(getQuantity().toString(), '47');
  assert.equal(calls.movements.length, 2);
  assert.equal(calls.movements[0].quantityBase.toString(), '50');
  assert.equal(calls.movements[1].quantityBase.toString(), '3');
});

test('stock-out rejects quantities greater than available stock', async () => {
  const { service } = createInventoryService();
  await assert.rejects(
    service.issue({ itemId: 1, quantity: 1 }, '0000004457'),
    /Issued quantity exceeds available stock/,
  );
});

test('stock-out honors the selected purchase unit and records its base equivalent', async () => {
  const { service, calls, getQuantity, setQuantity } = createInventoryService();
  setQuantity(50);

  const issued = await service.issue(
    { itemId: 1, quantity: 3, unit: 'PURCHASE' },
    '0000004457',
  );

  assert.equal(issued.issuedQuantity.toString(), '3');
  assert.equal(issued.issuedUom, 'Box');
  assert.equal(issued.baseQuantity.toString(), '15');
  assert.equal(getQuantity().toString(), '35');
  assert.equal(calls.movements[0].quantityEntered.toString(), '3');
  assert.equal(calls.movements[0].enteredUom, 'Box');
  assert.equal(calls.movements[0].quantityBase.toString(), '15');
});

test('category filters are passed to the item query', async () => {
  const { service, calls } = createInventoryService();
  await service.listItems({ category: ItemCategory.CONSUMABLE });
  assert.equal(calls.itemFilters[0].where.category, ItemCategory.CONSUMABLE);
});

test('item setup DTO rejects zero conversion factors', async () => {
  const dto = plainToInstance(ItemSetupDto, {
    itemName: 'Bond paper',
    category: ItemCategory.CONSUMABLE,
    purchaseUom: 'Box',
    distributionUom: 'Ream',
    conversionFactor: 0,
  });

  const errors = await validate(dto);
  assert.ok(errors.some((error) => error.property === 'conversionFactor'));
});

test('inventory role guard defaults unassigned SSO employees to staff access', async () => {
  const reflector = new Reflector();
  const guard = new InventoryRoleGuard(reflector, {
    inventoryRole: { findUnique: async () => null },
  });
  const context = {
    getHandler: () => () => undefined,
    getClass: () => class TestController {},
    switchToHttp: () => ({
      getRequest: () => ({ user: { emp_no: '0000000001' } }),
    }),
  };

  assert.equal(await guard.canActivate(context), true);
});

test('inventory role guard denies users modifying SUPERADMIN-only features', async () => {
  const guard = new InventoryRoleGuard(
    { getAllAndOverride: () => ['SUPERADMIN'] },
    { inventoryRole: { findUnique: async () => ({ roleType: 'USER' }) } },
  );
  const context = {
    getHandler: () => () => undefined,
    getClass: () => class TestController {},
    switchToHttp: () => ({
      getRequest: () => ({ user: { emp_no: '0000000001' } }),
    }),
  };

  await assert.rejects(guard.canActivate(context), ForbiddenException);
});

test('item returns convert the selected unit, decrease balance, and record the reason', async () => {
  const { service, calls, getQuantity, setQuantity } = createInventoryService();
  setQuantity(20);
  const result = await service.returnStock(
    { itemId: 1, quantity: 3, unit: 'Box', reason: 'Returned by department' },
    '0000004457',
  );

  assert.equal(result.movementType, 'DAMAGE_OUT');
  assert.equal(result.balance.toString(), '5');
  assert.equal(getQuantity().toString(), '5');
  assert.equal(calls.movements[0].quantityBase.toString(), '15');
  assert.equal(calls.movements[0].note, 'Reason: Returned by department');
});



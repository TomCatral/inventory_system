const assert = require('node:assert/strict');
const { test } = require('node:test');
const { StockInService } = require('../dist/inventory/stock-in.service');

test('recent stock records are returned newest first with a bounded result set', async () => {
  const expected = [{ id: 1, itemName: 'Printer paper' }];
  let query;
  const service = new StockInService({
    stockItem: {
      findMany: async (args) => {
        query = args;
        return expected;
      },
    },
  });

  const records = await service.findRecent();

  assert.deepEqual(records, expected);
  assert.deepEqual(query, {
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
});

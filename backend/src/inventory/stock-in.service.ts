import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class StockInService {
  constructor(private readonly prisma: PrismaService) {}

  findRecent() {
    return this.prisma.stockItem.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
}

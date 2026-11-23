import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map, Observable } from 'rxjs';
import { AuthService } from '../Auth/auth.service';
import { environment } from '../../environments/environment';

export type StockItemCategory = 'CONSUMABLE' | 'NON_CONSUMABLE';
export type InventoryItemStatus = 'ACTIVE' | 'INACTIVE';
export type InventoryRoleType = 'USER' | 'ADMIN' | 'SUPERADMIN';

export interface InventoryItem {
  readonly id: number;
  readonly itemCode: string | null;
  readonly itemName: string;
  readonly description: string | null;
  readonly brand: string | null;
  readonly category: StockItemCategory;
  readonly purchaseUom: string;
  readonly distributionUom: string;
  readonly conversionFactor: string;
  readonly reorderLevel: string;
  readonly status: InventoryItemStatus;
  readonly balance?: { readonly quantity: string } | null;
  readonly updatedAt?: string;
}

const itemCodeCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
});

/** Orders catalog items by their full code using natural numeric ordering. */
export function sortInventoryItemsByCode(items: readonly InventoryItem[]): InventoryItem[] {
  return [...items].sort((left, right) => {
    const leftCode = left.itemCode?.trim() || `ITM-${String(left.id).padStart(4, '0')}`;
    const rightCode = right.itemCode?.trim() || `ITM-${String(right.id).padStart(4, '0')}`;
    return itemCodeCollator.compare(leftCode, rightCode) || left.id - right.id;
  });
}

export interface ItemSetupRequest {
  readonly itemCode?: string;
  readonly itemName: string;
  readonly description: string;
  readonly brand: string;
  readonly category: StockItemCategory;
  readonly purchaseUom: string;
  readonly distributionUom: string;
  readonly conversionFactor: number;
  readonly reorderLevel: number;
  readonly status: InventoryItemStatus;
}

export interface InventoryRole {
  readonly id: number;
  readonly employeeNumber: string;
  readonly roleType: InventoryRoleType;
  readonly permissions?: string[] | null;
  readonly employeeName?: string | null;
  readonly departmentName?: string | null;
}

export interface EmployeeSearchResult {
  readonly employeeNumber: string;
  readonly employeeName: string;
  readonly departmentName?: string | null;
}

export interface StockItem {
  readonly id: number;
  readonly stockNumber: string;
  readonly itemName: string;
  readonly unitOfMeasurement: string;
  readonly quantity: string;
  readonly remainingQuantity?: string | null;
  readonly expectedQuantity?: string | null;
  readonly shortageQuantity?: string;
  readonly expirationDate: string | null;
  readonly supplier?: string | null;
  readonly deliveredBy?: string | null;
  readonly delivererCode?: string | null;
  readonly deliveryReference?: string | null;
  readonly deliveryDate?: string | null;
  readonly stockClassification?: 'OLD' | 'NEW' | null;
  readonly remarks?: string | null;
  readonly itemId?: number | null;
  readonly createdAt: string;
}

export interface CreateGoodsReceiptRequest {
  readonly supplier: string;
  readonly deliveredBy: string;
  readonly delivererCode?: string;
  readonly deliveryReference?: string;
  readonly deliveryDate: string;
  readonly stockClassification: 'OLD' | 'NEW';
  readonly remarks?: string;
  readonly items: readonly {
    readonly itemId: number;
    readonly quantity: number;
    readonly expectedQuantity?: number;
    readonly expirationDate?: string;
  }[];
}

export interface GoodsReceiptResponse {
  readonly id: number;
  readonly receiptNumber: string;
  readonly supplier: string;
  readonly deliveredBy: string;
  readonly delivererCode?: string | null;
  readonly deliveryDate: string;
  readonly items: readonly { readonly itemName: string; readonly expectedQuantity: string; readonly receivedQuantity: string; readonly shortageQuantity: string; readonly baseQuantity: string; readonly balance: string }[];
}

export interface GoodsReceiptRecord {
  readonly id: number;
  readonly receiptNumber: string;
  readonly supplier: string;
  readonly deliveredBy: string;
  readonly delivererCode: string | null;
  readonly deliveryReference: string | null;
  readonly deliveryDate: string;
  readonly stockClassification: 'OLD' | 'NEW';
  readonly remarks: string | null;
  readonly receivedByEmpNo: string;
  readonly receivedByName: string | null;
  readonly createdAt: string;
  readonly items: readonly StockItem[];
}

export interface CreateStockOutRequest {
  readonly itemId: number;
  readonly stockItemId?: number;
  readonly quantity: number;
  readonly unit?: 'PURCHASE' | 'BASE';
  readonly recipientEmpNo?: string;
  readonly referenceNumber?: string;
}

export interface StockBatch {
  readonly id: number;
  readonly stockNumber: string;
  readonly supplier: string | null;
  readonly deliveredBy: string | null;
  readonly deliveryReference: string | null;
  readonly deliveryDate: string | null;
  readonly stockClassification: 'OLD' | 'NEW';
  readonly expirationDate: string | null;
  readonly baseQuantity: string | null;
  readonly remainingQuantity: string | null;
  readonly quantity: string;
  readonly expectedQuantity: string | null;
  readonly shortageQuantity: string;
  readonly unitOfMeasurement: string;
  readonly remarks: string | null;
  readonly createdAt: string;
}

export interface SupplyAssignment {
  readonly id: number;
  readonly itemId: number;
  readonly recipientEmpNo: string;
  readonly recipientName: string;
  readonly issuedByEmpNo: string;
  readonly quantity: string;
  readonly remainingQuantity: string;
  readonly enteredUom?: string | null;
  readonly enteredQuantity?: string | null;
  readonly conversionFactor?: string | null;
  readonly referenceNumber: string | null;
  readonly status: 'ACTIVE' | 'RETURNED' | 'TRANSFERRED';
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly item: InventoryItem;
}

export interface StockMovementResponse {
  readonly movementType?: string;
  readonly quantity?: string;
  readonly unit?: string;
  readonly itemId: number;
  readonly itemName: string;
  readonly receivedQuantity?: string;
  readonly receivedUom?: string;
  readonly issuedQuantity?: string;
  readonly issuedUom?: string;
  readonly baseQuantity?: string;
  readonly baseUom?: string;
  readonly balance: string;
  readonly balanceUom?: string;
  readonly stockEntry?: StockItem;
}

export type StockRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface StockRequest {
  readonly id: number;
  readonly itemId: number;
  readonly quantity: string;
  readonly note: string | null;
  readonly requestedByEmpNo: string;
  readonly requestedByName: string | null;
  readonly status: StockRequestStatus;
  readonly resolvedByEmpNo: string | null;
  readonly resolvedByName: string | null;
  readonly resolvedAt: string | null;
  readonly createdAt: string;
  readonly item: {
    readonly itemCode: string | null;
    readonly itemName: string;
    readonly distributionUom: string;
    readonly purchaseUom: string;
    readonly conversionFactor: string;
  };
}

export type BorrowedSupplyStatus = 'PENDING' | 'RETURNED';

export interface BorrowedSupplyRecord {
  readonly id: number;
  readonly referenceNumber: string;
  readonly itemId: number | null;
  readonly customItemName?: string | null;
  readonly itemName: string;
  readonly itemCode: string | null;
  readonly purchaseUom: string;
  readonly distributionUom: string;
  readonly conversionFactor: string;
  readonly borrowerName: string;
  readonly borrowerEmpNo: string | null;
  readonly department: string | null;
  readonly contactNumber: string | null;
  readonly quantity: string;
  readonly enteredQuantity: string;
  readonly enteredUom: string;
  readonly baseUom: string;
  readonly conditionAtBorrow: 'GOOD' | 'FAIR' | 'POOR' | null;
  readonly purpose: string | null;
  readonly expectedReturnAt: string | null;
  readonly borrowedAt: string;
  readonly status: BorrowedSupplyStatus;
  readonly returnedAt: string | null;
  readonly photoData?: string | null;
  readonly hasPhoto: boolean;
  readonly notes: string | null;
  readonly issuedByEmpNo: string;
  readonly issuedByName: string | null;
  readonly returnedByEmpNo: string | null;
  readonly returnedByName: string | null;
  readonly returnNotes: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreateBorrowedSupplyRequest {
  readonly itemId?: number;
  readonly customItemName?: string;
  readonly customUnit?: string;
  readonly borrowerName: string;
  readonly department?: string;
  readonly contactNumber?: string;
  readonly quantity: number;
  readonly unit?: 'PURCHASE' | 'BASE';
  readonly conditionAtBorrow?: 'GOOD' | 'FAIR' | 'POOR';
  readonly purpose?: string;
  readonly expectedReturnAt?: string;
  readonly borrowedAt: string;
  readonly photoData?: string;
  readonly notes?: string;
  readonly referenceNumber?: string;
}

export interface AppNotification {
  readonly id: number;
  readonly recipientEmpNo: string;
  readonly message: string;
  readonly refType: string | null;
  readonly refId: number | null;
  readonly isRead: boolean;
  readonly createdAt: string;
}


@Injectable({ providedIn: 'root' })
export class InventoryService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly baseUrl = `${environment.apiUrl}/inventory`;

  createGoodsReceipt(request: CreateGoodsReceiptRequest): Observable<GoodsReceiptResponse> {
    return this.http.post<GoodsReceiptResponse>(`${this.baseUrl}/goods-receipts`, request, {
      headers: this.requireAuthorizationHeaders(),
    });
  }

  listGoodsReceipts(): Observable<GoodsReceiptRecord[]> {
    return this.http.get<GoodsReceiptRecord[]>(`${this.baseUrl}/goods-receipts`, {
      headers: this.requireAuthorizationHeaders(),
    });
  }

  updateStockInLine(
    stockItemId: number,
    request: {
      readonly quantity?: number;
      readonly expectedQuantity?: number;
      readonly expirationDate?: string | null;
    },
  ): Observable<unknown> {
    return this.http.patch<unknown>(`${this.baseUrl}/stock-in/${stockItemId}`, request, {
      headers: this.requireAuthorizationHeaders(),
    });
  }

  deleteStockInLine(stockItemId: number): Observable<unknown> {
    return this.http.delete<unknown>(`${this.baseUrl}/stock-in/${stockItemId}`, {
      headers: this.requireAuthorizationHeaders(),
    });
  }

  listItems(filters: {
    category?: string;
    status?: string;
    search?: string;
  } = {}): Observable<InventoryItem[]> {
    const params: Record<string, string> = {};
    if (filters.category) params['category'] = filters.category;
    if (filters.status) params['status'] = filters.status;
    if (filters.search) params['search'] = filters.search;
    return this.http.get<InventoryItem[]>(`${this.baseUrl}/items`, {
      headers: this.requireAuthorizationHeaders(),
      params,
    }).pipe(map(sortInventoryItemsByCode));
  }

  getItem(id: number): Observable<InventoryItem> {
    return this.http.get<InventoryItem>(`${this.baseUrl}/items/${id}`, {
      headers: this.requireAuthorizationHeaders(),
    });
  }

  createItem(request: ItemSetupRequest): Observable<InventoryItem> {
    return this.http.post<InventoryItem>(`${this.baseUrl}/items`, request, {
      headers: this.requireAuthorizationHeaders(),
    });
  }

  updateItem(id: number, request: ItemSetupRequest): Observable<InventoryItem> {
    return this.http.patch<InventoryItem>(`${this.baseUrl}/items/${id}`, request, {
      headers: this.requireAuthorizationHeaders(),
    });
  }

  listBalances(): Observable<InventoryItem[]> {
    return this.http.get<InventoryItem[]>(`${this.baseUrl}/balances`, {
      headers: this.requireAuthorizationHeaders(),
    }).pipe(map(sortInventoryItemsByCode));
  }

  issue(request: CreateStockOutRequest): Observable<StockMovementResponse> {
    return this.http.post<StockMovementResponse>(`${this.baseUrl}/stock-out`, request, {
      headers: this.requireAuthorizationHeaders(),
    });
  }

  listItemBatches(itemId: number): Observable<StockBatch[]> {
    return this.http.get<StockBatch[]>(`${this.baseUrl}/items/${itemId}/batches`, {
      headers: this.requireAuthorizationHeaders(),
    });
  }

  listIssuanceRecipients(search = ''): Observable<EmployeeSearchResult[]> {
    return this.http.get<EmployeeSearchResult[]>(`${this.baseUrl}/issuance-recipients`, {
      headers: this.requireAuthorizationHeaders(),
      params: search ? { q: search } : {},
    });
  }

  listMySupplies(): Observable<SupplyAssignment[]> {
    return this.http.get<SupplyAssignment[]>(`${this.baseUrl}/supplies/my`, {
      headers: this.requireAuthorizationHeaders(),
    });
  }

  listMyItemBatches(itemId: number): Observable<StockBatch[]> {
    return this.http.get<StockBatch[]>(`${this.baseUrl}/supplies/my/${itemId}/batches`, {
      headers: this.requireAuthorizationHeaders(),
    });
  }

  returnAssignedSupply(id: number, quantity: number, note?: string): Observable<SupplyAssignment> {
    return this.http.post<SupplyAssignment>(`${this.baseUrl}/supplies/${id}/return`, { quantity, note }, {
      headers: this.requireAuthorizationHeaders(),
    });
  }

  transferAssignedSupply(id: number, quantity: number, recipientEmpNo: string, note?: string): Observable<SupplyAssignment> {
    return this.http.post<SupplyAssignment>(`${this.baseUrl}/supplies/${id}/transfer`, { quantity, recipientEmpNo, note }, {
      headers: this.requireAuthorizationHeaders(),
    });
  }

  returnItems(request: {
    readonly itemId: number;
    readonly quantity: number;
    readonly reason: string;
    readonly unit: string;
    readonly stockItemId?: number;
  }): Observable<StockMovementResponse> {
    return this.http.post<StockMovementResponse>(`${this.baseUrl}/returns`, request, {
      headers: this.requireAuthorizationHeaders(),
    });
  }

  getReport(report: string, filters: { from?: string; to?: string } = {}): Observable<unknown> {
    const params: Record<string, string> = {};
    if (filters.from) params['from'] = filters.from;
    if (filters.to) params['to'] = filters.to;
    return this.http.get<unknown>(`${this.baseUrl}/reports/${report}`, {
      headers: this.requireAuthorizationHeaders(),
      params,
    });
  }

  listRoles(): Observable<InventoryRole[]> {
    return this.http.get<InventoryRole[]>(`${this.baseUrl}/roles`, {
      headers: this.requireAuthorizationHeaders(),
    });
  }

  searchEmployees(query: string): Observable<EmployeeSearchResult[]> {
    return this.http.get<EmployeeSearchResult[]>(`${this.baseUrl}/roles/search-employees`, {
      headers: this.requireAuthorizationHeaders(),
      params: { q: query },
    });
  }

  createRole(request: {
    readonly employeeNumber: string;
    readonly roleType: InventoryRoleType;
    readonly permissions?: readonly string[] | null;
  }): Observable<InventoryRole> {
    return this.http.post<InventoryRole>(`${this.baseUrl}/roles`, request, {
      headers: this.requireAuthorizationHeaders(),
    });
  }

  updateRole(
    id: number,
    roleType: InventoryRoleType,
    permissions?: readonly string[] | null,
  ): Observable<InventoryRole> {
    return this.http.patch<InventoryRole>(`${this.baseUrl}/roles/${id}`, {
      roleType,
      ...(permissions !== undefined ? { permissions } : {}),
    }, {
      headers: this.requireAuthorizationHeaders(),
    });
  }

  deleteRole(id: number): Observable<InventoryRole> {
    return this.http.delete<InventoryRole>(`${this.baseUrl}/roles/${id}`, {
      headers: this.requireAuthorizationHeaders(),
    });
  }

  // ─── Stock Requests ───────────────────────────────────────────────────────

  createStockRequest(req: { itemId: number; quantity: number; note?: string }): Observable<StockRequest> {
    return this.http.post<StockRequest>(`${this.baseUrl}/requests`, req, {
      headers: this.requireAuthorizationHeaders(),
    });
  }

  listMyRequests(): Observable<StockRequest[]> {
    return this.http.get<StockRequest[]>(`${this.baseUrl}/requests/my`, {
      headers: this.requireAuthorizationHeaders(),
    });
  }

  listAllRequests(status?: string): Observable<StockRequest[]> {
    const params: Record<string, string> = {};
    if (status) params['status'] = status;
    return this.http.get<StockRequest[]>(`${this.baseUrl}/requests`, {
      headers: this.requireAuthorizationHeaders(),
      params,
    });
  }

  approveRequest(id: number): Observable<StockRequest> {
    return this.http.patch<StockRequest>(`${this.baseUrl}/requests/${id}/approve`, {}, {
      headers: this.requireAuthorizationHeaders(),
    });
  }

  rejectRequest(id: number, reason?: string): Observable<StockRequest> {
    return this.http.patch<StockRequest>(`${this.baseUrl}/requests/${id}/reject`, { reason }, {
      headers: this.requireAuthorizationHeaders(),
    });
  }

  listBorrowedSupplies(status?: BorrowedSupplyStatus): Observable<BorrowedSupplyRecord[]> {
    const params: Record<string, string> = {};
    if (status) params['status'] = status;
    return this.http.get<BorrowedSupplyRecord[]>(`${this.baseUrl}/borrowed-supplies`, {
      headers: this.requireAuthorizationHeaders(),
      params,
    });
  }

  getBorrowedSupplyPhoto(id: number): Observable<{ photoData: string | null }> {
    return this.http.get<{ photoData: string | null }>(`${this.baseUrl}/borrowed-supplies/${id}/photo`, {
      headers: this.requireAuthorizationHeaders(),
    });
  }

  createBorrowedSupply(request: CreateBorrowedSupplyRequest): Observable<BorrowedSupplyRecord> {
    return this.http.post<BorrowedSupplyRecord>(`${this.baseUrl}/borrowed-supplies`, request, {
      headers: this.requireAuthorizationHeaders(),
    });
  }

  returnBorrowedSupply(id: number, returnNotes?: string): Observable<BorrowedSupplyRecord> {
    return this.http.patch<BorrowedSupplyRecord>(`${this.baseUrl}/borrowed-supplies/${id}/return`, { returnNotes }, {
      headers: this.requireAuthorizationHeaders(),
    });
  }

  // ─── Notifications ────────────────────────────────────────────────────────

  listNotifications(): Observable<AppNotification[]> {
    return this.http.get<AppNotification[]>(`${this.baseUrl}/notifications`, {
      headers: this.requireAuthorizationHeaders(),
    });
  }

  unreadCount(): Observable<number> {
    return this.http.get<number>(`${this.baseUrl}/notifications/unread-count`, {
      headers: this.requireAuthorizationHeaders(),
    });
  }

  markNotificationRead(id: number): Observable<unknown> {
    return this.http.patch(`${this.baseUrl}/notifications/${id}/read`, {}, {
      headers: this.requireAuthorizationHeaders(),
    });
  }

  markAllNotificationsRead(): Observable<unknown> {
    return this.http.patch(`${this.baseUrl}/notifications/read-all`, {}, {
      headers: this.requireAuthorizationHeaders(),
    });
  }

  private requireAuthorizationHeaders(): HttpHeaders {
    const headers = this.auth.authorizationHeaders();
    if (!headers) {
      throw new Error('Sign in is required to access inventory.');
    }
    return headers;
  }
}

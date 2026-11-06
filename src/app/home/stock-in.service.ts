import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { AuthService } from '../Auth/auth.service';
import { environment } from '../../environments/environment';

export type StockItemCategory = 'CONSUMABLE' | 'NON_CONSUMABLE';
export type InventoryItemStatus = 'ACTIVE' | 'INACTIVE';
export type InventoryRoleType = 'USER' | 'ADMIN' | 'SUPERADMIN';

export interface InventoryItem {
  readonly id: number;
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
}

export interface ItemSetupRequest {
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
}

export interface StockItem {
  readonly id: number;
  readonly stockNumber: string;
  readonly barcode: string;
  readonly itemName: string;
  readonly category: StockItemCategory;
  readonly unitOfMeasurement: string;
  readonly brand: string | null;
  readonly quantity: string;
  readonly expirationDate: string | null;
  readonly reorderLevel: string;
  readonly createdAt: string;
}

export interface CreateStockInRequest {
  readonly itemId: number;
  readonly quantity: number;
  readonly expirationDate?: string | null;
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

export interface InventoryMovement {
  readonly id: number;
  readonly itemId: number;
  readonly employeeNumber: string;
  readonly movementType: string;
  readonly quantityEntered: string;
  readonly enteredUom: string;
  readonly quantityBase: string;
  readonly balanceAfter: string;
  readonly note: string | null;
  readonly createdAt: string;
  readonly item: { readonly itemName: string; readonly distributionUom: string };
}

export interface PhysicalInventoryCountRequest {
  readonly counts: readonly {
    readonly itemId: number;
    readonly countedQuantity: number;
  }[];
  readonly note?: string;
}

export interface PhysicalInventoryCountResponse {
  readonly sessionId: number;
  readonly counts: readonly {
    readonly itemId: number;
    readonly itemName: string;
    readonly expected: string;
    readonly counted: string;
    readonly variance: string;
    readonly unit: string;
  }[];
}

@Injectable({ providedIn: 'root' })
export class StockInService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly baseUrl = `${environment.apiUrl}/inventory`;

  create(request: CreateStockInRequest): Observable<StockMovementResponse> {
    return this.http.post<StockMovementResponse>(`${this.baseUrl}/stock-in`, request, {
      headers: this.requireAuthorizationHeaders(),
    });
  }

  listRecent(): Observable<StockItem[]> {
    return this.http.get<StockItem[]>(`${this.baseUrl}/stock`, {
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
    });
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

  receive(request: CreateStockInRequest): Observable<StockMovementResponse> {
    return this.http.post<StockMovementResponse>(`${this.baseUrl}/receipts`, request, {
      headers: this.requireAuthorizationHeaders(),
    });
  }

  listBalances(): Observable<InventoryItem[]> {
    return this.http.get<InventoryItem[]>(`${this.baseUrl}/balances`, {
      headers: this.requireAuthorizationHeaders(),
    });
  }

  issue(request: CreateStockInRequest): Observable<StockMovementResponse> {
    return this.http.post<StockMovementResponse>(`${this.baseUrl}/stock-out`, request, {
      headers: this.requireAuthorizationHeaders(),
    });
  }

  returnItems(request: CreateStockInRequest & { readonly reason: string }): Observable<StockMovementResponse> {
    return this.http.post<StockMovementResponse>(`${this.baseUrl}/returns`, request, {
      headers: this.requireAuthorizationHeaders(),
    });
  }

  adjustStock(request: {
    readonly itemId: number;
    readonly quantity: number;
    readonly adjustmentType: 'INCREASE' | 'DECREASE' | 'DAMAGE';
    readonly reason: string;
  }): Observable<StockMovementResponse> {
    return this.http.post<StockMovementResponse>(`${this.baseUrl}/adjustments`, request, {
      headers: this.requireAuthorizationHeaders(),
    });
  }

  countInventory(request: PhysicalInventoryCountRequest): Observable<PhysicalInventoryCountResponse> {
    return this.http.post<PhysicalInventoryCountResponse>(`${this.baseUrl}/physical-count`, request, {
      headers: this.requireAuthorizationHeaders(),
    });
  }

  listMovements(filters: {
    type?: string;
    from?: string;
    to?: string;
  } = {}): Observable<InventoryMovement[]> {
    const params: Record<string, string> = {};
    if (filters.type) params['type'] = filters.type;
    if (filters.from) params['from'] = filters.from;
    if (filters.to) params['to'] = filters.to;
    return this.http.get<InventoryMovement[]>(`${this.baseUrl}/movements`, {
      headers: this.requireAuthorizationHeaders(),
      params,
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

  createRole(request: Pick<InventoryRole, 'employeeNumber' | 'roleType'>): Observable<InventoryRole> {
    return this.http.post<InventoryRole>(`${this.baseUrl}/roles`, request, {
      headers: this.requireAuthorizationHeaders(),
    });
  }

  updateRole(id: number, roleType: InventoryRoleType): Observable<InventoryRole> {
    return this.http.patch<InventoryRole>(`${this.baseUrl}/roles/${id}`, { roleType }, {
      headers: this.requireAuthorizationHeaders(),
    });
  }

  deleteRole(id: number): Observable<InventoryRole> {
    return this.http.delete<InventoryRole>(`${this.baseUrl}/roles/${id}`, {
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

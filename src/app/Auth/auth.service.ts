import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { catchError, EMPTY, filter, map, Observable, of, Subscription, switchMap, tap, throwError, timer } from 'rxjs';
import { environment } from '../../environments/environment';

interface LoginResponse {
  access_token: string;
  token_type: string;
}

interface ValidateResponse {
  authenticated: boolean;
  role?: InventoryRole;
  permissions?: string[] | null;
}

export interface SsoProfile {
  readonly employeeNumber: string;
  readonly name: string;
  readonly division: string;
  readonly divisionDescription: string;
}

export type InventoryRole = 'USER' | 'ADMIN' | 'SUPERADMIN';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/auth`;
  private roleRefresh: Subscription | null = null;
  readonly inventoryRole = signal<InventoryRole | null>(this.readStoredRole());
  readonly inventoryPermissions = signal<string[] | null>(this.readStoredPermissions());
  readonly profile = signal<SsoProfile | null>(this.readStoredProfile());
  readonly sessionVersion = signal(0);

  hasSession(): boolean {
    return Boolean(sessionStorage.getItem('inventory.access_token'));
  }

  startSessionRefresh(): void {
    if (this.roleRefresh || !this.hasSession()) return;
    this.roleRefresh = timer(15_000, 15_000)
      .pipe(
        filter(() => this.hasSession() && (typeof document === 'undefined' || !document.hidden)),
        switchMap(() => this.validateSession()),
        catchError(() => EMPTY),
      )
      .subscribe();
  }

  login(username: string, password: string): Observable<void> {
    return this.http
      .post<LoginResponse>(`${this.baseUrl}/login`, { username, password })
      .pipe(
        tap((response) => this.storeToken(response)),
        switchMap(() => this.validateSession()),
        map((authenticated) => {
          if (!authenticated) {
            throw new Error('The authenticated account could not be validated.');
          }
          return undefined;
        }),
      );
  }

  validateSession(): Observable<boolean> {
    const headers = this.authorizationHeaders();
    if (!headers) {
      return of(false);
    }

    return this.http
      .post<ValidateResponse>(
        `${this.baseUrl}/validate`,
        {},
        { headers },
      )
      .pipe(
        map((response) => {
          if (response.authenticated !== true) {
            this.clearSession();
            return false;
          }
          if (
            response.role === 'USER' ||
            response.role === 'ADMIN' ||
            response.role === 'SUPERADMIN'
          ) {
            const nextPermissions = response.permissions ?? null;
            const roleChanged = this.inventoryRole() !== response.role;
            const permissionsChanged =
              JSON.stringify(this.inventoryPermissions()) !== JSON.stringify(nextPermissions);
            if (roleChanged || permissionsChanged) {
              this.inventoryRole.set(response.role);
              sessionStorage.setItem('inventory.role', response.role);
              this.storePermissions(nextPermissions);
              this.sessionVersion.update((version) => version + 1);
            }
          } else {
            this.clearSession();
            return false;
          }
          return true;
        }),
        catchError((error: unknown) => {
          if (error instanceof HttpErrorResponse && error.status === 401) {
            this.clearSession();
            return of(false);
          }
          if (error instanceof HttpErrorResponse && error.status === 403) {
            this.clearSession();
          }
          return throwError(() => error);
        }),
      );
  }

  getProfile(): Observable<unknown> {
    const headers = this.authorizationHeaders();
    if (!headers) {
      return throwError(() => new Error('Sign in to view your account profile.'));
    }
    return this.http
      .post<unknown>(`${this.baseUrl}/me`, {}, { headers })
      .pipe(tap((response) => this.storeProfile(this.extractProfile(response))));
  }

  refreshProfile(): Observable<SsoProfile | null> {
    const headers = this.authorizationHeaders();
    if (!headers) {
      this.storeProfile(null);
      return of(null);
    }
    return this.http.post<unknown>(`${this.baseUrl}/me`, {}, { headers }).pipe(
      map((response) => this.extractProfile(response)),
      tap((profile) => this.storeProfile(profile)),
      catchError(() => {
        this.storeProfile(null);
        return of(null);
      }),
    );
  }

  canAccessRoute(route: string): boolean {
    const role = this.inventoryRole();
    if (role === 'SUPERADMIN') return true;
    if (role === 'ADMIN') {
      if (route === 'setup/user-roles') return false;
      if (route === 'transactions/my-supplies') return true;
      if (route === 'reports/borrowed-supplies') return true;
      if (route === 'transactions/borrowed-supply') return true;
      const permissions = this.inventoryPermissions();
      if (!permissions) return true;
      if (route === 'reports/low-stock') {
        return permissions.includes(route) || permissions.includes('reports/inventory-summary');
      }
      return permissions.includes(route);
    }
    return route === 'transactions/my-supplies' ||
      route === 'transactions/request-supply' ||
      route === 'transactions/borrowed-supply';
  }

  logout(): Observable<unknown> {
    const headers = this.authorizationHeaders();
    this.clearSession();

    if (!headers) {
      return of(null);
    }

    return this.http
      .post(`${this.baseUrl}/logout`, {}, { headers })
      .pipe(catchError(() => of(null)));
  }

  authorizationHeaders(): HttpHeaders | null {
    const accessToken = sessionStorage.getItem('inventory.access_token');
    const tokenType = sessionStorage.getItem('inventory.token_type');
    if (!accessToken || !tokenType) {
      return null;
    }

    return new HttpHeaders({
      Authorization: `${tokenType} ${accessToken}`,
    });
  }

  private storeToken(response: LoginResponse): void {
    if (
      !response ||
      typeof response.access_token !== 'string' ||
      !response.access_token ||
      typeof response.token_type !== 'string' ||
      response.token_type.toLowerCase() !== 'bearer'
    ) {
      throw new Error('The sign-in service returned an invalid response.');
    }

    sessionStorage.setItem('inventory.access_token', response.access_token);
    sessionStorage.setItem('inventory.token_type', response.token_type);
    this.storeProfile(null);
    this.sessionVersion.update((version) => version + 1);
  }

  private clearSession(): void {
    sessionStorage.removeItem('inventory.access_token');
    sessionStorage.removeItem('inventory.token_type');
    sessionStorage.removeItem('inventory.role');
    sessionStorage.removeItem('inventory.permissions');
    sessionStorage.removeItem('inventory.profile');
    this.inventoryRole.set(null);
    this.inventoryPermissions.set(null);
    this.profile.set(null);
    this.sessionVersion.update((version) => version + 1);
  }

  private storePermissions(permissions: string[] | null): void {
    this.inventoryPermissions.set(permissions);
    if (permissions) {
      sessionStorage.setItem('inventory.permissions', JSON.stringify(permissions));
    } else {
      sessionStorage.removeItem('inventory.permissions');
    }
  }

  private storeProfile(profile: SsoProfile | null): void {
    this.profile.set(profile);
    if (profile) {
      sessionStorage.setItem('inventory.profile', JSON.stringify(profile));
    } else {
      sessionStorage.removeItem('inventory.profile');
    }
  }

  private extractProfile(value: unknown): SsoProfile | null {
    const root = this.asRecord(value);
    const nested = root && this.asRecord(root['user']);
    const record = nested ?? root;
    if (!record) return null;

    const firstName = this.readString(record, ['First_name', 'first_name', 'firstName']);
    const lastName = this.readString(record, ['Last_name', 'last_name', 'lastName']);
    const name =
      this.readString(record, ['Full_name', 'full_name', 'fullName', 'name']) ||
      [firstName, lastName].filter(Boolean).join(' ');

    return {
      employeeNumber: this.readString(record, ['emp_no', 'employeeNumber', 'Employee_number']),
      name,
      division: this.readString(record, ['Division', 'division']),
      divisionDescription: this.readString(record, [
        'DivDesc',
        'divisionDescription',
        'division_description',
      ]),
    };
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  }

  private readString(
    record: Record<string, unknown>,
    keys: readonly string[],
  ): string {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === 'string' || typeof value === 'number') {
        const text = String(value).trim();
        if (text) return text;
      }
    }
    return '';
  }

  private readStoredRole(): InventoryRole | null {
    const role = sessionStorage.getItem('inventory.role');
    return role === 'USER' || role === 'ADMIN' || role === 'SUPERADMIN'
      ? role
      : null;
  }

  private readStoredPermissions(): string[] | null {
    const raw = sessionStorage.getItem('inventory.permissions');
    if (!raw) return null;
    try {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed)
        ? parsed.filter((item): item is string => typeof item === 'string')
        : null;
    } catch {
      return null;
    }
  }

  private readStoredProfile(): SsoProfile | null {
    const raw = sessionStorage.getItem('inventory.profile');
    if (!raw) return null;
    try {
      const parsed = this.asRecord(JSON.parse(raw));
      if (!parsed) return null;
      return {
        employeeNumber: String(parsed['employeeNumber'] ?? ''),
        name: String(parsed['name'] ?? ''),
        division: String(parsed['division'] ?? ''),
        divisionDescription: String(parsed['divisionDescription'] ?? ''),
      };
    } catch {
      return null;
    }
  }
}

import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { catchError, map, Observable, of, tap, throwError } from 'rxjs';
import { environment } from '../../environments/environment';

interface LoginResponse {
  access_token: string;
  token_type: string;
}

interface ValidateResponse {
  authenticated: boolean;
  role?: InventoryRole;
}

export type InventoryRole = 'USER' | 'ADMIN' | 'SUPERADMIN';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/auth`;
  readonly inventoryRole = signal<InventoryRole | null>(this.readStoredRole());

  hasSession(): boolean {
    return Boolean(sessionStorage.getItem('inventory.access_token'));
  }

  login(username: string, password: string): Observable<void> {
    return this.http
      .post<LoginResponse>(`${this.baseUrl}/login`, { username, password })
      .pipe(
        tap((response) => this.storeToken(response)),
        map(() => undefined),
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
            this.inventoryRole.set(response.role);
            sessionStorage.setItem('inventory.role', response.role);
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
    return this.http.post<unknown>(`${this.baseUrl}/me`, {}, { headers });
  }

  logout(): Observable<unknown> {
    const headers = this.authorizationHeaders();
    this.clearSession();

    if (!headers) {
      return of(null);
    }

    return this.http.post(`${this.baseUrl}/logout`, {}, { headers });
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
  }

  private clearSession(): void {
    sessionStorage.removeItem('inventory.access_token');
    sessionStorage.removeItem('inventory.token_type');
    sessionStorage.removeItem('inventory.role');
    this.inventoryRole.set(null);
  }

  private readStoredRole(): InventoryRole | null {
    const role = sessionStorage.getItem('inventory.role');
    return role === 'USER' || role === 'ADMIN' || role === 'SUPERADMIN'
      ? role
      : null;
  }
}

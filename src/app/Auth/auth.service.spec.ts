import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        AuthService,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(AuthService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
    sessionStorage.clear();
  });

  it('stores a PGC SSO bearer token after successful login', async () => {
    const login = firstValueFrom(service.login('test-user', 'test-password'));

    const request = httpTesting.expectOne(`${environment.apiUrl}/auth/login`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      username: 'test-user',
      password: 'test-password',
    });
    request.flush({
      access_token: 'test-access-token',
      token_type: 'Bearer',
    });

    const validation = httpTesting.expectOne(`${environment.apiUrl}/auth/validate`);
    expect(validation.request.headers.get('Authorization')).toBe('Bearer test-access-token');
    validation.flush({ authenticated: true, role: 'ADMIN', permissions: [] });

    await login;
    expect(sessionStorage.getItem('inventory.access_token')).toBe(
      'test-access-token',
    );
    expect(sessionStorage.getItem('inventory.token_type')).toBe('Bearer');
  });

  it('picks up a role upgrade when the session is revalidated', async () => {
    sessionStorage.setItem('inventory.access_token', 'upgrade-token');
    sessionStorage.setItem('inventory.token_type', 'Bearer');
    service.inventoryRole.set('ADMIN');

    const validation = firstValueFrom(service.validateSession());
    const request = httpTesting.expectOne(`${environment.apiUrl}/auth/validate`);
    request.flush({ authenticated: true, role: 'SUPERADMIN', permissions: null });

    expect(await validation).toBe(true);
    expect(service.inventoryRole()).toBe('SUPERADMIN');
    expect(sessionStorage.getItem('inventory.role')).toBe('SUPERADMIN');
  });

  it('clears an expired token when SSO rejects validation', async () => {
    sessionStorage.setItem('inventory.access_token', 'expired-token');
    sessionStorage.setItem('inventory.token_type', 'Bearer');

    const validation = firstValueFrom(service.validateSession());
    const request = httpTesting.expectOne(
      `${environment.apiUrl}/auth/validate`,
    );
    expect(request.request.headers.get('Authorization')).toBe(
      'Bearer expired-token',
    );
    request.flush(
      { message: 'Unauthorized access.' },
      { status: 401, statusText: 'Unauthorized' },
    );

    expect(await validation).toBe(false);
    expect(service.hasSession()).toBe(false);
  });

  it('clears the session when the employee has no inventory role', async () => {
    sessionStorage.setItem('inventory.access_token', 'unassigned-token');
    sessionStorage.setItem('inventory.token_type', 'Bearer');

    const validation = firstValueFrom(service.validateSession());
    const request = httpTesting.expectOne(
      `${environment.apiUrl}/auth/validate`,
    );
    request.flush(
      { message: 'Inventory access is not assigned.' },
      { status: 403, statusText: 'Forbidden' },
    );

    let rejected = false;
    try {
      await validation;
    } catch {
      rejected = true;
    }
    expect(rejected).toBe(true);
    expect(service.hasSession()).toBe(false);
    expect(sessionStorage.getItem('inventory.role')).toBeNull();
  });

  it('does not call the backend when there is no session token', async () => {
    expect(await firstValueFrom(service.validateSession())).toBe(false);
    httpTesting.expectNone(`${environment.apiUrl}/auth/validate`);
  });

  it('clears the local session immediately when logging out', async () => {
    sessionStorage.setItem('inventory.access_token', 'logout-token');
    sessionStorage.setItem('inventory.token_type', 'Bearer');
    sessionStorage.setItem('inventory.role', 'ADMIN');
    service.inventoryRole.set('ADMIN');

    const logout = firstValueFrom(service.logout());

    expect(service.hasSession()).toBe(false);
    expect(service.inventoryRole()).toBeNull();
    expect(sessionStorage.getItem('inventory.role')).toBeNull();

    const request = httpTesting.expectOne(`${environment.apiUrl}/auth/logout`);
    expect(request.request.headers.get('Authorization')).toBe('Bearer logout-token');
    request.flush({ success: true });
    await logout;
  });

  it('keeps the user logged out when the SSO logout request fails', async () => {
    sessionStorage.setItem('inventory.access_token', 'logout-token');
    sessionStorage.setItem('inventory.token_type', 'Bearer');

    const logout = firstValueFrom(service.logout());
    const request = httpTesting.expectOne(`${environment.apiUrl}/auth/logout`);
    request.flush(
      { message: 'Service unavailable' },
      { status: 503, statusText: 'Service unavailable' },
    );

    await logout;
    expect(service.hasSession()).toBe(false);
  });
});

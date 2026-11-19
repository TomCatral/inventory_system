import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../auth.service';

@Component({
  selector: 'app-sign-in',
  templateUrl: './sign-in.page.html',
  styleUrls: ['./sign-in.page.scss'],
  standalone: false,
})
export class SignInPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  username = '';
  password = '';
  isSubmitting = false;
  errorTitle = '';
  error = '';

  constructor() {
    if (this.route.snapshot.queryParamMap.get('error') === 'access') {
      this.errorTitle = 'Access not assigned';
      this.error = 'Your SSO account does not have inventory access assigned. Contact an inventory administrator.';
    }
  }

  async submit(): Promise<void> {
    if (this.isSubmitting || !this.username.trim() || !this.password) {
      return;
    }

    this.isSubmitting = true;
    this.errorTitle = '';
    this.error = '';
    try {
      await firstValueFrom(this.auth.login(this.username, this.password));
      await this.router.navigateByUrl('/home');
    } catch (error: unknown) {
      // Keep network/service outages silent on the sign-in form. The user can
      // retry without being shown a misleading or persistent warning banner.
      if (error instanceof HttpErrorResponse && error.status === 0) return;
      const warning = this.getErrorWarning(error);
      this.errorTitle = warning.title;
      this.error = warning.message;
    } finally {
      this.isSubmitting = false;
    }
  }

  clearError(): void {
    this.errorTitle = '';
    this.error = '';
  }

  private getErrorWarning(error: unknown): { title: string; message: string } {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 401 || error.status === 422) {
        return {
          title: 'Sign-in failed',
          message: 'The username or password you entered is incorrect. Check your credentials and try again.',
        };
      }
      if (error.status === 403) {
        return {
          title: 'Access denied',
          message: 'Your PGC SSO account is not authorized to access the Inventory System. Contact an inventory administrator.',
        };
      }
      if (error.status === 429) {
        return {
          title: 'Too many attempts',
          message: 'Please wait a few minutes before trying to sign in again.',
        };
      }
      if (error.status === 502 || error.status === 503 || error.status === 504) {
        return {
          title: 'PGC SSO temporarily unavailable',
          message: 'The authentication service is not responding. Please try again in a few minutes.',
        };
      }
      if (error.status >= 500) {
        return {
          title: 'Server error',
          message: 'The sign-in service encountered a problem. Please contact the system administrator if it continues.',
        };
      }
    }

    return {
      title: 'Unable to sign in',
      message: 'An unexpected error occurred. Please try again.',
    };
  }
}

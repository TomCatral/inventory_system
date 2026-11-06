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
  error = '';

  constructor() {
    if (this.route.snapshot.queryParamMap.get('error') === 'session') {
      this.error = 'Unable to verify your session. Please sign in again.';
    } else if (this.route.snapshot.queryParamMap.get('error') === 'access') {
      this.error = 'Your SSO account does not have inventory access assigned. Contact an inventory administrator.';
    } else if (this.route.snapshot.queryParamMap.get('logout') === 'failed') {
      this.error = 'You were signed out locally, but PGC SSO could not confirm sign-out.';
    }
  }

  async submit(): Promise<void> {
    if (this.isSubmitting || !this.username.trim() || !this.password) {
      return;
    }

    this.isSubmitting = true;
    this.error = '';
    try {
      await firstValueFrom(this.auth.login(this.username, this.password));
      await this.router.navigateByUrl('/home');
    } catch (error: unknown) {
      this.error = this.getErrorMessage(error);
    } finally {
      this.isSubmitting = false;
    }
  }

  clearError(): void {
    this.error = '';
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 0) {
        return 'Cannot reach the sign-in service. Check that the backend is running.';
      }
      if (error.status === 401 || error.status === 422) {
        return 'Invalid username or password.';
      }
      if (error.status === 503) {
        return 'PGC SSO is unavailable right now. Please try again.';
      }

      const message = error.error?.message;
      if (typeof message === 'string') {
        return message;
      }
    }

    return 'Unable to sign in. Please try again.';
  }
}

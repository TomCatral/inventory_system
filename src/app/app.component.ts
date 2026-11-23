import { Component, inject } from '@angular/core';
import { AuthService } from './Auth/auth.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: false,
})
export class AppComponent {
  private readonly auth = inject(AuthService);

  constructor() {
    this.auth.startSessionRefresh();
  }
}

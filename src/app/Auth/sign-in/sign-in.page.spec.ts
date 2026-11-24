import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { IonButton } from '@ionic/angular/ion-button';
import { IonContent } from '@ionic/angular/ion-content';
import { IonInput } from '@ionic/angular/ion-input';
import { provideIonicAngular } from '@ionic/angular/provide';
import { SignInPage } from './sign-in.page';

describe('SignInPage', () => {
  let component: SignInPage;
  let fixture: ComponentFixture<SignInPage>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [IonButton, IonContent, IonInput],
      providers: [provideRouter([]), provideIonicAngular()],
    });
    fixture = TestBed.createComponent(SignInPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('resets a cached login attempt when the page is shown again', () => {
    component.isSubmitting = true;
    component.passwordVisible.set(true);

    component.ionViewWillEnter();

    expect(component.isSubmitting).toBe(false);
    expect(component.passwordVisible()).toBe(false);
  });
});

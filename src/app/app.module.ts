import { NgModule } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { BrowserModule } from '@angular/platform-browser';
import { RouteReuseStrategy } from '@angular/router';

import { IonApp } from '@ionic/angular/ion-app';
import { IonRouterOutlet } from '@ionic/angular/ion-router-outlet';
import { IonicRouteStrategy } from '@ionic/angular/ionic-route-strategy';
import { provideIonicAngular } from '@ionic/angular/provide';

import { AppComponent } from './app.component';
import { AppRoutingModule } from './app-routing.module';
import { provideZard } from '@/shared/core/provider/providezard';
import { provideZardCharts } from '@/shared/components/chart/chart-echarts.provider';

@NgModule({
  declarations: [AppComponent],
  imports: [BrowserModule, IonApp, IonRouterOutlet, AppRoutingModule],
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideIonicAngular(),
    provideZard(),
    provideZardCharts(),
    provideHttpClient(),
  ],
  bootstrap: [AppComponent],
})
export class AppModule {}

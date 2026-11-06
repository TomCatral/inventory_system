import { NgModule } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { BrowserModule } from '@angular/platform-browser';
import { RouteReuseStrategy } from '@angular/router';

import { IonicModule, IonicRouteStrategy } from '@ionic/angular/lazy';

import { AppComponent } from './app.component';
import { AppRoutingModule } from './app-routing.module';
import { provideZard } from '@/shared/core/provider/providezard';
import { provideZardCharts } from '@/shared/components/chart/chart-echarts.provider';

@NgModule({
  declarations: [AppComponent],
  imports: [BrowserModule, IonicModule.forRoot(), AppRoutingModule],
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideZard(),
    provideZardCharts(),
    provideHttpClient(),
  ],
  bootstrap: [AppComponent],
})
export class AppModule {}

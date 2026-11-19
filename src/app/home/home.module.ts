import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonContent } from '@ionic/angular/ion-content';
import { FormsModule } from '@angular/forms';
import { HomePage } from './home.page';

import { HomePageRoutingModule } from './home-routing.module';
import { Dashboard01Component } from '../shared/blocks/dashboard-01/dashboard-01.component';


@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonContent,
    HomePageRoutingModule,
    Dashboard01Component,
  ],
  declarations: [HomePage]
})
export class HomePageModule {}

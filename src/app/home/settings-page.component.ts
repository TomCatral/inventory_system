import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import {
  EDarkModes,
  type ColorPalette,
  type DarkModeOptions,
  ZardDarkMode,
} from '../shared/services/dark-mode';

interface PaletteOption {
  readonly id: ColorPalette;
  readonly label: string;
  readonly swatch: string;
}

@Component({
  selector: 'app-settings-page',
  standalone: true,
  template: `
    <section class="mx-auto w-full max-w-5xl space-y-6 px-4 lg:px-8">
      <header>
        <p class="text-primary text-sm font-medium">Preferences</p>
        <h1 class="mt-1 text-3xl font-semibold tracking-tight">Settings</h1>
        <p class="text-muted-foreground mt-1 text-sm">Choose how Inventory System looks on this device.</p>
      </header>

      <section class="rounded-xl border bg-card p-5 shadow-sm md:p-7">
        <div class="border-b pb-4">
          <h2 class="font-semibold">Appearance</h2>
          <p class="text-muted-foreground mt-1 text-sm">Choose light, dark, or follow your device setting.</p>
        </div>
        <div class="mt-5 grid gap-3 sm:grid-cols-3">
          @for (mode of modes; track mode.value) {
            <button
              type="button"
              class="app-button app-button-secondary min-h-16 justify-start"
              [class.border-primary]="theme.currentTheme() === mode.value"
              [class.bg-primary/5]="theme.currentTheme() === mode.value"
              [attr.aria-pressed]="theme.currentTheme() === mode.value"
              (click)="setMode(mode.value)"
            >
              <span class="grid size-8 place-items-center rounded-full bg-muted text-foreground">{{ mode.icon }}</span>
              <span class="text-left">
                <span class="block">{{ mode.label }}</span>
                <span class="text-muted-foreground block text-xs font-normal">{{ mode.description }}</span>
              </span>
            </button>
          }
        </div>
      </section>

      <section class="rounded-xl border bg-card p-5 shadow-sm md:p-7">
        <div class="border-b pb-4">
          <h2 class="font-semibold">Color palette</h2>
          <p class="text-muted-foreground mt-1 text-sm">Choose an accent color for buttons, highlights, and navigation.</p>
        </div>
        <div class="mt-5 flex flex-wrap gap-3">
          @for (palette of palettes; track palette.id) {
            <button
              type="button"
              class="app-button app-button-secondary"
              [class.border-primary]="theme.currentPalette() === palette.id"
              [attr.aria-pressed]="theme.currentPalette() === palette.id"
              (click)="setPalette(palette.id)"
            >
              <span class="size-4 rounded-full" [style.backgroundColor]="palette.swatch"></span>
              {{ palette.label }}
              @if (theme.currentPalette() === palette.id) {
                <span class="sr-only">(selected)</span>
              }
            </button>
          }
        </div>
      </section>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsPageComponent {
  protected readonly theme = inject(ZardDarkMode);
  protected readonly modes: readonly {
    value: DarkModeOptions;
    label: string;
    description: string;
    icon: string;
  }[] = [
    { value: EDarkModes.LIGHT, label: 'Light', description: 'Always use light colors', icon: '☀' },
    { value: EDarkModes.DARK, label: 'Dark', description: 'Always use dark colors', icon: '☾' },
    { value: EDarkModes.SYSTEM, label: 'System', description: 'Match this device setting', icon: '◐' },
  ];
  protected readonly palettes: readonly PaletteOption[] = [
    { id: 'green', label: 'Green', swatch: '#247a4b' },
    { id: 'blue', label: 'Blue', swatch: '#2563a6' },
    { id: 'violet', label: 'Violet', swatch: '#7046a8' },
    { id: 'amber', label: 'Amber', swatch: '#a05b0d' },
  ];

  protected setMode(mode: DarkModeOptions): void {
    this.theme.toggleTheme(mode);
  }

  protected setPalette(palette: ColorPalette): void {
    this.theme.setPalette(palette);
  }
}

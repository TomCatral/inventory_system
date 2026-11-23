import { isPlatformBrowser } from '@angular/common';
import {
  afterNextRender,
  computed,
  DOCUMENT,
  effect,
  inject,
  Injectable,
  PLATFORM_ID,
  signal,
} from '@angular/core';

export enum EDarkModes {
  LIGHT = 'light',
  DARK = 'dark',
}
export type DarkModeOptions = EDarkModes.LIGHT | EDarkModes.DARK;
export type ColorPalette = 'green' | 'blue' | 'violet' | 'amber';

@Injectable({
  providedIn: 'root',
})
export class ZardDarkMode {
  private readonly document = inject(DOCUMENT);

  private static readonly STORAGE_KEY = 'theme';
  private static readonly PALETTE_STORAGE_KEY = 'color-palette';
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly themeSignal = signal<DarkModeOptions>(EDarkModes.LIGHT);
  private readonly paletteSignal = signal<ColorPalette>('green');
  private readonly initialized = signal(false);
  readonly themeMode = computed(() => this.themeSignal());

  constructor() {
    if (this.isBrowser) {
      effect(() => {
        if (!this.initialized()) {
          return;
        }
        const theme = this.themeSignal();
        const isDarkMode = this.isDarkModeActive(theme);
        this.updateThemeMode(isDarkMode, theme);
      });

      afterNextRender({
        write: () => {
          // Only initialize if init() wasn't already called synchronously (e.g., in tests)
          if (!this.initialized()) {
            this.initializeTheme();
          }
        },
      });
    }
  }

  init() {
    if (!this.initialized() && this.isBrowser) {
      this.initializeTheme();
    }
  }

  toggleTheme(targetMode?: DarkModeOptions): void {
    if (!this.isBrowser) {
      return;
    }

    this.applyTheme(targetMode ?? (this.themeMode() === EDarkModes.DARK ? EDarkModes.LIGHT : EDarkModes.DARK));
  }

  /**
   * Returns the app-selected light or dark theme.
   * Call currentTheme() to access the value or use it directly in templates where signals are supported.
   * @example service.currentTheme() // returns "light" or "dark"
   */
  get currentTheme() {
    return this.themeSignal.asReadonly();
  }

  get currentPalette() {
    return this.paletteSignal.asReadonly();
  }

  setPalette(palette: ColorPalette): void {
    if (!this.isBrowser) {
      return;
    }

    try {
      localStorage.setItem(ZardDarkMode.PALETTE_STORAGE_KEY, palette);
    } catch (error) {
      console.warn('Failed to save color palette to localStorage:', error);
    }
    this.paletteSignal.set(palette);
    this.document.documentElement.setAttribute('data-palette', palette);
  }

  private initializeTheme(): void {
    const palette = this.getStoredPalette();
    this.paletteSignal.set(palette);
    this.document.documentElement.setAttribute('data-palette', palette);

    this.applyTheme(this.getStoredTheme());
    this.initialized.set(true);

    const theme = this.themeSignal();
    this.updateThemeMode(this.isDarkModeActive(theme), theme);
  }

  private getStoredPalette(): ColorPalette {
    if (!this.isBrowser) {
      return 'green';
    }

    try {
      const value = localStorage.getItem(ZardDarkMode.PALETTE_STORAGE_KEY);
      if (value === 'green' || value === 'blue' || value === 'violet' || value === 'amber') {
        return value;
      }
    } catch (error) {
      console.warn('Failed to read color palette from localStorage:', error);
    }
    return 'green';
  }

  private getStoredTheme(): DarkModeOptions {
    if (!this.isBrowser) {
      return EDarkModes.LIGHT;
    }

    try {
      return localStorage.getItem(ZardDarkMode.STORAGE_KEY) === EDarkModes.DARK
        ? EDarkModes.DARK
        : EDarkModes.LIGHT;
    } catch (error) {
      console.warn('Failed to read theme from localStorage:', error);
      return EDarkModes.LIGHT;
    }
  }

  private applyTheme(theme: DarkModeOptions): void {
    if (!this.isBrowser) {
      return;
    }

    try {
      localStorage.setItem(ZardDarkMode.STORAGE_KEY, theme);
    } catch (error) {
      console.warn('Failed to save theme to localStorage:', error);
    }
    this.themeSignal.set(theme);

  }

  private updateThemeMode(isDarkMode: boolean, themeMode: EDarkModes): void {
    const html = this.document.documentElement;
    html.classList.toggle('dark', isDarkMode);
    html.setAttribute('data-theme', themeMode);
    html.style.colorScheme = themeMode;
  }

  private isDarkModeActive(currentTheme: DarkModeOptions): boolean {
    if (!this.isBrowser) {
      return false;
    }

    return currentTheme === EDarkModes.DARK;
  }
}

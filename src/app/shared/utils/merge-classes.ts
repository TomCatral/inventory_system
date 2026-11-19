import { type ClassValue, clsx } from 'clsx';

export type { ClassValue };

/** Combines conditional component classes into a single class attribute. */
export function mergeClasses(...inputs: ClassValue[]): string {
  return clsx(inputs);
}

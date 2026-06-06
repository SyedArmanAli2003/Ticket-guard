"use client"
// Thin wrapper around next-themes. Uses the CLASS strategy (adds `light` / `dark`
// to <html>) so our CSS-var token system in globals.css flips with one class.
// next-themes injects a tiny blocking script before paint → no theme flash.
import { ThemeProvider as NextThemesProvider, type ThemeProviderProps } from "next-themes"

export default function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>
}

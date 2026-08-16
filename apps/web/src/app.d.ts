import type { User, Session } from 'better-auth'

declare global {
  // Vite `define` (siehe vite.config.ts): Build-Target. Auf dem Pi immer 'node';
  // erlaubt dual-target Dateien (api.ts, datentransfer-Seite) byte-gleich zum
  // App-Repo — der 'app'-Zweig wird per DCE entfernt.
  const __STOQR_TARGET__: 'node' | 'app'

  namespace App {
    interface Locals {
      user: User | null
      session: Session | null
    }
    interface PageData {
      user: User | null
    }
  }
}

export {}

// ---------------------------------------------------------------------------
// transfer.app — Pi-Stub (App-only im App-Repo)
// ---------------------------------------------------------------------------
// Diese Datei existiert im Pi-Repo NUR, damit die dynamischen Imports
// `await import('$lib/client/transfer.app')` in der datentransfer-Seite
// typpruefbar bleiben und die Seite byte-gleich zum App-Repo bleiben kann.
//
// Auf dem Pi ist __STOQR_TARGET__ immer 'node'; die aufrufenden 'app'-Zweige
// werden per DCE (vite `define`) entfernt, dieser Code laeuft also NIE. Die
// volle Implementierung (Capacitor Filesystem/Share) lebt ausschliesslich im
// App-Repo (Labushuya/stoqr-android).

import type { ExportTier } from '@stoqr/db/transfer'

export interface ExportResult {
  scope: ExportTier
  filename: string
  uri: string
  shared: boolean
}

export interface ImportResult {
  ok: boolean
  [key: string]: unknown
}

export async function exportToFile(_scope: ExportTier): Promise<ExportResult> {
  throw new Error('exportToFile: App-only stub, nicht auf dem Pi (node-Target) erreichbar')
}

export async function importFromText(_fileText: string): Promise<ImportResult> {
  throw new Error('importFromText: App-only stub, nicht auf dem Pi (node-Target) erreichbar')
}

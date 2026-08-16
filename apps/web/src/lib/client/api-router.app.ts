// ---------------------------------------------------------------------------
// api-router.app — Pi-Stub (App-only im App-Repo)
// ---------------------------------------------------------------------------
// Diese Datei existiert im Pi-Repo NUR, damit der dynamische Import
// `await import('./api-router.app')` in api.ts typpruefbar bleibt und die
// dort geteilte Datei byte-gleich zum App-Repo bleiben kann.
//
// Auf dem Pi ist __STOQR_TARGET__ immer 'node'; der aufrufende 'app'-Zweig in
// api.ts wird per DCE (vite `define`) entfernt, dieser Code laeuft also NIE.
// Die volle Implementierung (SQLite/Query-Router) lebt ausschliesslich im
// App-Repo (Labushuya/stoqr-android).

export async function routeApp(_path: string, _init?: RequestInit): Promise<Response> {
  throw new Error('routeApp: App-only stub, nicht auf dem Pi (node-Target) erreichbar')
}

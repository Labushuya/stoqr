<script lang="ts">
  // ---------------------------------------------------------------------------
  // DepositBadge — kleines Pfand-Pill (G48). EINE einheitliche Darstellung fuer
  // Pfand an allen Stellen (Artikel-Detailseite, Inventar-Karten, Einstellungen>
  // Artikel, Einkaufsliste, Einkauf). Eigene, neutrale Farbe (Blau) — bewusst NICHT
  // orange (=Angebot/reserviert) oder gruen (=guenstigster), damit Pfand als eigenes
  // Konzept erkennbar bleibt.
  //
  //  depositCt > 0        → „Pfand 0,25 €"
  //  depositCt == null    → „Pfand" (pflichtig, Betrag noch offen)
  //  unknown == true      → „Pfand ?" (nicht berechenbar — Gebinde fehlt)
  // ---------------------------------------------------------------------------

  let { depositCt = null, unknown = false }: { depositCt?: number | null; unknown?: boolean } = $props()

  const label = $derived(
    unknown
      ? 'Pfand ?'
      : depositCt != null && depositCt > 0
        ? `Pfand ${(depositCt / 100).toLocaleString('de-DE', { minimumFractionDigits: 2 })} €`
        : 'Pfand'
  )
  const title = $derived(
    unknown ? 'Pfand nicht berechenbar — Gebinde fehlt' : 'Pfand (Leergut)'
  )
</script>

<span class="deposit-badge" class:deposit-badge--unknown={unknown} {title}>{label}</span>

<style>
  .deposit-badge {
    display: inline-block;
    font-size: 10px;
    font-weight: 700;
    padding: 1px 6px;
    border-radius: 999px;
    /* Eigene Pfand-Farbe (Blau) — abgesetzt von orange/gruen. */
    background: #e0edff;
    color: #1d4ed8;
    vertical-align: middle;
    line-height: 1.4;
    white-space: nowrap;
  }
  .deposit-badge--unknown {
    background: var(--color-surface-sunken);
    color: var(--color-text-muted);
    font-weight: 600;
  }
</style>

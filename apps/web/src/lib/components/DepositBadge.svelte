<script lang="ts">
  // ---------------------------------------------------------------------------
  // DepositBadge — kleines Pfand-Pill (G48/G49). EINE einheitliche Darstellung fuer
  // Pfand an allen Stellen. Eigene, neutrale Farbe (Blau) — bewusst NICHT orange
  // (=Angebot/reserviert) oder gruen (=guenstigster). Pfand ist an count-Einheiten
  // gebunden (Flasche/Dose/Stück), daher immer ein konkreter Betrag.
  //
  //  depositCt > 0     → „Pfand 0,25 €"
  //  depositCt == null → „Pfand" (pflichtig, Betrag noch offen)
  // ---------------------------------------------------------------------------

  let { depositCt = null }: { depositCt?: number | null } = $props()

  const label = $derived(
    depositCt != null && depositCt > 0
      ? `Pfand ${(depositCt / 100).toLocaleString('de-DE', { minimumFractionDigits: 2 })} €`
      : 'Pfand'
  )
</script>

<span class="deposit-badge" title="Pfand (Leergut)">{label}</span>

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
</style>

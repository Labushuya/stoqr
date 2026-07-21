<script lang="ts">
  import { toast } from '$lib/stores/toast'

  // ---------------------------------------------------------------------------
  // ProductForm — EINE vollstaendige Artikel-Stammdaten-Bearbeitung (G11).
  //
  // Deckt name, brand, gtin (EAN), categoryId, imageUrl, defaultUnit, description
  // ab und wird ueberall identisch verwendet (Einstellungen>Artikel, Inventar-
  // Detailseite, Inventar-Anlegen). Modus:
  //  - product == null → Anlegen (POST /api/products)
  //  - product gesetzt → Bearbeiten (PATCH /api/products/[id])
  // onSaved(product) liefert das gespeicherte/angelegte Produkt zurueck.
  // ---------------------------------------------------------------------------

  type Category = { id: string; name: string }
  type UnitOption = { symbol: string; name: string }
  type ProductInput = {
    id: string
    name: string
    brand: string | null
    gtin: string | null
    categoryId: string | null
    imageUrl: string | null
    defaultUnit: string
    description: string | null
  }

  let {
    open,
    product = null,
    categories,
    units,
    showUnit = true,
    onSaved,
    onClose,
  }: {
    open: boolean
    product?: ProductInput | null
    categories: Category[]
    units: UnitOption[]
    // Auf der Detailseite fuehrt der eigene defaultUnit-Editor → Feld hier ausblenden.
    showUnit?: boolean
    onSaved: (product: Record<string, unknown>) => void
    onClose: () => void
  } = $props()

  const isEdit = $derived(product != null)

  // Draft-Felder, aus product geseedet (bzw. leer beim Anlegen).
  let fName = $state('')
  let fBrand = $state('')
  let fGtin = $state('')
  let fCategoryId = $state('')
  let fImageUrl = $state('')
  let fUnit = $state('piece')
  let fDescription = $state('')
  let saving = $state(false)
  let error = $state<string | null>(null)

  // Bei jedem Oeffnen (oder Wechsel des product) neu seeden.
  let seededFor = $state<string | null>(null)
  $effect(() => {
    if (!open) { seededFor = null; return }
    const key = product?.id ?? '__new__'
    if (seededFor === key) return
    seededFor = key
    fName = product?.name ?? ''
    fBrand = product?.brand ?? ''
    fGtin = product?.gtin ?? ''
    fCategoryId = product?.categoryId ?? ''
    fImageUrl = product?.imageUrl ?? ''
    fUnit = product?.defaultUnit ?? 'piece'
    fDescription = product?.description ?? ''
    error = null
  })

  async function save() {
    const name = fName.trim()
    if (!name) { error = 'Name ist erforderlich.'; return }
    saving = true
    error = null
    const payload: Record<string, unknown> = {
      name,
      brand: fBrand.trim() || null,
      gtin: fGtin.trim() || null,
      categoryId: fCategoryId || null,
      imageUrl: fImageUrl.trim() || null,
      description: fDescription.trim() || null,
    }
    if (showUnit) payload.defaultUnit = fUnit
    try {
      const url = isEdit ? `/api/products/${product!.id}` : '/api/products'
      const method = isEdit ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { error = String(body?.error ?? `Fehler ${res.status}`); return }
      toast.success(isEdit ? 'Artikel gespeichert' : 'Artikel angelegt')
      onSaved(body)
    } catch {
      error = 'Netzwerkfehler.'
    } finally {
      saving = false
    }
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose()
  }

  // Backdrop-Close nur, wenn Klick auf dem Backdrop begann UND endete — sonst
  // schliesst Text-Markieren (Maus zieht raus) faelschlich (G16-3).
  let downOnBackdrop = false
  function onBackdropPointerDown(e: PointerEvent) {
    downOnBackdrop = e.target === e.currentTarget
  }
  function onBackdropClick(e: MouseEvent) {
    const onBackdrop = downOnBackdrop && e.target === e.currentTarget
    downOnBackdrop = false
    if (onBackdrop) onClose()
  }
</script>

{#if open}
  <div class="pf-backdrop" role="presentation" onpointerdown={onBackdropPointerDown} onclick={onBackdropClick}>
    <div
      class="pf-modal"
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      aria-label={isEdit ? 'Artikel bearbeiten' : 'Neuen Artikel anlegen'}
      onkeydown={onKeydown}
    >
      <h2 class="pf-title">{isEdit ? 'Artikel bearbeiten' : 'Neuen Artikel anlegen'}</h2>

      {#if error}
        <p class="pf-error" role="alert">{error}</p>
      {/if}

      <div class="pf-grid">
        <label class="pf-field pf-field--full">
          <span class="pf-label">Name *</span>
          <input class="pf-input" type="text" bind:value={fName} maxlength="255" placeholder="z.B. Vollmilch" />
        </label>

        <label class="pf-field">
          <span class="pf-label">Marke</span>
          <input class="pf-input" type="text" bind:value={fBrand} maxlength="128" placeholder="optional" />
        </label>

        <label class="pf-field">
          <span class="pf-label">EAN / Barcode</span>
          <input class="pf-input" type="text" inputmode="numeric" bind:value={fGtin} maxlength="14" placeholder="optional" />
        </label>

        <label class="pf-field">
          <span class="pf-label">Kategorie</span>
          <select class="pf-input" bind:value={fCategoryId}>
            <option value="">— keine —</option>
            {#each categories as cat (cat.id)}
              <option value={cat.id}>{cat.name}</option>
            {/each}
          </select>
        </label>

        {#if showUnit}
          <label class="pf-field">
            <span class="pf-label">Standard-Einheit</span>
            <select class="pf-input" bind:value={fUnit}>
              {#each units as u (u.symbol)}
                <option value={u.symbol}>{u.name}</option>
              {/each}
            </select>
          </label>
        {/if}

        <label class="pf-field pf-field--full">
          <span class="pf-label">Bild-URL</span>
          <input class="pf-input" type="text" bind:value={fImageUrl} placeholder="/media/… oder https://…" />
        </label>

        {#if fImageUrl.trim()}
          <div class="pf-field pf-field--full pf-preview">
            <img src={fImageUrl.trim()} alt="Vorschau" class="pf-preview-img" />
          </div>
        {/if}

        <label class="pf-field pf-field--full">
          <span class="pf-label">Beschreibung</span>
          <textarea class="pf-input pf-textarea" bind:value={fDescription} rows="2" placeholder="optional"></textarea>
        </label>
      </div>

      <div class="pf-actions">
        <button class="pf-btn pf-btn--ghost" type="button" onclick={onClose} disabled={saving}>Abbrechen</button>
        <button class="pf-btn pf-btn--primary" type="button" onclick={save} disabled={saving}>
          {#if saving}<span class="pf-spinner" aria-hidden="true"></span>{/if}
          {isEdit ? 'Speichern' : 'Anlegen'}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .pf-backdrop {
    position: fixed;
    inset: 0;
    z-index: 100;
    background: rgba(0, 0, 0, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-4);
  }
  .pf-modal {
    background: var(--color-surface-raised, var(--color-surface));
    border: 1px solid var(--color-border);
    border-radius: var(--radius-xl, 16px);
    padding: var(--space-6);
    width: 100%;
    max-width: 520px;
    max-height: 90vh;
    overflow-y: auto;
    box-shadow: var(--shadow-lg, 0 10px 40px rgba(0, 0, 0, 0.2));
  }
  .pf-title {
    font-family: var(--font-display, inherit);
    font-size: var(--text-lg);
    font-weight: 700;
    color: var(--color-text-primary);
    margin: 0 0 var(--space-4);
  }
  .pf-error {
    background: var(--color-danger-subtle, #fee2e2);
    color: var(--color-danger, #dc2626);
    border: 1px solid rgba(220, 38, 38, 0.2);
    border-radius: var(--radius-md);
    padding: var(--space-2) var(--space-3);
    font-size: var(--text-sm);
    margin: 0 0 var(--space-3);
  }
  .pf-grid {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
  }
  .pf-field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    flex: 1 1 200px;
  }
  .pf-field--full { flex-basis: 100%; }
  .pf-label {
    font-size: var(--text-xs);
    font-weight: 600;
    color: var(--color-text-secondary);
  }
  .pf-input {
    height: 40px;
    padding: 0 var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
    background: var(--color-surface);
    color: var(--color-text-primary);
    font-family: var(--font-body, inherit);
    font-size: var(--text-base);
    outline: none;
    box-sizing: border-box;
    appearance: none;
  }
  .pf-input:focus {
    border-color: var(--color-border-focus, var(--color-primary));
    box-shadow: 0 0 0 3px rgba(196, 103, 58, 0.15);
  }
  .pf-textarea { height: auto; padding: var(--space-2) var(--space-3); resize: vertical; }
  .pf-preview { align-items: flex-start; }
  .pf-preview-img {
    max-height: 80px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border);
    object-fit: contain;
    background: var(--color-surface-sunken);
  }
  .pf-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
    margin-top: var(--space-5);
  }
  .pf-btn {
    height: 40px;
    padding: 0 var(--space-5);
    border-radius: var(--radius-md);
    font-family: var(--font-body, inherit);
    font-size: var(--text-sm);
    font-weight: 600;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
  }
  .pf-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .pf-btn--ghost {
    border: 1px solid var(--color-border);
    background: transparent;
    color: var(--color-text-secondary);
  }
  .pf-btn--primary {
    border: none;
    background: var(--color-primary);
    color: var(--color-text-inverse, #fff);
  }
  .pf-spinner {
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255, 255, 255, 0.4);
    border-top-color: #fff;
    border-radius: 50%;
    animation: pf-spin 600ms linear infinite;
  }
  @keyframes pf-spin { to { transform: rotate(360deg); } }
</style>

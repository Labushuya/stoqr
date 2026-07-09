<script lang="ts">
  import { goto } from '$app/navigation'
  import type { PageData } from './$types'

  // ── Types ──────────────────────────────────────────────────────────────────

  type Category = {
    id: string
    name: string
    icon: string | null
    slug: string
  }

  type ProductResult = {
    id: string
    name: string
    brand: string | null
    imageUrl: string | null
    categoryId: string | null
    category: Category | null
  }

  type LocationTree = {
    id: string
    name: string
    icon: string | null
    storages: {
      id: string
      name: string
      places: { id: string; name: string }[]
    }[]
  }

  type MhdRow = {
    id: number
    quantity: string
    mhd: string
  }

  // ── Props ──────────────────────────────────────────────────────────────────

  let { data }: { data: PageData } = $props()

  // ── State ──────────────────────────────────────────────────────────────────

  // svelte-ignore state_referenced_locally
  let locationTree = $state<LocationTree[]>(data.locations as LocationTree[])
  // svelte-ignore state_referenced_locally
  let unitOptions = $state(data.units as { id: string; name: string; symbol: string }[])

  // Step 1 — Product search
  // svelte-ignore state_referenced_locally
  let searchQuery = $state(
    (data.preselectedProduct as ProductResult | null)?.name ?? ''
  )
  let searchResults = $state<ProductResult[]>([])
  let searchLoading = $state(false)
  // svelte-ignore state_referenced_locally
  let selectedProduct = $state<ProductResult | null>(
    (data.preselectedProduct as ProductResult | null) ?? null
  )
  let searchDebounceTimer = $state<ReturnType<typeof setTimeout> | null>(null)

  // Step 2 — Location
  let formLocationId = $state('')
  let formStorageId = $state('')
  let formPlaceId = $state('')
  let formUnit = $state(unitOptions[0]?.symbol ?? 'Stück')

  // Step 3 — MHD rows
  let rowCounter = $state(0)
  let mhdRows = $state<MhdRow[]>([{ id: ++rowCounter, quantity: '1', mhd: '' }])

  // Save state
  let saving = $state(false)

  // Toast
  type Toast = { id: number; message: string; type: 'success' | 'error' }
  let toasts = $state<Toast[]>([])
  let toastCounter = 0

  // ── Derived ────────────────────────────────────────────────────────────────

  const formStorages = $derived(() => {
    if (!formLocationId) return []
    const loc = locationTree.find((l) => l.id === formLocationId)
    return loc?.storages ?? []
  })

  const formPlaces = $derived(() => {
    if (!formStorageId) return []
    const st = formStorages().find((s) => s.id === formStorageId)
    return st?.places ?? []
  })

  const totalQuantity = $derived(() => {
    return mhdRows.reduce((sum, row) => {
      const qty = parseFloat(row.quantity) || 0
      return sum + qty
    }, 0)
  })

  const canSave = $derived(
    () =>
      selectedProduct !== null &&
      mhdRows.length > 0 &&
      mhdRows.every((r) => parseFloat(r.quantity) > 0)
  )

  // ── Toast helpers ──────────────────────────────────────────────────────────

  function showToast(message: string, type: 'success' | 'error' = 'success') {
    const id = ++toastCounter
    toasts = [...toasts, { id, message, type }]
    setTimeout(() => {
      toasts = toasts.filter((t) => t.id !== id)
    }, 3500)
  }

  // ── Step 1: Product search ─────────────────────────────────────────────────

  function onSearchInput() {
    if (searchDebounceTimer !== null) {
      clearTimeout(searchDebounceTimer)
    }
    const q = searchQuery.trim()
    if (!q) {
      searchResults = []
      return
    }
    searchDebounceTimer = setTimeout(async () => {
      searchLoading = true
      try {
        const res = await fetch(`/api/products?q=${encodeURIComponent(q)}`)
        if (res.ok) {
          searchResults = await res.json()
        }
      } catch {
        // silent
      } finally {
        searchLoading = false
      }
    }, 300)
  }

  function selectProduct(p: ProductResult) {
    selectedProduct = p
    searchQuery = p.name
    searchResults = []
  }

  function clearProduct() {
    selectedProduct = null
    searchQuery = ''
    searchResults = []
  }

  // ── Step 2: Location ───────────────────────────────────────────────────────

  function onLocationChange() {
    formStorageId = ''
    formPlaceId = ''
  }

  function onStorageChange() {
    formPlaceId = ''
  }

  // ── Step 3: MHD rows ───────────────────────────────────────────────────────

  function addRow() {
    mhdRows = [...mhdRows, { id: ++rowCounter, quantity: '1', mhd: '' }]
  }

  function removeRow(id: number) {
    if (mhdRows.length <= 1) return
    mhdRows = mhdRows.filter((r) => r.id !== id)
  }

  function updateRow(id: number, field: 'quantity' | 'mhd', value: string) {
    mhdRows = mhdRows.map((r) => (r.id === id ? { ...r, [field]: value } : r))
  }

  // ── Save ───────────────────────────────────────────────────────────────────

  async function saveAll() {
    if (!selectedProduct || saving) return
    saving = true

    try {
      const results = await Promise.allSettled(
        mhdRows.map((row) =>
          fetch('/api/inventory', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              productId: selectedProduct!.id,
              placeId: formPlaceId || undefined,
              quantity: parseFloat(row.quantity) || 1,
              unit: formUnit,
              bestBeforeDate: row.mhd || undefined,
            }),
          }).then((res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            return res
          })
        )
      )

      const failed = results.filter((r) => r.status === 'rejected').length
      const succeeded = results.length - failed

      if (failed === 0) {
        showToast(`${succeeded} Eintrag${succeeded !== 1 ? 'e' : ''} hinzugefügt`)
        setTimeout(() => goto('/inventar'), 800)
      } else if (succeeded > 0) {
        showToast(`${succeeded} gespeichert, ${failed} fehlgeschlagen`, 'error')
      } else {
        showToast('Fehler beim Speichern', 'error')
      }
    } catch {
      showToast('Netzwerkfehler', 'error')
    } finally {
      saving = false
    }
  }

  // ── Category helpers ───────────────────────────────────────────────────────

  const CATEGORY_ICONS: Record<string, string> = {
    getraenke: '🧃',
    milchprodukte: '🥛',
    fleisch: '🥩',
    gemuese: '🥦',
    obst: '🍎',
    brot: '🍞',
    snacks: '🍿',
    tiefkuehl: '🧊',
    konserven: '🥫',
    gewuerze: '🧂',
    suesses: '🍫',
    sonstiges: '📦',
  }

  function productIcon(p: ProductResult): string {
    if (p.category?.icon) return p.category.icon
    const slug = p.category?.slug ?? ''
    for (const [key, icon] of Object.entries(CATEGORY_ICONS)) {
      if (slug.includes(key)) return icon
    }
    return '📦'
  }
</script>

<!-- ── Page ──────────────────────────────────────────────────────────────── -->

<div class="page">

  <!-- Back link + title -->
  <div class="page-header">
    <a class="back-link" href="/inventar">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M10 3L5 8l5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      Inventar
    </a>
    <h1 class="page-title">Bestand hinzufügen</h1>
  </div>

  <!-- Progress indicator -->
  <div class="progress-bar" aria-hidden="true">
    <div class="progress-step" class:progress-step--active={true} class:progress-step--done={selectedProduct !== null}>
      <span class="progress-num">1</span>
      <span class="progress-label">Produkt</span>
    </div>
    <div class="progress-connector" class:progress-connector--done={selectedProduct !== null}></div>
    <div class="progress-step" class:progress-step--active={selectedProduct !== null} class:progress-step--done={selectedProduct !== null && formPlaceId !== ''}>
      <span class="progress-num">2</span>
      <span class="progress-label">Ort</span>
    </div>
    <div class="progress-connector" class:progress-connector--done={selectedProduct !== null && formPlaceId !== ''}></div>
    <div class="progress-step" class:progress-step--active={selectedProduct !== null}>
      <span class="progress-num">3</span>
      <span class="progress-label">MHD</span>
    </div>
  </div>

  <!-- ── Step 1: Produkt suchen ─────────────────────────────────────────── -->

  <section class="step-card">
    <div class="step-header">
      <div class="step-badge" class:step-badge--done={selectedProduct !== null}>
        {#if selectedProduct !== null}
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M2 6l2.5 2.5L10 3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        {:else}
          1
        {/if}
      </div>
      <h2 class="step-title">Produkt wählen</h2>
    </div>

    {#if selectedProduct !== null}
      <!-- Selected product pill -->
      <div class="selected-product">
        <span class="selected-icon" aria-hidden="true">{productIcon(selectedProduct)}</span>
        <div class="selected-info">
          <span class="selected-name">{selectedProduct.name}</span>
          {#if selectedProduct.brand}
            <span class="selected-brand">{selectedProduct.brand}</span>
          {/if}
        </div>
        <button class="selected-clear" type="button" aria-label="Produkt entfernen" onclick={clearProduct}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M3 3l8 8M11 3L3 11" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
    {:else}
      <!-- Search input -->
      <div class="search-wrap">
        <svg class="search-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="7" cy="7" r="5" stroke="currentColor" stroke-width="1.5"/>
          <path d="M10.5 10.5L14 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
        <input
          class="search-input"
          type="search"
          placeholder="Produktname eingeben…"
          bind:value={searchQuery}
          oninput={onSearchInput}
          autocomplete="off"
          aria-label="Produkt suchen"
          aria-autocomplete="list"
        />
        {#if searchLoading}
          <span class="search-spinner" aria-hidden="true"></span>
        {/if}
      </div>

      <!-- Results -->
      {#if searchResults.length > 0}
        <ul class="results-list" role="listbox" aria-label="Suchergebnisse">
          {#each searchResults as p (p.id)}
            <li role="option" aria-selected="false">
              <button class="result-item" type="button" onclick={() => selectProduct(p)}>
                <span class="result-icon" aria-hidden="true">{productIcon(p)}</span>
                <span class="result-info">
                  <span class="result-name">{p.name}</span>
                  {#if p.brand}
                    <span class="result-brand">{p.brand}</span>
                  {/if}
                </span>
                {#if p.category}
                  <span class="result-cat">{p.category.name}</span>
                {/if}
              </button>
            </li>
          {/each}
        </ul>
      {:else if searchQuery.trim().length >= 2 && !searchLoading}
        <div class="no-results">
          <p class="no-results-text">Kein Treffer für <strong>„{searchQuery}"</strong></p>
          <a class="link-new-product" href="/inventar?new=1">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M7 2v10M2 7h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
            </svg>
            Neues Produkt anlegen
          </a>
        </div>
      {/if}
    {/if}
  </section>

  <!-- ── Step 2: Ort wählen ─────────────────────────────────────────────── -->

  <section class="step-card" class:step-card--disabled={selectedProduct === null}>
    <div class="step-header">
      <div class="step-badge" class:step-badge--done={formPlaceId !== ''}>
        {#if formPlaceId !== ''}
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M2 6l2.5 2.5L10 3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        {:else}
          2
        {/if}
      </div>
      <h2 class="step-title">Ort wählen</h2>
    </div>

    <div class="field-group">
      <!-- Location -->
      <div class="field">
        <label class="label" for="ea-loc">Ort</label>
        <select
          id="ea-loc"
          class="input"
          bind:value={formLocationId}
          onchange={onLocationChange}
          disabled={selectedProduct === null}
        >
          <option value="">Kein Ort</option>
          {#each locationTree as loc (loc.id)}
            <option value={loc.id}>{loc.icon ? loc.icon + ' ' : ''}{loc.name}</option>
          {/each}
        </select>
      </div>

      <!-- Storage -->
      {#if formLocationId && formStorages().length > 0}
        <div class="field">
          <label class="label" for="ea-storage">Lagerort</label>
          <select
            id="ea-storage"
            class="input"
            bind:value={formStorageId}
            onchange={onStorageChange}
          >
            <option value="">Kein Lagerort</option>
            {#each formStorages() as st (st.id)}
              <option value={st.id}>{st.name}</option>
            {/each}
          </select>
        </div>
      {/if}

      <!-- Place -->
      {#if formStorageId && formPlaces().length > 0}
        <div class="field">
          <label class="label" for="ea-place">Fach</label>
          <select id="ea-place" class="input" bind:value={formPlaceId}>
            <option value="">Kein Fach</option>
            {#each formPlaces() as pl (pl.id)}
              <option value={pl.id}>{pl.name}</option>
            {/each}
          </select>
        </div>
      {/if}
    </div>

    <!-- Unit -->
    <div class="field field--unit-row">
      <label class="label" for="ea-unit">Einheit</label>
      <select
        id="ea-unit"
        class="input input--unit"
        bind:value={formUnit}
        disabled={selectedProduct === null}
      >
        {#each unitOptions as u (u.id)}
          <option value={u.symbol}>{u.name}</option>
        {/each}
      </select>
    </div>
  </section>

  <!-- ── Step 3: MHD-Gruppen ────────────────────────────────────────────── -->

  <section class="step-card" class:step-card--disabled={selectedProduct === null}>
    <div class="step-header">
      <div class="step-badge">3</div>
      <h2 class="step-title">MHD-Gruppen</h2>
    </div>

    <div class="mhd-rows">
      {#each mhdRows as row (row.id)}
        <div class="mhd-row">
          <!-- Quantity -->
          <div class="field field--mhd-qty">
            <label class="label" for="mhd-qty-{row.id}">Anzahl</label>
            <input
              id="mhd-qty-{row.id}"
              class="input"
              type="number"
              min="0.01"
              step="0.01"
              value={row.quantity}
              oninput={(e) => updateRow(row.id, 'quantity', (e.target as HTMLInputElement).value)}
              disabled={selectedProduct === null}
              aria-label="Menge"
            />
          </div>

          <!-- MHD date -->
          <div class="field field--mhd-date">
            <label class="label" for="mhd-date-{row.id}">MHD</label>
            <input
              id="mhd-date-{row.id}"
              class="input"
              type="date"
              value={row.mhd}
              oninput={(e) => updateRow(row.id, 'mhd', (e.target as HTMLInputElement).value)}
              disabled={selectedProduct === null}
              aria-label="Mindesthaltbarkeitsdatum"
            />
          </div>

          <!-- Delete row -->
          <button
            class="mhd-remove"
            type="button"
            aria-label="Zeile entfernen"
            disabled={mhdRows.length <= 1 || selectedProduct === null}
            onclick={() => removeRow(row.id)}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M2 4h10M5 4V3h4v1M4.5 4v7h5V4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>
      {/each}
    </div>

    <!-- Add row button + total -->
    <div class="mhd-footer">
      <button
        class="btn-add-row"
        type="button"
        disabled={selectedProduct === null}
        onclick={addRow}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <path d="M7 2v10M2 7h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
        Zeile hinzufügen
      </button>

      <span class="total-label">
        Gesamt: <strong>{totalQuantity() % 1 === 0 ? totalQuantity().toFixed(0) : totalQuantity()} {formUnit}</strong>
      </span>
    </div>
  </section>

  <!-- ── Save button ─────────────────────────────────────────────────────── -->

  <div class="save-bar">
    <button
      class="btn-save"
      type="button"
      disabled={!canSave() || saving}
      onclick={saveAll}
    >
      {#if saving}
        <span class="spinner" aria-hidden="true"></span>
        Speichern…
      {:else}
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M3 8l3.5 3.5L13 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        Speichern
      {/if}
    </button>
  </div>

</div>

<!-- ── Toast container ────────────────────────────────────────────────────── -->

{#if toasts.length > 0}
  <div class="toast-container" role="status" aria-live="polite">
    {#each toasts as toast (toast.id)}
      <div class="toast" class:toast--error={toast.type === 'error'}>
        {#if toast.type === 'success'}
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.5"/>
            <path d="M5 8l2 2 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        {:else}
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.5"/>
            <path d="M8 5v3.5M8 11v.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        {/if}
        {toast.message}
      </div>
    {/each}
  </div>
{/if}

<style>
  /* ── Layout ───────────────────────────────────────────────────────────── */

  .page {
    max-width: 560px;
    margin: 0 auto;
    padding: var(--space-6) var(--space-4) calc(var(--space-8) + 72px);
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }

  /* ── Page header ──────────────────────────────────────────────────────── */

  .page-header {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .back-link {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--color-text-muted);
    text-decoration: none;
    transition: color var(--transition-fast);
    width: fit-content;
  }

  .back-link:hover {
    color: var(--color-primary);
  }

  .page-title {
    font-family: var(--font-display);
    font-size: var(--text-2xl);
    font-weight: 700;
    color: var(--color-text-primary);
    letter-spacing: -0.02em;
    margin: 0;
  }

  /* ── Progress bar ─────────────────────────────────────────────────────── */

  .progress-bar {
    display: flex;
    align-items: center;
    gap: 0;
  }

  .progress-step {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    opacity: 0.4;
    transition: opacity var(--transition-fast);
  }

  .progress-step--active {
    opacity: 1;
  }

  .progress-step--done .progress-num {
    background-color: var(--color-primary);
    color: var(--color-text-inverse);
    border-color: var(--color-primary);
  }

  .progress-num {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    font-size: var(--text-xs);
    font-weight: 700;
    border: 2px solid var(--color-border);
    background-color: var(--color-surface);
    color: var(--color-text-secondary);
    transition: background-color var(--transition-fast), border-color var(--transition-fast), color var(--transition-fast);
  }

  .progress-label {
    font-size: 10px;
    font-weight: 500;
    color: var(--color-text-muted);
    white-space: nowrap;
  }

  .progress-connector {
    flex: 1;
    height: 2px;
    background-color: var(--color-border);
    margin-bottom: 16px;
    transition: background-color var(--transition-fast);
  }

  .progress-connector--done {
    background-color: var(--color-primary);
  }

  /* ── Step card ────────────────────────────────────────────────────────── */

  .step-card {
    background-color: var(--color-surface-raised);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-xl);
    padding: var(--space-5);
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    box-shadow: var(--shadow-sm);
    transition: opacity var(--transition-fast);
  }

  .step-card--disabled {
    opacity: 0.5;
    pointer-events: none;
  }

  .step-header {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .step-badge {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background-color: var(--color-surface-sunken);
    border: 2px solid var(--color-border);
    font-size: var(--text-xs);
    font-weight: 700;
    color: var(--color-text-secondary);
    flex-shrink: 0;
    transition: background-color var(--transition-fast), border-color var(--transition-fast), color var(--transition-fast);
  }

  .step-badge--done {
    background-color: var(--color-primary);
    border-color: var(--color-primary);
    color: var(--color-text-inverse);
  }

  .step-title {
    font-family: var(--font-display);
    font-size: var(--text-base);
    font-weight: 700;
    color: var(--color-text-primary);
    margin: 0;
  }

  /* ── Search ───────────────────────────────────────────────────────────── */

  .search-wrap {
    position: relative;
  }

  .search-icon {
    position: absolute;
    left: var(--space-3);
    top: 50%;
    transform: translateY(-50%);
    color: var(--color-text-muted);
    pointer-events: none;
  }

  .search-spinner {
    position: absolute;
    right: var(--space-3);
    top: 50%;
    transform: translateY(-50%);
    display: inline-block;
    width: 14px;
    height: 14px;
    border: 2px solid var(--color-border);
    border-top-color: var(--color-primary);
    border-radius: 50%;
    animation: spin 600ms linear infinite;
  }

  .search-input {
    width: 100%;
    height: 44px;
    padding: 0 var(--space-8) 0 calc(var(--space-3) * 2 + 16px);
    border-radius: var(--radius-lg);
    border: 1px solid var(--color-border);
    background-color: var(--color-surface);
    color: var(--color-text-primary);
    font-family: var(--font-body);
    font-size: var(--text-base);
    outline: none;
    transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
    box-sizing: border-box;
  }

  .search-input::placeholder { color: var(--color-text-muted); }

  .search-input:focus {
    border-color: var(--color-border-focus);
    box-shadow: 0 0 0 3px rgba(196, 103, 58, 0.15);
  }

  /* ── Search results ───────────────────────────────────────────────────── */

  .results-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    background-color: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    overflow: hidden;
    box-shadow: var(--shadow-md);
  }

  .result-item {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    width: 100%;
    padding: var(--space-3) var(--space-4);
    border: none;
    background-color: transparent;
    cursor: pointer;
    text-align: left;
    transition: background-color var(--transition-fast);
  }

  .result-item:hover {
    background-color: var(--color-surface-sunken);
  }

  .result-icon {
    font-size: 1.4rem;
    line-height: 1;
    flex-shrink: 0;
    width: 28px;
    text-align: center;
  }

  .result-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .result-name {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--color-text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .result-brand {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
  }

  .result-cat {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    background-color: var(--color-surface-sunken);
    padding: 2px var(--space-2);
    border-radius: var(--radius-full);
    white-space: nowrap;
    flex-shrink: 0;
  }

  /* ── No results ───────────────────────────────────────────────────────── */

  .no-results {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-2);
    padding: var(--space-3) 0;
  }

  .no-results-text {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    margin: 0;
  }

  .link-new-product {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--color-primary);
    text-decoration: none;
    transition: color var(--transition-fast);
  }

  .link-new-product:hover {
    color: var(--color-primary-hover);
  }

  /* ── Selected product ─────────────────────────────────────────────────── */

  .selected-product {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    background-color: var(--color-primary-subtle);
    border: 1px solid var(--color-primary);
    border-radius: var(--radius-lg);
  }

  .selected-icon {
    font-size: 1.6rem;
    line-height: 1;
    flex-shrink: 0;
  }

  .selected-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .selected-name {
    font-size: var(--text-sm);
    font-weight: 700;
    color: var(--color-text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .selected-brand {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
  }

  .selected-clear {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: var(--radius-md);
    border: none;
    background-color: transparent;
    color: var(--color-text-muted);
    cursor: pointer;
    flex-shrink: 0;
    transition: background-color var(--transition-fast), color var(--transition-fast);
  }

  .selected-clear:hover {
    background-color: rgba(0, 0, 0, 0.06);
    color: var(--color-text-primary);
  }

  /* ── Fields ───────────────────────────────────────────────────────────── */

  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .field-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-3);
    background-color: var(--color-surface-sunken);
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border-subtle);
  }

  .field--unit-row {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
  }

  .field--unit-row .label {
    margin-bottom: 0;
    flex-shrink: 0;
  }

  .input--unit {
    width: auto;
    min-width: 140px;
  }

  .label {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--color-text-secondary);
  }

  .input {
    height: 40px;
    padding: 0 var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
    background-color: var(--color-surface);
    color: var(--color-text-primary);
    font-family: var(--font-body);
    font-size: var(--text-base);
    outline: none;
    transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
    width: 100%;
    box-sizing: border-box;
    appearance: none;
  }

  .input::placeholder { color: var(--color-text-muted); }

  .input:focus {
    border-color: var(--color-border-focus);
    box-shadow: 0 0 0 3px rgba(196, 103, 58, 0.15);
  }

  .input:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  /* ── MHD rows ─────────────────────────────────────────────────────────── */

  .mhd-rows {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .mhd-row {
    display: grid;
    grid-template-columns: 90px 1fr 36px;
    gap: var(--space-2);
    align-items: end;
  }

  .field--mhd-qty {}
  .field--mhd-date {}

  .mhd-remove {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 40px;
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
    background-color: transparent;
    color: var(--color-text-muted);
    cursor: pointer;
    flex-shrink: 0;
    transition: background-color var(--transition-fast), color var(--transition-fast), border-color var(--transition-fast);
  }

  .mhd-remove:hover:not(:disabled) {
    background-color: var(--color-danger-subtle, #fee2e2);
    border-color: var(--color-danger, #dc2626);
    color: var(--color-danger, #dc2626);
  }

  .mhd-remove:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  /* ── MHD footer ───────────────────────────────────────────────────────── */

  .mhd-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    flex-wrap: wrap;
  }

  .btn-add-row {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    height: 36px;
    padding: 0 var(--space-4);
    border-radius: var(--radius-md);
    border: 1px dashed var(--color-border);
    background-color: transparent;
    color: var(--color-text-secondary);
    font-family: var(--font-body);
    font-size: var(--text-sm);
    font-weight: 500;
    cursor: pointer;
    transition: border-color var(--transition-fast), color var(--transition-fast), background-color var(--transition-fast);
  }

  .btn-add-row:hover:not(:disabled) {
    border-color: var(--color-primary);
    color: var(--color-primary);
    background-color: var(--color-primary-subtle);
  }

  .btn-add-row:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .total-label {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    white-space: nowrap;
  }

  .total-label strong {
    color: var(--color-text-primary);
    font-weight: 700;
  }

  /* ── Save bar ─────────────────────────────────────────────────────────── */

  .save-bar {
    position: sticky;
    bottom: var(--space-4);
  }

  .btn-save {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    width: 100%;
    height: 52px;
    border-radius: var(--radius-lg);
    border: none;
    background-color: var(--color-primary);
    color: var(--color-text-inverse);
    font-family: var(--font-body);
    font-size: var(--text-base);
    font-weight: 700;
    cursor: pointer;
    box-shadow: var(--shadow-lg);
    transition: background-color var(--transition-fast), box-shadow var(--transition-fast), opacity var(--transition-fast);
  }

  .btn-save:hover:not(:disabled) {
    background-color: var(--color-primary-hover);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
  }

  .btn-save:disabled {
    opacity: 0.45;
    cursor: not-allowed;
    box-shadow: none;
  }

  /* ── Spinner ──────────────────────────────────────────────────────────── */

  .spinner {
    display: inline-block;
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255, 255, 255, 0.4);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 600ms linear infinite;
    flex-shrink: 0;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* ── Toast ────────────────────────────────────────────────────────────── */

  .toast-container {
    position: fixed;
    bottom: calc(var(--space-6) + 64px);
    left: 50%;
    transform: translateX(-50%);
    z-index: var(--z-toast, 600);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    align-items: center;
    pointer-events: none;
  }

  .toast {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-lg);
    background-color: var(--color-accent);
    color: var(--color-text-inverse);
    font-size: var(--text-sm);
    font-weight: 500;
    box-shadow: var(--shadow-lg);
    white-space: nowrap;
    animation: toast-in 200ms ease;
  }

  .toast--error {
    background-color: var(--color-danger, #dc2626);
  }

  @keyframes toast-in {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  /* ── Mobile ───────────────────────────────────────────────────────────── */

  @media (max-width: 480px) {
    .page {
      padding: var(--space-4) var(--space-3) calc(var(--space-6) + 72px);
    }

    .mhd-row {
      grid-template-columns: 80px 1fr 36px;
    }

    .toast-container {
      bottom: calc(var(--space-4) + 64px);
      left: var(--space-4);
      right: var(--space-4);
      transform: none;
    }

    .toast {
      width: 100%;
      justify-content: center;
    }
  }
</style>

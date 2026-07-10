<script lang="ts">
  import { enhance } from '$app/forms'
  import { goto } from '$app/navigation'
  import ConfirmModal from '$lib/components/ConfirmModal.svelte'
  import type { PageData } from './$types'
  import { formatDate, unitLabel } from '$lib/utils/format'
  import { getExpiryStatus, getDaysRemaining, getExpiryLabel, EXPIRY_CLASS } from '$lib/utils/expiry'

  // ── Props ─────────────────────────────────────────────────────────────────

  let { data }: { data: PageData } = $props()

  // ── Types ─────────────────────────────────────────────────────────────────

  type NutrientRow = {
    id: string
    nutrientType: { name: string; unit: string; slug: string }
    valuePer100: string
  }

  type ProductStore = {
    id: string
    store: { id: string; name: string }
    sortOrder: number
  }

  // ── Derived item state ────────────────────────────────────────────────────

  // svelte-ignore state_referenced_locally
  let item = $state(data.item)
  // svelte-ignore state_referenced_locally
  let locationPath = $state(data.locationPath)

  // ── Expiry derived ────────────────────────────────────────────────────────

  const expiryStatus = $derived(() => {
    if (!item.bestBeforeDate) return null
    const d = new Date(item.bestBeforeDate)
    return getExpiryStatus(d, data.expirySettings.graceDaysAfter, {
      yellowDaysBefore: data.expirySettings.yellowDaysBefore,
      redDaysBefore: data.expirySettings.redDaysBefore,
    })
  })

  const daysRemaining = $derived(() => {
    if (!item.bestBeforeDate) return Infinity
    const d = new Date(item.bestBeforeDate)
    return getDaysRemaining(d, data.expirySettings.graceDaysAfter)
  })

  const expiryLabel = $derived(() => {
    if (!item.bestBeforeDate) return 'Kein MHD'
    const st = expiryStatus()
    if (!st) return 'Kein MHD'
    return getExpiryLabel(st, daysRemaining())
  })

  const expiryClass = $derived(() => {
    const st = expiryStatus()
    return st ? EXPIRY_CLASS[st] : ''
  })

  // ── Confirm Modal ────────────────────────────────────────────────────────────
  let confirmModal = $state<{ open: boolean; title: string; message: string; confirmLabel: string; onConfirm: () => void } | null>(null)

  function showConfirm(title: string, message: string, onConfirm: () => void, confirmLabel = 'Entfernen') {
    confirmModal = { open: true, title, message, confirmLabel, onConfirm }
  }

  function closeConfirm() { confirmModal = null }

  // ── Edit-in-place state ───────────────────────────────────────────────────

  type EditField = 'quantity' | 'bestBeforeDate' | 'notes' | 'lotNumber' | 'unit' | null
  let editingField = $state<EditField>(null)

  // Transient edit values — initialised once from item, refreshed in startEdit()
  // svelte-ignore state_referenced_locally
  let editQuantity = $state(String(item.quantity))
  // svelte-ignore state_referenced_locally
  let editBestBeforeDate = $state(item.bestBeforeDate ?? '')
  // svelte-ignore state_referenced_locally
  let editNotes = $state(item.notes ?? '')
  // svelte-ignore state_referenced_locally
  let editLotNumber = $state(item.lotNumber ?? '')
  // svelte-ignore state_referenced_locally
  let editUnit = $state(item.unit)

  function startEdit(field: EditField) {
    // Refresh transient values from current item state
    editQuantity = String(item.quantity)
    editBestBeforeDate = item.bestBeforeDate ?? ''
    editNotes = item.notes ?? ''
    editLotNumber = item.lotNumber ?? ''
    editUnit = item.unit
    editingField = field
  }

  function cancelEdit() {
    editingField = null
  }

  // ── Location picker ───────────────────────────────────────────────────────

  let showLocationPicker = $state(false)

  function openLocationPicker() {
    showLocationPicker = true
  }

  function closeLocationPicker() {
    showLocationPicker = false
  }

  async function selectPlace(placeId: string) {
    closeLocationPicker()
    const fd = new FormData()
    fd.set('placeId', placeId)
    const res = await fetch(`?/updateItem`, { method: 'POST', body: fd })
    if (res.ok) {
      // Rebuild locationPath from allLocations
      for (const loc of data.allLocations) {
        for (const st of loc.storages) {
          for (const pl of st.places) {
            if (pl.id === placeId) {
              locationPath = [
                { id: loc.id, name: loc.name, kind: 'location' },
                { id: st.id, name: st.name, kind: 'storage' },
                { id: pl.id, name: pl.name, kind: 'place' },
              ]
              return
            }
          }
        }
      }
    } else {
      showToast('Fehler beim Speichern des Lagerorts', 'error')
    }
  }

  // ── Toast ─────────────────────────────────────────────────────────────────

  type Toast = { id: number; message: string; type: 'success' | 'error' }
  let toasts = $state<Toast[]>([])
  let toastCounter = 0

  function showToast(message: string, type: 'success' | 'error' = 'success') {
    const id = ++toastCounter
    toasts = [...toasts, { id, message, type }]
    setTimeout(() => {
      toasts = toasts.filter((t) => t.id !== id)
    }, 3500)
  }

  // ── Quantity stepper ──────────────────────────────────────────────────────

  // svelte-ignore state_referenced_locally
  let qty = $state(Number(item.quantity))

  async function changeQuantity(delta: number) {
    const next = Math.max(0, qty + delta)
    qty = next
    const fd = new FormData()
    fd.set('quantity', String(next))
    const res = await fetch(`?/updateQuantity`, { method: 'POST', body: fd })
    if (!res.ok) {
      showToast('Fehler beim Aktualisieren der Menge', 'error')
      qty = Number(item.quantity)
    } else {
      item = { ...item, quantity: String(next) }
    }
  }

  // ── Field save helpers ────────────────────────────────────────────────────

  async function saveField(field: EditField) {
    if (!field) return
    const fd = new FormData()

    switch (field) {
      case 'quantity':
        fd.set('quantity', editQuantity)
        break
      case 'bestBeforeDate':
        fd.set('bestBeforeDate', editBestBeforeDate)
        break
      case 'notes':
        fd.set('notes', editNotes)
        break
      case 'lotNumber':
        fd.set('lotNumber', editLotNumber)
        break
      case 'unit':
        fd.set('unit', editUnit)
        break
    }

    const res = await fetch(`?/updateItem`, { method: 'POST', body: fd })
    if (res.ok) {
      // Optimistically update item
      if (field === 'quantity') {
        item = { ...item, quantity: editQuantity }
        qty = Number(editQuantity)
      } else if (field === 'bestBeforeDate') {
        item = { ...item, bestBeforeDate: editBestBeforeDate === '' ? null : editBestBeforeDate }
      } else if (field === 'notes') {
        item = { ...item, notes: editNotes === '' ? null : editNotes }
      } else if (field === 'lotNumber') {
        item = { ...item, lotNumber: editLotNumber === '' ? null : editLotNumber }
      } else if (field === 'unit') {
        item = { ...item, unit: editUnit }
      }
      showToast('Gespeichert')
      editingField = null
    } else {
      showToast('Fehler beim Speichern', 'error')
    }
  }

  function onFieldKeydown(e: KeyboardEvent, field: EditField) {
    if (e.key === 'Enter') saveField(field)
    if (e.key === 'Escape') cancelEdit()
  }

  // ── Nutrients ─────────────────────────────────────────────────────────────

  const knownNutrients = [
    { slug: 'energy-kcal', label: 'Energie', unit: 'kcal' },
    { slug: 'energy-kj', label: 'Energie', unit: 'kJ' },
    { slug: 'fat', label: 'Fett', unit: 'g' },
    { slug: 'saturated-fat', label: 'davon gesättigt', unit: 'g' },
    { slug: 'carbohydrates', label: 'Kohlenhydrate', unit: 'g' },
    { slug: 'sugars', label: 'davon Zucker', unit: 'g' },
    { slug: 'fiber', label: 'Ballaststoffe', unit: 'g' },
    { slug: 'proteins', label: 'Protein', unit: 'g' },
    { slug: 'salt', label: 'Salz', unit: 'g' },
  ]

  const nutrients = $derived(() => {
    const map = new Map<string, NutrientRow>()
    for (const n of item.product.nutrients ?? []) {
      map.set(n.nutrientType.slug, n as NutrientRow)
    }
    return map
  })

  function getNutrientValue(slug: string): string {
    const n = nutrients().get(slug)
    if (!n) return '—'
    return `${Number(n.valuePer100).toLocaleString('de-DE', { maximumFractionDigits: 2 })}`
  }

  // ── Units ─────────────────────────────────────────────────────────────────

  // svelte-ignore state_referenced_locally
  let unitOptions = $state(data.units as { id: string; name: string; symbol: string }[])

  // ── Bezugsquellen (product stores) ───────────────────────────────────────

  // svelte-ignore state_referenced_locally
  let productStores = $state<ProductStore[]>([...data.productStores])

  // svelte-ignore state_referenced_locally
  let selectedAddStoreId = $state('')

  const unassignedStores = $derived(() =>
    data.availableStores.filter(
      (s: { id: string; name: string }) => !productStores.some((ps) => ps.store.id === s.id)
    )
  )

  async function moveStore(index: number, direction: -1 | 1) {
    const targetIndex = index + direction
    if (targetIndex < 0 || targetIndex >= productStores.length) return

    const current = productStores[index]
    const adjacent = productStores[targetIndex]

    // Swap sortOrder values
    const currentNewOrder = adjacent.sortOrder
    const adjacentNewOrder = current.sortOrder

    const [resA, resB] = await Promise.all([
      fetch(`/api/product-stores/${current.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sortOrder: currentNewOrder }),
      }),
      fetch(`/api/product-stores/${adjacent.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sortOrder: adjacentNewOrder }),
      }),
    ])

    if (resA.ok && resB.ok) {
      const updated = [...productStores]
      updated[index] = { ...current, sortOrder: currentNewOrder }
      updated[targetIndex] = { ...adjacent, sortOrder: adjacentNewOrder }
      productStores = updated.sort((a, b) => a.sortOrder - b.sortOrder)
      showToast('Reihenfolge gespeichert')
    } else {
      showToast('Fehler beim Speichern der Reihenfolge', 'error')
    }
  }

  async function removeStore(ps: ProductStore) {
    const res = await fetch(`/api/product-stores/${ps.id}`, { method: 'DELETE' })
    if (res.ok) {
      productStores = productStores.filter((p) => p.id !== ps.id)
      showToast('Bezugsquelle entfernt')
    } else {
      showToast('Fehler beim Entfernen', 'error')
    }
  }

  async function addStore() {
    if (!selectedAddStoreId) return
    const maxOrder = productStores.length > 0 ? Math.max(...productStores.map((p) => p.sortOrder)) : 0
    const res = await fetch('/api/product-stores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productId: item.productId,
        storeId: selectedAddStoreId,
        householdId: item.householdId,
        sortOrder: maxOrder + 1,
      }),
    })
    if (res.ok) {
      const newPs = await res.json()
      productStores = [...productStores, newPs].sort((a, b) => a.sortOrder - b.sortOrder)
      selectedAddStoreId = ''
      showToast('Bezugsquelle hinzugefügt')
    } else {
      showToast('Fehler beim Hinzufügen', 'error')
    }
  }
</script>

<!-- ── Page ──────────────────────────────────────────────────────────────── -->

<div class="page">

  <!-- ── Back link ──────────────────────────────────────────────────────── -->
  <a href="/inventar" class="back-link">
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M10 3L5 8l5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    Zurück zum Inventar
  </a>

  <!-- ── Product header card ────────────────────────────────────────────── -->
  <div class="card product-card">

    <!-- Image placeholder + product info -->
    <div class="product-hero">
      <div class="product-image-placeholder" aria-hidden="true">
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
          <rect width="40" height="40" rx="8" fill="var(--color-primary-subtle)"/>
          <path d="M10 28l6-8 4 5 3-3 7 6" stroke="var(--color-primary)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
          <circle cx="14" cy="18" r="3" stroke="var(--color-primary)" stroke-width="1.5" fill="none"/>
        </svg>
      </div>

      <div class="product-info">
        <h1 class="product-name">{item.product.name}</h1>
        {#if item.product.brand}
          <span class="product-brand">{item.product.brand}</span>
        {/if}
        {#if item.product.gtin}
          <span class="product-barcode">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <rect x="1" y="2" width="1.5" height="8" fill="currentColor"/>
              <rect x="3.5" y="2" width="1" height="8" fill="currentColor"/>
              <rect x="5.5" y="2" width="2" height="8" fill="currentColor"/>
              <rect x="8.5" y="2" width="1" height="8" fill="currentColor"/>
              <rect x="10" y="2" width="1" height="8" fill="currentColor"/>
            </svg>
            {item.product.gtin}
          </span>
        {/if}
        {#if item.product.category}
          <span class="product-category">{item.product.category.name}</span>
        {/if}
      </div>
    </div>

    <!-- Status badge for consumed/discarded items -->
    {#if item.status !== 'available'}
      <div class="status-banner status-banner--{item.status}">
        {#if item.status === 'consumed'}
          Verbraucht
        {:else if item.status === 'expired'}
          Abgelaufen entsorgt
        {:else if item.status === 'donated'}
          Gespendet
        {:else if item.status === 'discarded'}
          Entsorgt
        {/if}
      </div>
    {/if}
  </div>

  <!-- ── MHD card ────────────────────────────────────────────────────────── -->
  <div class="card">
    <div class="section-header">
      <h2 class="section-title">Mindesthaltbarkeitsdatum</h2>
      {#if editingField !== 'bestBeforeDate'}
        <button class="btn-edit" type="button" onclick={() => startEdit('bestBeforeDate')} title="MHD bearbeiten">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M9.5 2.5L11.5 4.5L5 11H3V9L9.5 2.5Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
          </svg>
        </button>
      {/if}
    </div>

    <div class="mhd-row">
      {#if editingField === 'bestBeforeDate'}
        <div class="field-edit-row">
          <!-- svelte-ignore a11y_autofocus -->
          <input
            class="input"
            type="date"
            bind:value={editBestBeforeDate}
            onkeydown={(e) => onFieldKeydown(e, 'bestBeforeDate')}
            autofocus
          />
          <button class="btn-save" type="button" onclick={() => saveField('bestBeforeDate')}>Speichern</button>
          <button class="btn-cancel" type="button" onclick={cancelEdit}>Abbrechen</button>
        </div>
      {:else}
        <div class="mhd-value">
          <span class="mhd-date">{item.bestBeforeDate ? formatDate(item.bestBeforeDate) : '—'}</span>
          {#if item.bestBeforeDate}
            <span class="mhd-badge {expiryClass()} mhd-badge--big">
              {expiryLabel()}
            </span>
          {:else}
            <span class="mhd-badge mhd-fresh mhd-badge--big">Kein MHD</span>
          {/if}
        </div>
      {/if}
    </div>
  </div>

  <!-- ── Location card ─────────────────────────────────────────────────── -->
  <div class="card">
    <div class="section-header">
      <h2 class="section-title">Lagerort</h2>
      <button class="btn-edit" type="button" onclick={openLocationPicker} title="Lagerort ändern">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <path d="M9.5 2.5L11.5 4.5L5 11H3V9L9.5 2.5Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
        </svg>
      </button>
    </div>

    <div class="location-path">
      {#if locationPath.length === 0}
        <span class="location-unset">Kein Lagerort zugewiesen</span>
      {:else}
        {#each locationPath as segment, i (segment.id)}
          {#if i > 0}
            <svg class="path-sep" width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M5 3l4 4-4 4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          {/if}
          <button
            class="path-segment"
            type="button"
            onclick={openLocationPicker}
            title="Lagerort ändern"
          >
            {segment.name}
          </button>
        {/each}
      {/if}
    </div>
  </div>

  <!-- ── Quantity card ──────────────────────────────────────────────────── -->
  <div class="card">
    <div class="section-header">
      <h2 class="section-title">Menge</h2>
      {#if editingField !== 'unit'}
        <button class="btn-edit" type="button" onclick={() => startEdit('unit')} title="Einheit bearbeiten">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M9.5 2.5L11.5 4.5L5 11H3V9L9.5 2.5Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
          </svg>
        </button>
      {/if}
    </div>

    {#if editingField === 'unit'}
      <div class="field-edit-row">
        <select class="input select" bind:value={editUnit}>
          {#each unitOptions as opt}
            <option value={opt.symbol}>{opt.name}</option>
          {/each}
        </select>
        <button class="btn-save" type="button" onclick={() => saveField('unit')}>Speichern</button>
        <button class="btn-cancel" type="button" onclick={cancelEdit}>Abbrechen</button>
      </div>
    {:else}
      <div class="quantity-row">
        <button
          class="qty-btn"
          type="button"
          onclick={() => changeQuantity(-1)}
          disabled={qty <= 0}
          aria-label="Menge verringern"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <path d="M4 9h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </button>

        <div class="qty-display">
          <span class="qty-number">{qty}</span>
          <span class="qty-unit">{unitLabel(item.unit)}</span>
        </div>

        <button
          class="qty-btn"
          type="button"
          onclick={() => changeQuantity(1)}
          aria-label="Menge erhöhen"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <path d="M9 4v10M4 9h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
    {/if}
  </div>

  <!-- ── Notes & Lot card ───────────────────────────────────────────────── -->
  <div class="card">
    <h2 class="section-title" style="margin-bottom: var(--space-4)">Details</h2>

    <!-- Lot number -->
    <div class="detail-row">
      <span class="detail-label">Losnummer</span>
      {#if editingField === 'lotNumber'}
          <!-- svelte-ignore a11y_autofocus -->
        <div class="field-edit-row field-edit-row--inline">
          <input
            class="input input--sm"
            type="text"
            placeholder="z.B. L1234"
            bind:value={editLotNumber}
            onkeydown={(e) => onFieldKeydown(e, 'lotNumber')}
            autofocus
          />
          <button class="btn-save" type="button" onclick={() => saveField('lotNumber')}>Ok</button>
          <button class="btn-cancel" type="button" onclick={cancelEdit}>×</button>
        </div>
      {:else}
        <div class="detail-value-row">
          <span class="detail-value">{item.lotNumber ?? '—'}</span>
          <button class="btn-icon" type="button" onclick={() => startEdit('lotNumber')} title="Bearbeiten">
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M9.5 2.5L11.5 4.5L5 11H3V9L9.5 2.5Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>
      {/if}
    </div>

    <!-- Notes -->
    <div class="detail-row">
      <span class="detail-label">Notizen</span>
          <!-- svelte-ignore a11y_autofocus -->
      {#if editingField === 'notes'}
        <div class="field-edit-col">
          <textarea
            class="input textarea"
            placeholder="Notizen zum Artikel..."
            bind:value={editNotes}
            onkeydown={(e) => { if (e.key === 'Escape') cancelEdit() }}
            autofocus
            rows="3"
          ></textarea>
          <div class="field-edit-actions">
            <button class="btn-save" type="button" onclick={() => saveField('notes')}>Speichern</button>
            <button class="btn-cancel" type="button" onclick={cancelEdit}>Abbrechen</button>
          </div>
        </div>
      {:else}
        <div class="detail-value-row">
          <span class="detail-value detail-value--notes">{item.notes ?? '—'}</span>
          <button class="btn-icon" type="button" onclick={() => startEdit('notes')} title="Notiz bearbeiten">
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M9.5 2.5L11.5 4.5L5 11H3V9L9.5 2.5Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>
      {/if}
    </div>
  </div>

  <!-- ── Bezugsquellen card ───────────────────────────────────────────── -->
  <div class="card" id="bezugsquellen">
    <div class="section-header">
      <h2 class="section-title">Bezugsquellen</h2>
    </div>

    {#if productStores.length === 0}
      <p class="stores-empty">Keine Bezugsquellen zugewiesen.</p>
    {:else}
      <ul class="stores-list">
        {#each productStores as ps, i (ps.id)}
          <li class="store-row">
            <span class="store-order-badge">{ps.sortOrder}</span>
            <span class="store-name">{ps.store.name}</span>
            <div class="store-order-btns">
              <button
                class="btn-order"
                type="button"
                onclick={() => moveStore(i, -1)}
                disabled={i === 0}
                aria-label="Nach oben"
                title="Nach oben"
              >↑</button>
              <button
                class="btn-order"
                type="button"
                onclick={() => moveStore(i, 1)}
                disabled={i === productStores.length - 1}
                aria-label="Nach unten"
                title="Nach unten"
              >↓</button>
            </div>
            <button
              class="btn-remove-store"
              type="button"
              onclick={() => removeStore(ps)}
              aria-label="Bezugsquelle entfernen"
              title="Entfernen"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
            </button>
          </li>
        {/each}
      </ul>
    {/if}

    {#if unassignedStores().length > 0}
      <div class="add-store-row">
        <select class="input select input--sm add-store-select" bind:value={selectedAddStoreId}>
          <option value="">+ Bezugsquelle wählen…</option>
          {#each unassignedStores() as s (s.id)}
            <option value={s.id}>{s.name}</option>
          {/each}
        </select>
        <button
          class="btn-save"
          type="button"
          onclick={addStore}
          disabled={!selectedAddStoreId}
        >
          Hinzufügen
        </button>
      </div>
    {:else if data.availableStores.length === 0}
      <p class="stores-hint">Lege zuerst Geschäfte im Haushalt an.</p>
    {/if}
  </div>

  <!-- ── Nährwerte card ─────────────────────────────────────────────────── -->
  <div class="card">
    <h2 class="section-title" style="margin-bottom: var(--space-4)">Nährwerte <span class="section-subtitle">pro 100 g / 100 ml</span></h2>

    {#if (item.product.nutrients?.length ?? 0) === 0}
      <p class="nutrients-empty">Keine Nährwertangaben vorhanden.</p>
    {:else}
      <table class="nutrients-table">
        <thead>
          <tr>
            <th class="nt-col-name">Nährstoff</th>
            <th class="nt-col-val">Menge</th>
          </tr>
        </thead>
        <tbody>
          {#each knownNutrients as row (row.slug)}
            <tr class="nt-row">
              <td class="nt-name" class:nt-name--indent={row.slug === 'saturated-fat' || row.slug === 'sugars'}>
                {row.label}
              </td>
              <td class="nt-val">
                {#if nutrients().has(row.slug)}
                  {getNutrientValue(row.slug)}
                  <span class="nt-unit">{nutrients().get(row.slug)?.nutrientType.unit ?? row.unit}</span>
                {:else}
                  <span class="nt-none">Keine Angabe</span>
                {/if}
              </td>
            </tr>
          {/each}
          <!-- Any extra nutrients not in knownNutrients -->
          {#each item.product.nutrients ?? [] as n (n.id)}
            {#if !knownNutrients.find((k) => k.slug === n.nutrientType.slug)}
              <tr class="nt-row">
                <td class="nt-name">{n.nutrientType.name}</td>
                <td class="nt-val">
                  {Number(n.valuePer100).toLocaleString('de-DE', { maximumFractionDigits: 2 })}
                  <span class="nt-unit">{n.nutrientType.unit}</span>
                </td>
              </tr>
            {/if}
          {/each}
        </tbody>
      </table>
    {/if}
  </div>

  <!-- ── Actions card ───────────────────────────────────────────────────── -->
  {#if item.status === 'available'}
    <div class="card actions-card">
      <form
        method="POST"
        action="?/markConsumed"
        use:enhance={() => {
          return async ({ result, update }) => {
            if (result.type === 'redirect') {
              goto(result.location)
            } else {
              update()
            }
          }
        }}
      >
        <button class="btn-consumed" type="submit">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <circle cx="9" cy="9" r="7.5" stroke="currentColor" stroke-width="1.5"/>
            <path d="M5.5 9l2.5 2.5 4.5-4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Als verbraucht markieren
        </button>
      </form>

      <button
        class="btn-delete"
        type="button"
        onclick={() => showConfirm(
          'Bestandseintrag entfernen?',
          'Dieser Bestandseintrag wird aus dem Inventar entfernt. Das Produkt bleibt im Katalog.',
          () => { closeConfirm(); (document.getElementById('frm-del-item') as HTMLFormElement)?.submit() }
        )}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M2 4h12M6 4V2.5h4V4M5.5 4v8h5V4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        Aus Inventar entfernen
      </button>
      <form id="frm-del-item" method="POST" action="?/deleteItem" style="display:none" use:enhance={() => async ({ result, update }) => { if (result.type === 'redirect') goto(result.location); else await update() }}></form>

      <button
        class="btn-delete-product"
        type="button"
        onclick={() => showConfirm(
          'Produkt dauerhaft löschen?',
          `"${item.product.name}" wird dauerhaft aus dem Katalog entfernt und erscheint nicht mehr in Suche, Inventar oder Easy-Add.`,
          () => { closeConfirm(); (document.getElementById('frm-del-product') as HTMLFormElement)?.submit() }
        )}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.4"/>
          <path d="M5 8h6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
        </svg>
        Produkt aus Katalog entfernen
      </button>
      <form id="frm-del-product" method="POST" action="?/deleteProduct" style="display:none" use:enhance={() => async ({ result, update }) => { if (result.type === 'redirect') goto(result.location); else await update() }}></form>

    </div>
  {/if}
</div>

  <!-- "Alles löschen" — always visible regardless of item status -->
  <div class="card actions-card actions-card--danger">
      <button
        class="btn-delete-all"
        type="button"
        onclick={() => showConfirm(
          'Artikel vollständig löschen?',
          'Produkt, alle Bestandseinträge und alle Bezugsquellen werden dauerhaft gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.',
          () => { closeConfirm(); (document.getElementById('frm-del-all') as HTMLFormElement)?.submit() },
          'Alles löschen'
        )}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M2 4h12M6 4V2.5h4V4M5.5 4v8h5V4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M3 4l1 9.5h8L13 4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        Alles löschen (inkl. Bestand)
      </button>
      <form id="frm-del-all" method="POST" action="?/deleteAll" style="display:none" use:enhance={() => async ({ result, update }) => { if (result.type === 'redirect') goto(result.location); else await update() }}></form>
  </div>

<!-- ── Location picker dialog ────────────────────────────────────────────── -->
{#if showLocationPicker}
  <div class="dialog-backdrop" onclick={closeLocationPicker} onkeydown={(e) => e.key === 'Escape' && closeLocationPicker()} role="presentation">
    <div class="dialog" role="dialog" aria-modal="true" aria-label="Lagerort auswählen" tabindex="-1"
         onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
      <div class="dialog-header">
        <h3 class="dialog-title">Lagerort auswählen</h3>
        <button class="dialog-close" type="button" onclick={closeLocationPicker} aria-label="Schließen">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </button>
      </div>

      <div class="dialog-body">
        {#if data.allLocations.length === 0}
          <p class="picker-empty">Keine Lagerorte vorhanden. Lege zuerst Orte an.</p>
        {:else}
          {#each data.allLocations as loc (loc.id)}
            <div class="picker-location">
              <div class="picker-location-name">
                <span class="picker-icon">{loc.icon ?? '📍'}</span>
                {loc.name}
              </div>
              {#each loc.storages as st (st.id)}
                <div class="picker-storage">
                  <div class="picker-storage-name">{st.name}</div>
                  {#if st.places.length > 0}
                    <div class="picker-places">
                      {#each st.places as pl (pl.id)}
                        <button
                          class="picker-place-btn"
                          type="button"
                          onclick={() => selectPlace(pl.id)}
                        >
                          {pl.name}
                        </button>
                      {/each}
                    </div>
                  {:else}
                    <p class="picker-no-places">Keine Fächer</p>
                  {/if}
                </div>
              {/each}
            </div>
          {/each}
        {/if}
      </div>

      <div class="dialog-footer">
        <button class="btn-cancel" type="button" onclick={closeLocationPicker}>Abbrechen</button>
      </div>
    </div>
  </div>
{/if}

<!-- ── Toasts ─────────────────────────────────────────────────────────────── -->
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

{#if confirmModal}
  <ConfirmModal
    open={confirmModal.open}
    title={confirmModal.title}
    message={confirmModal.message}
    confirmLabel={confirmModal.confirmLabel}
    destructive={true}
    onConfirm={confirmModal.onConfirm}
    onCancel={closeConfirm}
  />
{/if}

<style>
  /* ── Page layout ──────────────────────────────────────────────────────── */

  .page {
    max-width: 680px;
    margin: 0 auto;
    padding: var(--space-6) var(--space-6) var(--space-16);
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  /* ── Back link ────────────────────────────────────────────────────────── */

  .back-link {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--color-text-secondary);
    text-decoration: none;
    transition: color var(--transition-fast);
    padding: var(--space-1) 0;
    margin-bottom: var(--space-2);
  }

  .back-link:hover {
    color: var(--color-primary);
  }

  /* ── Card ─────────────────────────────────────────────────────────────── */

  .card {
    background-color: var(--color-surface-raised);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: var(--space-5) var(--space-6);
    box-shadow: var(--shadow-sm);
  }

  /* ── Section header ───────────────────────────────────────────────────── */

  .section-header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-bottom: var(--space-4);
  }

  .section-title {
    font-family: var(--font-display);
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.07em;
    margin: 0;
    flex: 1;
  }

  .section-subtitle {
    font-family: var(--font-body);
    font-weight: 400;
    text-transform: none;
    letter-spacing: 0;
    color: var(--color-text-muted);
    font-size: var(--text-xs);
  }

  /* ── Product card ─────────────────────────────────────────────────────── */

  .product-hero {
    display: flex;
    align-items: flex-start;
    gap: var(--space-5);
  }

  .product-image-placeholder {
    flex-shrink: 0;
    width: 72px;
    height: 72px;
    border-radius: var(--radius-lg);
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: var(--color-primary-subtle);
  }

  .product-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .product-name {
    font-family: var(--font-display);
    font-size: var(--text-xl);
    font-weight: 700;
    color: var(--color-text-primary);
    letter-spacing: -0.01em;
    margin: 0;
    line-height: 1.2;
  }

  .product-brand {
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
    font-weight: 500;
  }

  .product-barcode {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    font-size: var(--text-xs);
    font-family: var(--font-mono);
    color: var(--color-text-muted);
    background-color: var(--color-surface-sunken);
    padding: 2px var(--space-2);
    border-radius: var(--radius-sm);
    width: fit-content;
  }

  .product-category {
    display: inline-flex;
    align-items: center;
    height: 20px;
    padding: 0 var(--space-2);
    border-radius: var(--radius-full);
    background-color: var(--color-secondary-subtle);
    color: var(--color-secondary);
    font-size: var(--text-xs);
    font-weight: 500;
    width: fit-content;
  }

  /* ── Status banner ────────────────────────────────────────────────────── */

  .status-banner {
    margin-top: var(--space-4);
    padding: var(--space-2) var(--space-4);
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    font-weight: 600;
    text-align: center;
  }

  .status-banner--consumed {
    background-color: var(--color-success-subtle);
    color: var(--color-success);
  }

  .status-banner--expired {
    background-color: var(--color-danger-subtle);
    color: var(--color-danger);
  }

  .status-banner--donated,
  .status-banner--discarded {
    background-color: var(--color-accent-subtle);
    color: var(--color-accent);
  }

  /* ── MHD row ──────────────────────────────────────────────────────────── */

  .mhd-row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-3);
  }

  .mhd-value {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    flex-wrap: wrap;
  }

  .mhd-date {
    font-family: var(--font-mono);
    font-size: var(--text-xl);
    font-weight: 600;
    color: var(--color-text-primary);
    letter-spacing: -0.01em;
  }

  .mhd-badge {
    font-size: var(--text-sm) !important;
    padding: var(--space-1) var(--space-3) !important;
  }

  .mhd-badge--big {
    font-size: var(--text-base) !important;
    padding: var(--space-2) var(--space-4) !important;
    border-radius: var(--radius-md) !important;
  }

  /* ── Location path ────────────────────────────────────────────────────── */

  .location-path {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-1);
  }

  .location-unset {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    font-style: italic;
  }

  .path-sep {
    color: var(--color-text-muted);
    flex-shrink: 0;
  }

  .path-segment {
    background: none;
    border: none;
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--color-text-link);
    cursor: pointer;
    transition: background-color var(--transition-fast), color var(--transition-fast);
  }

  .path-segment:hover {
    background-color: var(--color-primary-subtle);
    color: var(--color-primary-hover);
  }

  /* ── Quantity stepper ─────────────────────────────────────────────────── */

  .quantity-row {
    display: flex;
    align-items: center;
    gap: var(--space-4);
  }

  .qty-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    border-radius: var(--radius-md);
    border: 1.5px solid var(--color-border);
    background-color: var(--color-surface);
    color: var(--color-text-primary);
    cursor: pointer;
    transition: border-color var(--transition-fast), background-color var(--transition-fast), color var(--transition-fast);
    flex-shrink: 0;
  }

  .qty-btn:hover:not(:disabled) {
    border-color: var(--color-primary);
    background-color: var(--color-primary-subtle);
    color: var(--color-primary);
  }

  .qty-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .qty-display {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    min-width: 80px;
    justify-content: center;
  }

  .qty-number {
    font-family: var(--font-display);
    font-size: var(--text-3xl);
    font-weight: 700;
    color: var(--color-text-primary);
    line-height: 1;
    letter-spacing: -0.02em;
    min-width: 2ch;
    text-align: center;
  }

  .qty-unit {
    font-size: var(--text-base);
    color: var(--color-text-muted);
    font-weight: 500;
  }

  /* ── Detail rows ──────────────────────────────────────────────────────── */

  .detail-row {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-3) 0;
    border-bottom: 1px solid var(--color-border-subtle);
  }

  .detail-row:last-child {
    border-bottom: none;
  }

  .detail-label {
    font-size: var(--text-xs);
    font-weight: 600;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .detail-value-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .detail-value {
    font-size: var(--text-base);
    color: var(--color-text-primary);
    flex: 1;
  }

  .detail-value--notes {
    white-space: pre-wrap;
    line-height: 1.6;
    color: var(--color-text-secondary);
  }

  /* ── Field edit ───────────────────────────────────────────────────────── */

  .field-edit-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-wrap: wrap;
  }

  .field-edit-row--inline {
    flex-wrap: nowrap;
  }

  .field-edit-col {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .field-edit-actions {
    display: flex;
    gap: var(--space-2);
  }

  /* ── Inputs ───────────────────────────────────────────────────────────── */

  .input {
    height: 38px;
    padding: 0 var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
    background-color: var(--color-surface);
    color: var(--color-text-primary);
    font-family: var(--font-body);
    font-size: var(--text-base);
    outline: none;
    transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
    min-width: 0;
  }

  .input::placeholder {
    color: var(--color-text-muted);
  }

  .input:focus {
    border-color: var(--color-border-focus);
    box-shadow: 0 0 0 3px rgba(196, 103, 58, 0.15);
  }

  .input--sm {
    height: 34px;
    font-size: var(--text-sm);
  }

  .textarea {
    height: auto;
    padding: var(--space-2) var(--space-3);
    resize: vertical;
    line-height: 1.6;
  }

  .select {
    cursor: pointer;
    padding-right: var(--space-6);
  }

  /* ── Buttons ──────────────────────────────────────────────────────────── */

  .btn-save {
    display: inline-flex;
    align-items: center;
    height: 34px;
    padding: 0 var(--space-3);
    border-radius: var(--radius-md);
    border: none;
    background-color: var(--color-primary);
    color: var(--color-text-inverse);
    font-family: var(--font-body);
    font-size: var(--text-sm);
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    transition: background-color var(--transition-fast);
    flex-shrink: 0;
  }

  .btn-save:hover {
    background-color: var(--color-primary-hover);
  }

  .btn-cancel {
    display: inline-flex;
    align-items: center;
    height: 34px;
    padding: 0 var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
    background-color: transparent;
    color: var(--color-text-secondary);
    font-family: var(--font-body);
    font-size: var(--text-sm);
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
    transition: border-color var(--transition-fast), color var(--transition-fast);
    flex-shrink: 0;
  }

  .btn-cancel:hover {
    border-color: var(--color-border-strong);
    color: var(--color-text-primary);
  }

  .btn-edit {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: var(--radius-md);
    border: none;
    background-color: transparent;
    color: var(--color-text-muted);
    cursor: pointer;
    transition: background-color var(--transition-fast), color var(--transition-fast);
    flex-shrink: 0;
  }

  .btn-edit:hover {
    background-color: var(--color-surface-sunken);
    color: var(--color-text-primary);
  }

  .btn-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border-radius: var(--radius-md);
    border: none;
    background-color: transparent;
    color: var(--color-text-muted);
    cursor: pointer;
    transition: background-color var(--transition-fast), color var(--transition-fast);
    flex-shrink: 0;
  }

  .btn-icon:hover {
    background-color: var(--color-surface-sunken);
    color: var(--color-text-primary);
  }

  /* ── Action buttons ───────────────────────────────────────────────────── */

  .actions-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .btn-consumed {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    width: 100%;
    height: 48px;
    border-radius: var(--radius-md);
    border: none;
    background-color: var(--color-secondary);
    color: var(--color-text-inverse);
    font-family: var(--font-body);
    font-size: var(--text-base);
    font-weight: 600;
    cursor: pointer;
    transition: background-color var(--transition-fast), box-shadow var(--transition-fast);
  }

  .btn-consumed:hover {
    background-color: var(--color-secondary-hover);
    box-shadow: var(--shadow-md);
  }

  .btn-delete {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    width: 100%;
    height: 40px;
    border-radius: var(--radius-md);
    border: 1.5px solid var(--color-border);
    background-color: transparent;
    color: var(--color-text-secondary);
    font-family: var(--font-body);
    font-size: var(--text-sm);
    font-weight: 500;
    cursor: pointer;
    transition: border-color var(--transition-fast), background-color var(--transition-fast), color var(--transition-fast);
  }

  .btn-delete:hover {
    border-color: var(--color-danger);
    background-color: var(--color-danger-subtle);
    color: var(--color-danger);
  }

  .btn-delete-product {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    width: 100%;
    height: 40px;
    border-radius: var(--radius-md);
    border: 1.5px solid var(--color-border);
    background-color: transparent;
    color: var(--color-text-muted);
    font-family: var(--font-body);
    font-size: var(--text-sm);
    font-weight: 500;
    cursor: pointer;
    transition: border-color var(--transition-fast), background-color var(--transition-fast), color var(--transition-fast);
  }

  .btn-delete-product:hover {
    border-color: var(--color-danger);
    background-color: var(--color-danger-subtle);
    color: var(--color-danger);
  }

  .btn-delete-all {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    width: 100%;
    height: 40px;
    border-radius: var(--radius-md);
    border: 1.5px solid var(--color-danger);
    background-color: var(--color-danger-subtle);
    color: var(--color-danger);
    font-family: var(--font-body);
    font-size: var(--text-sm);
    font-weight: 600;
    cursor: pointer;
    transition: border-color var(--transition-fast), background-color var(--transition-fast), color var(--transition-fast);
  }

  .btn-delete-all:hover {
    background-color: var(--color-danger);
    color: #fff;
  }

  /* ── Nutrients table ──────────────────────────────────────────────────── */

  .nutrients-empty {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    font-style: italic;
    margin: 0;
  }

  .nutrients-table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--text-sm);
  }

  .nutrients-table thead tr {
    border-bottom: 1.5px solid var(--color-border);
  }

  .nt-col-name {
    text-align: left;
    font-size: var(--text-xs);
    font-weight: 600;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 0 0 var(--space-2) 0;
  }

  .nt-col-val {
    text-align: right;
    font-size: var(--text-xs);
    font-weight: 600;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 0 0 var(--space-2) var(--space-2);
  }

  .nt-row {
    border-bottom: 1px solid var(--color-border-subtle);
  }

  .nt-row:last-child {
    border-bottom: none;
  }

  .nt-name {
    padding: var(--space-2) 0;
    color: var(--color-text-secondary);
    vertical-align: middle;
  }

  .nt-name--indent {
    padding-left: var(--space-4);
    font-size: var(--text-xs);
    color: var(--color-text-muted);
  }

  .nt-val {
    text-align: right;
    padding: var(--space-2) 0 var(--space-2) var(--space-2);
    font-family: var(--font-mono);
    color: var(--color-text-primary);
    font-weight: 500;
    white-space: nowrap;
  }

  .nt-unit {
    font-family: var(--font-body);
    color: var(--color-text-muted);
    font-size: var(--text-xs);
    margin-left: 2px;
  }

  .nt-none {
    font-family: var(--font-body);
    color: var(--color-text-muted);
    font-style: italic;
    font-weight: 400;
  }

  /* ── Dialog ───────────────────────────────────────────────────────────── */

  .dialog-backdrop {
    position: fixed;
    inset: 0;
    background-color: rgba(44, 31, 20, 0.45);
    z-index: var(--z-modal);
    display: flex;
    align-items: flex-end;
    justify-content: center;
    padding: 0;
  }

  @media (min-width: 520px) {
    .dialog-backdrop {
      align-items: center;
      padding: var(--space-4);
    }
  }

  .dialog {
    background-color: var(--color-surface-raised);
    border-radius: var(--radius-xl) var(--radius-xl) 0 0;
    width: 100%;
    max-width: 520px;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    box-shadow: var(--shadow-xl);
  }

  @media (min-width: 520px) {
    .dialog {
      border-radius: var(--radius-xl);
    }
  }

  .dialog-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-5) var(--space-6) var(--space-4);
    border-bottom: 1px solid var(--color-border);
    flex-shrink: 0;
  }

  .dialog-title {
    font-family: var(--font-display);
    font-size: var(--text-lg);
    font-weight: 700;
    color: var(--color-text-primary);
    letter-spacing: -0.01em;
    margin: 0;
  }

  .dialog-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: var(--radius-md);
    border: none;
    background-color: transparent;
    color: var(--color-text-muted);
    cursor: pointer;
    transition: background-color var(--transition-fast), color var(--transition-fast);
    flex-shrink: 0;
  }

  .dialog-close:hover {
    background-color: var(--color-surface-sunken);
    color: var(--color-text-primary);
  }

  .dialog-body {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-4) var(--space-6);
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .dialog-footer {
    padding: var(--space-4) var(--space-6) var(--space-5);
    border-top: 1px solid var(--color-border);
    flex-shrink: 0;
  }

  .picker-empty {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    font-style: italic;
    margin: 0;
    text-align: center;
    padding: var(--space-6) 0;
  }

  .picker-location {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .picker-location-name {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-weight: 700;
    font-size: var(--text-base);
    color: var(--color-text-primary);
  }

  .picker-icon {
    font-size: 1.1em;
  }

  .picker-storage {
    padding-left: var(--space-6);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .picker-storage-name {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--color-text-secondary);
  }

  .picker-places {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .picker-place-btn {
    display: inline-flex;
    align-items: center;
    height: 30px;
    padding: 0 var(--space-3);
    border-radius: var(--radius-full);
    border: 1.5px solid var(--color-border);
    background-color: var(--color-surface);
    color: var(--color-text-primary);
    font-family: var(--font-body);
    font-size: var(--text-sm);
    font-weight: 500;
    cursor: pointer;
    transition: border-color var(--transition-fast), background-color var(--transition-fast), color var(--transition-fast);
  }

  .picker-place-btn:hover {
    border-color: var(--color-primary);
    background-color: var(--color-primary-subtle);
    color: var(--color-primary);
  }

  .picker-no-places {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    font-style: italic;
    margin: 0;
  }

  /* ── Toast ────────────────────────────────────────────────────────────── */

  .toast-container {
    position: fixed;
    bottom: var(--space-6);
    left: 50%;
    transform: translateX(-50%);
    z-index: var(--z-toast);
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
    background-color: var(--color-danger);
  }

  @keyframes toast-in {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .stores-empty {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    font-style: italic;
    margin: 0 0 var(--space-4);
  }

  .stores-hint {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    font-style: italic;
    margin: var(--space-3) 0 0;
  }

  .stores-list {
    list-style: none;
    margin: 0 0 var(--space-4);
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .store-row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-2) 0;
    border-bottom: 1px solid var(--color-border-subtle);
  }

  .store-row:last-child {
    border-bottom: none;
  }

  .store-name {
    flex: 1;
    font-size: var(--text-base);
    color: var(--color-text-primary);
    font-weight: 500;
  }

  .store-order-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 24px;
    height: 20px;
    padding: 0 var(--space-2);
    border-radius: var(--radius-full);
    background-color: var(--color-surface-sunken);
    color: var(--color-text-muted);
    font-size: var(--text-xs);
    font-family: var(--font-mono);
    font-weight: 600;
    flex-shrink: 0;
  }

  .store-order-btns {
    display: flex;
    gap: var(--space-1);
    flex-shrink: 0;
  }

  .btn-order {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
    background-color: var(--color-surface);
    color: var(--color-text-secondary);
    font-size: var(--text-sm);
    cursor: pointer;
    transition: border-color var(--transition-fast), background-color var(--transition-fast), color var(--transition-fast);
    flex-shrink: 0;
  }

  .btn-order:hover:not(:disabled) {
    border-color: var(--color-primary);
    background-color: var(--color-primary-subtle);
    color: var(--color-primary);
  }

  .btn-order:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .btn-remove-store {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border-radius: var(--radius-md);
    border: none;
    background-color: transparent;
    color: var(--color-text-muted);
    cursor: pointer;
    transition: background-color var(--transition-fast), color var(--transition-fast);
    flex-shrink: 0;
  }

  .btn-remove-store:hover {
    background-color: var(--color-danger-subtle);
    color: var(--color-danger);
  }

  .add-store-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-wrap: wrap;
  }

  .add-store-select {
    flex: 1;
    min-width: 160px;
  }

  /* ── Mobile ───────────────────────────────────────────────────────────── */

  @media (max-width: 600px) {
    .page {
      padding: var(--space-4) var(--space-4) var(--space-16);
    }

    .product-name {
      font-size: var(--text-lg);
    }

    .mhd-date {
      font-size: var(--text-lg);
    }

    .qty-number {
      font-size: var(--text-2xl);
    }

    .toast-container {
      bottom: var(--space-4);
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

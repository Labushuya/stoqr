<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation'
  import ConfirmModal from '$lib/components/ConfirmModal.svelte'
  import Modal from '$lib/components/Modal.svelte'
  import type { PageData } from './$types'
  import { formatDate, formatStockTotal } from '$lib/utils/format'
  import { getExpiryStatus, getDaysRemaining, getExpiryLabel, EXPIRY_CLASS } from '$lib/utils/expiry'

  // ── Props ─────────────────────────────────────────────────────────────────

  let { data }: { data: PageData } = $props()

  // ── Types ─────────────────────────────────────────────────────────────────

  type NutrientType = { id: string; slug: string; name: string; unit: string }
  type Unit = { id: string; name: string; symbol: string }
  type LocSegment = { id: string; name: string; kind: 'location' | 'storage' | 'place' }
  type Sibling = {
    id: string
    quantity: string
    unit: string
    bestBeforeDate: string | null
    status: string
    notes: string | null
    placeId: string | null
    storeId: string | null
    store: { id: string; name: string; chain: string | null } | null
    locationPath: LocSegment[]
  }
  type NutrientEditRow = { nutrientTypeId: string; valuePer100: string }

  // ── Static data ─────────────────────────────────────────────────────────

  const product = $derived(data.product)
  // Nutrient types are a $state (not $derived) so custom types added at runtime
  // become immediately selectable.
  // svelte-ignore state_referenced_locally
  let nutrientTypes = $state<NutrientType[]>(data.nutrientTypes as NutrientType[])
  const units = $derived(data.units as Unit[])
  const availableStores = $derived(
    data.availableStores as { id: string; name: string; chain: string | null }[]
  )

  function unitLabel(symbol: string): string {
    return units.find((u) => u.symbol === symbol)?.name ?? symbol
  }
  function nutrientName(id: string): string {
    return nutrientTypes.find((t) => t.id === id)?.name ?? '?'
  }
  function nutrientUnit(id: string): string {
    return nutrientTypes.find((t) => t.id === id)?.unit ?? ''
  }

  // ── Toast ─────────────────────────────────────────────────────────────────

  type Toast = { id: number; message: string; type: 'success' | 'error' }
  let toasts = $state<Toast[]>([])
  let toastCounter = 0
  function showToast(message: string, type: 'success' | 'error' = 'success') {
    const id = ++toastCounter
    toasts = [...toasts, { id, message, type }]
    setTimeout(() => { toasts = toasts.filter((t) => t.id !== id) }, 3500)
  }

  // ── Confirm modal ──────────────────────────────────────────────────────────

  let confirmModal = $state<{ open: boolean; title: string; message: string; confirmLabel: string; onConfirm: () => void } | null>(null)
  function showConfirm(title: string, message: string, onConfirm: () => void, confirmLabel = 'Entfernen') {
    confirmModal = { open: true, title, message, confirmLabel, onConfirm }
  }
  function closeConfirm() { confirmModal = null }

  // ── Soll-/Mindestbestand (Inkrement 2b) ─────────────────────────────────────

  type TargetRow = { targetQuantity: string; unit: string; minQuantity: string | null } | null
  type TargetStatusData = {
    status: 'ok' | 'below_target' | 'below_min' | 'not_comparable'
    targetInBase: number
    currentInBase: number
    minInBase: number | null
    unit: string
    dimension: 'mass' | 'volume' | 'count'
  } | null

  const stockTarget = $derived(data.stockTarget as TargetRow)
  const targetStatus = $derived(data.targetStatus as TargetStatusData)

  let showTargetModal = $state(false)
  let targetQtyInput = $state('')
  let targetUnitInput = $state('piece')
  let targetMinInput = $state('')
  let targetSaving = $state(false)
  let targetError = $state<string | null>(null)

  const TARGET_LABEL: Record<string, string> = {
    ok: 'Bestand ausreichend',
    below_target: 'Unter Soll — nachkaufen',
    below_min: 'Unter Mindestbestand!',
    not_comparable: 'Nicht vergleichbar (andere Einheit)',
  }

  function openTargetModal() {
    if (stockTarget) {
      targetQtyInput = stockTarget.targetQuantity
      targetUnitInput = stockTarget.unit
      targetMinInput = stockTarget.minQuantity ?? ''
    } else {
      targetQtyInput = ''
      targetUnitInput = product.defaultUnit ?? 'piece'
      targetMinInput = ''
    }
    targetError = null
    showTargetModal = true
  }

  async function saveTarget() {
    const qty = Number(targetQtyInput)
    if (!Number.isFinite(qty) || qty <= 0) { targetError = 'Soll-Menge muss > 0 sein.'; return }
    targetSaving = true
    targetError = null
    try {
      const res = await fetch(`/api/products/${product.id}/target`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetQuantity: qty,
          unit: targetUnitInput,
          minQuantity: String(targetMinInput ?? '').trim() || undefined,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        targetError = String(body?.error ?? `Fehler ${res.status}`)
        return
      }
      // Reload für frischen Soll-Ist-Vergleich (serverseitig berechnet).
      // stockTarget/targetStatus sind $derived(data.…) und folgen automatisch.
      showTargetModal = false
      await invalidateAll()
      showToast('Soll-Bestand gespeichert')
    } catch (err) {
      console.error('[saveTarget]', err)
      targetError = 'Netzwerkfehler.'
    } finally {
      targetSaving = false
    }
  }

  async function deleteTarget() {
    const res = await fetch(`/api/products/${product.id}/target`, { method: 'DELETE' })
    if (!res.ok && res.status !== 204) { showToast('Fehler beim Entfernen', 'error'); return }
    showTargetModal = false
    await invalidateAll()
    showToast('Soll-Bestand entfernt')
  }

  // ── Bestandskorrektur / Inventur (2c) ───────────────────────────────────────

  type StockGroupView = { dimension: string; displayValue: number; displayUnit: string; displayName: string }

  let showInventoryModal = $state(false)
  let invUnit = $state('')
  let invValue = $state('')
  let invSaving = $state(false)
  let invError = $state<string | null>(null)
  let invNeedsIncrease = $state(false)

  function openInventoryModal() {
    const groups = data.stockTotals.groups as StockGroupView[]
    // Vorbelegung mit der ersten Gruppe (oder Standard-Einheit, falls kein Bestand).
    if (groups.length > 0) {
      invUnit = groups[0].displayUnit
      invValue = String(groups[0].displayValue)
    } else {
      invUnit = product.defaultUnit ?? 'piece'
      invValue = '0'
    }
    invError = null
    invNeedsIncrease = false
    showInventoryModal = true
  }

  // Wenn eine andere Gruppe im Select gewählt wird, den Ist-Wert dieser Gruppe vorbelegen.
  function onInvUnitChange() {
    const g = (data.stockTotals.groups as StockGroupView[]).find((x) => x.displayUnit === invUnit)
    if (g) invValue = String(g.displayValue)
  }

  async function saveInventory() {
    const qty = Number(invValue)
    if (!Number.isFinite(qty) || qty < 0) { invError = 'Bitte gültige Menge >= 0 angeben.'; return }
    invSaving = true
    invError = null
    try {
      const res = await fetch(`/api/products/${product.id}/inventory-adjust`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newQuantity: qty, unit: invUnit }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { invError = String(body?.error ?? `Fehler ${res.status}`); return }
      if (body.needsIncrease) {
        // Erhöhung wird nicht automatisch gemacht — Hinweis, Bestand manuell anlegen.
        invNeedsIncrease = true
        showToast('Erhöhung bitte über „Bestand hinzufügen" erfassen', 'error')
        return
      }
      showInventoryModal = false
      await invalidateAll()
      showToast('Bestand korrigiert')
    } catch {
      invError = 'Netzwerkfehler.'
    } finally {
      invSaving = false
    }
  }

  // ── Markt-Zuordnung (M:N, Planung — M1) ─────────────────────────────────────

  type StoreOpt = { id: string; name: string; chain: string | null }

  // svelte-ignore state_referenced_locally
  let productStoreIds = $state<string[]>([...(data.productStoreIds as string[])])
  let storeSaving = $state(false)

  function isStoreLinked(id: string): boolean {
    return productStoreIds.includes(id)
  }

  async function toggleStore(id: string) {
    const next = productStoreIds.includes(id)
      ? productStoreIds.filter((s) => s !== id)
      : [...productStoreIds, id]
    // optimistisch
    const prev = productStoreIds
    productStoreIds = next
    storeSaving = true
    try {
      const res = await fetch(`/api/products/${product.id}/stores`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeIds: next }),
      })
      if (!res.ok) {
        productStoreIds = prev
        showToast('Fehler beim Speichern der Markt-Zuordnung', 'error')
      }
    } catch {
      productStoreIds = prev
      showToast('Netzwerkfehler.', 'error')
    } finally {
      storeSaving = false
    }
  }


  function expiryOf(bestBeforeDate: string | null) {
    if (!bestBeforeDate) return { label: '⚠ Kein MHD', cls: 'mhd-none' }
    const d = new Date(bestBeforeDate)
    const st = getExpiryStatus(d, data.expirySettings.graceDaysAfter, {
      yellowDaysBefore: data.expirySettings.yellowDaysBefore,
      redDaysBefore: data.expirySettings.redDaysBefore,
    })
    const days = getDaysRemaining(d, data.expirySettings.graceDaysAfter)
    return { label: getExpiryLabel(st, days), cls: EXPIRY_CLASS[st] }
  }

  function statusLabel(status: string): string {
    switch (status) {
      case 'consumed': return 'Verbraucht'
      case 'expired': return 'Abgelaufen'
      case 'donated': return 'Gespendet'
      case 'discarded': return 'Entsorgt'
      default: return ''
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Nutrients editor (product-wide)
  // ═══════════════════════════════════════════════════════════════════════════

  // svelte-ignore state_referenced_locally
  let nutrientRows = $state<NutrientEditRow[]>(
    (product.nutrients ?? []).map((n: { nutrientTypeId: string; valuePer100: string }) => ({
      nutrientTypeId: n.nutrientTypeId,
      valuePer100: String(n.valuePer100),
    }))
  )

  // Types not yet used in a row (avoid duplicate selection)
  const availableTypes = $derived(
    nutrientTypes.filter((t) => !nutrientRows.some((r) => r.nutrientTypeId === t.id))
  )

  let addingNutrient = $state(false)
  let selectedNewType = $state('')

  // Custom nutrient-type inline form
  let showCustomForm = $state(false)
  let customName = $state('')
  let customUnit = $state('g')
  let customSaving = $state(false)

  async function addNutrientRow() {
    if (!selectedNewType) return
    // Add row with value 0, persist immediately so it exists product-wide
    const typeId = selectedNewType
    selectedNewType = ''
    nutrientRows = [...nutrientRows, { nutrientTypeId: typeId, valuePer100: '0' }]
    await saveNutrient(typeId, '0')
  }

  async function saveNutrient(nutrientTypeId: string, valuePer100: string) {
    const value = Number(valuePer100)
    if (!Number.isFinite(value) || value < 0) {
      showToast('Ungültiger Wert', 'error')
      return
    }
    const res = await fetch(`/api/products/${product.id}/nutrients`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nutrientTypeId, valuePer100: value }),
    })
    if (!res.ok) {
      showToast('Fehler beim Speichern des Nährwerts', 'error')
      return
    }
    nutrientRows = nutrientRows.map((r) =>
      r.nutrientTypeId === nutrientTypeId ? { ...r, valuePer100: String(value) } : r
    )
    showToast('Nährwert gespeichert')
  }

  async function deleteNutrientRow(nutrientTypeId: string) {
    const res = await fetch(
      `/api/products/${product.id}/nutrients?nutrientTypeId=${encodeURIComponent(nutrientTypeId)}`,
      { method: 'DELETE' }
    )
    if (!res.ok && res.status !== 204) {
      showToast('Fehler beim Löschen', 'error')
      return
    }
    nutrientRows = nutrientRows.filter((r) => r.nutrientTypeId !== nutrientTypeId)
    showToast('Nährwert entfernt')
  }

  async function createCustomNutrient() {
    const name = customName.trim()
    const unit = customUnit.trim()
    if (!name || !unit) { showToast('Name und Einheit erforderlich', 'error'); return }
    customSaving = true
    try {
      const res = await fetch('/api/nutrient-types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, unit }),
      })
      const type = await res.json().catch(() => null)
      if (!res.ok || !type?.id) {
        showToast(String(type?.error ?? 'Fehler beim Anlegen'), 'error')
        return
      }
      if (!nutrientTypes.some((t) => t.id === type.id)) {
        nutrientTypes = [...nutrientTypes, type]
      }
      showCustomForm = false
      customName = ''
      customUnit = 'g'
      // Add a row for it right away
      nutrientRows = [...nutrientRows, { nutrientTypeId: type.id, valuePer100: '0' }]
      await saveNutrient(type.id, '0')
    } finally {
      customSaving = false
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Stock entries (siblings) — list + inline edit
  // ═══════════════════════════════════════════════════════════════════════════

  // svelte-ignore state_referenced_locally
  let siblings = $state<Sibling[]>(data.siblings as Sibling[])

  let editingRowId = $state<string | null>(null)
  let draftQuantity = $state('')
  let draftUnit = $state('')
  let draftMhd = $state('')
  let draftStoreId = $state('')

  function startRowEdit(row: Sibling) {
    editingRowId = row.id
    draftQuantity = String(row.quantity)
    draftUnit = row.unit
    draftMhd = row.bestBeforeDate ?? ''
    draftStoreId = row.storeId ?? ''
  }
  function cancelRowEdit() { editingRowId = null }

  async function saveRow(row: Sibling) {
    const patch = {
      quantity: draftQuantity,
      unit: draftUnit,
      bestBeforeDate: draftMhd || null,
      storeId: draftStoreId || null,
    }
    const res = await fetch(`/api/inventory/${row.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (!res.ok) { showToast('Fehler beim Speichern', 'error'); return }
    const store = availableStores.find((s) => s.id === draftStoreId) ?? null
    siblings = siblings.map((s) =>
      s.id === row.id
        ? { ...s, quantity: draftQuantity, unit: draftUnit, bestBeforeDate: draftMhd || null, storeId: draftStoreId || null, store }
        : s
    )
    editingRowId = null
    showToast('Bestand gespeichert')
  }

  async function consumeRow(row: Sibling) {
    const res = await fetch(`/api/inventory/${row.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'consumed' }),
    })
    if (!res.ok) { showToast('Fehler', 'error'); return }
    siblings = siblings.map((s) => (s.id === row.id ? { ...s, status: 'consumed' } : s))
    showToast('Als verbraucht markiert')
  }

  // Spenden / Entsorgen — analog consumeRow, anderer Zielstatus.
  async function setRowStatus(row: Sibling, status: 'donated' | 'discarded', label: string) {
    const res = await fetch(`/api/inventory/${row.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (!res.ok) { showToast('Fehler', 'error'); return }
    siblings = siblings.map((s) => (s.id === row.id ? { ...s, status } : s))
    showToast(label)
  }

  async function deleteRow(row: Sibling) {
    const res = await fetch(`/api/inventory/${row.id}`, { method: 'DELETE' })
    if (!res.ok && res.status !== 204) { showToast('Fehler beim Entfernen', 'error'); return }
    siblings = siblings.filter((s) => s.id !== row.id)
    showToast('Bestand entfernt')
    if (siblings.length === 0) goto('/inventar')
  }

  // ── Location picker (per sibling) ───────────────────────────────────────────

  let showLocationPicker = $state(false)
  let pickerTargetId = $state<string | null>(null)

  function openLocationPicker(rowId: string) {
    pickerTargetId = rowId
    showLocationPicker = true
  }
  function closeLocationPicker() {
    showLocationPicker = false
    pickerTargetId = null
  }

  async function selectPlace(placeId: string) {
    const rowId = pickerTargetId
    closeLocationPicker()
    if (!rowId) return
    const res = await fetch(`/api/inventory/${rowId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ placeId }),
    })
    if (!res.ok) { showToast('Fehler beim Speichern des Lagerorts', 'error'); return }
    // Rebuild locationPath for that row from allLocations
    let path: LocSegment[] = []
    for (const loc of data.allLocations) {
      for (const st of loc.storages) {
        for (const pl of st.places) {
          if (pl.id === placeId) {
            path = [
              { id: loc.id, name: loc.name, kind: 'location' },
              { id: st.id, name: st.name, kind: 'storage' },
              { id: pl.id, name: pl.name, kind: 'place' },
            ]
          }
        }
      }
    }
    siblings = siblings.map((s) => (s.id === rowId ? { ...s, placeId, locationPath: path } : s))
    showToast('Lagerort gespeichert')
  }

  // ── Product-wide destructive actions ────────────────────────────────────────

  async function deleteProductCatalog() {
    const res = await fetch(`/api/products/${product.id}`, { method: 'DELETE' })
    if (res.status === 409) {
      const b = await res.json().catch(() => ({}))
      showToast(String(b?.error ?? 'Produkt hat noch Bestände.'), 'error')
      return
    }
    if (!res.ok && res.status !== 204) { showToast('Fehler beim Löschen', 'error'); return }
    goto('/inventar')
  }

  // deleteAll uses the server action (transaction: product + all stock)
  function submitDeleteAll() {
    ;(document.getElementById('frm-del-all') as HTMLFormElement)?.submit()
  }
</script>

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
    <div class="product-hero">
      <div class="product-image-placeholder" aria-hidden="true">
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
          <rect width="40" height="40" rx="8" fill="var(--color-primary-subtle)"/>
          <path d="M10 28l6-8 4 5 3-3 7 6" stroke="var(--color-primary)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
          <circle cx="14" cy="18" r="3" stroke="var(--color-primary)" stroke-width="1.5" fill="none"/>
        </svg>
      </div>
      <div class="product-info">
        <h1 class="product-name">{product.name}</h1>
        {#if product.brand}<span class="product-brand">{product.brand}</span>{/if}
        {#if product.category}<span class="product-category">{product.category.name}</span>{/if}
      </div>
    </div>
    {#if product.description}
      <p class="product-desc">{product.description}</p>
    {/if}
    <div class="stock-total">
      <span class="stock-total-label">Gesamtbestand</span>
      <span class="stock-total-value">{formatStockTotal(data.stockTotals)}</span>
      {#if data.stockTotals.itemCount > 0}
        <span class="stock-total-count">aus {data.stockTotals.itemCount} {data.stockTotals.itemCount === 1 ? 'Bestand' : 'Beständen'}</span>
      {/if}
      <button class="target-edit-btn" type="button" onclick={openInventoryModal}>Bestand korrigieren</button>
    </div>

    <!-- Soll-/Bedarf-Indikator (2b) -->
    <div class="target-row">
      {#if stockTarget && targetStatus}
        <span class="target-badge target-badge--{targetStatus.status}">{TARGET_LABEL[targetStatus.status]}</span>
        <span class="target-info">Soll: {Number(stockTarget.targetQuantity).toLocaleString('de-DE', { maximumFractionDigits: 3 })} {unitLabel(stockTarget.unit)}{#if stockTarget.minQuantity} · Min: {Number(stockTarget.minQuantity).toLocaleString('de-DE', { maximumFractionDigits: 3 })}{/if}</span>
        <button class="target-edit-btn" type="button" onclick={openTargetModal}>Bearbeiten</button>
      {:else}
        <button class="target-edit-btn" type="button" onclick={openTargetModal}>+ Soll-Bestand festlegen</button>
      {/if}
    </div>
  </div>

  <!-- ── Nutrients editor (product-wide) ────────────────────────────────── -->
  <div class="card">
    <div class="section-header">
      <h2 class="section-title">Nährwerte <span class="section-subtitle">pro 100 g / 100 ml</span></h2>
    </div>
    <p class="scope-hint">Diese Nährwerte gelten für alle Bestände dieses Artikels.</p>

    {#if nutrientRows.length === 0}
      <p class="empty-hint">Noch keine Nährwerte erfasst.</p>
    {:else}
      <div class="nutrient-list">
        {#each nutrientRows as row (row.nutrientTypeId)}
          <div class="nutrient-row">
            <span class="nutrient-name">{nutrientName(row.nutrientTypeId)}</span>
            <input
              class="input nutrient-value"
              type="number"
              min="0"
              step="0.01"
              value={row.valuePer100}
              onblur={(e) => saveNutrient(row.nutrientTypeId, (e.target as HTMLInputElement).value)}
              onkeydown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
              aria-label="{nutrientName(row.nutrientTypeId)} Wert"
            />
            <span class="nutrient-unit">{nutrientUnit(row.nutrientTypeId)}</span>
            <button class="btn-icon-danger" type="button" aria-label="Nährwert entfernen" onclick={() => deleteNutrientRow(row.nutrientTypeId)}>
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M2 3.5h10M5 3.5V2.5h4v1M5.5 6v4M8.5 6v4M3 3.5l.7 8h6.6l.7-8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </div>
        {/each}
      </div>
    {/if}

    <!-- Add nutrient row -->
    <div class="nutrient-add">
      <select class="input" bind:value={selectedNewType} disabled={addingNutrient} aria-label="Nährstoff wählen">
        <option value="">+ Nährstoff hinzufügen…</option>
        {#each availableTypes as t (t.id)}
          <option value={t.id}>{t.name} ({t.unit})</option>
        {/each}
      </select>
      <button class="btn-secondary" type="button" onclick={addNutrientRow} disabled={!selectedNewType}>Hinzufügen</button>
      <button class="btn-link" type="button" onclick={() => (showCustomForm = !showCustomForm)}>
        {showCustomForm ? 'Abbrechen' : 'Eigener Nährstoff'}
      </button>
    </div>

    {#if showCustomForm}
      <div class="custom-nutrient">
        <input class="input" type="text" placeholder="Name (z.B. Magnesium)" bind:value={customName} maxlength="128" aria-label="Name des Nährstoffs" />
        <input class="input custom-unit" type="text" placeholder="Einheit" bind:value={customUnit} maxlength="16" aria-label="Einheit" />
        <button class="btn-secondary" type="button" onclick={createCustomNutrient} disabled={customSaving}>Anlegen</button>
      </div>
    {/if}
  </div>

  <!-- ── Märkte (Planung: wo einkaufbar) ────────────────────────────────── -->
  <div class="card">
    <div class="section-header">
      <h2 class="section-title">Märkte <span class="section-subtitle">wo einkaufbar</span></h2>
    </div>
    <p class="scope-hint">Bestimmt, in welchem Markt-Einkauf dieser Artikel auftaucht, wenn Bedarf besteht.</p>
    {#if (data.availableStores as StoreOpt[]).length === 0}
      <p class="empty-hint">Keine Märkte angelegt. Unter Einstellungen → Märkte hinzufügen.</p>
    {:else}
      <div class="store-chips">
        {#each data.availableStores as s (s.id)}
          <button
            class="store-chip"
            class:store-chip--on={isStoreLinked(s.id)}
            type="button"
            disabled={storeSaving}
            onclick={() => toggleStore(s.id)}
          >
            {isStoreLinked(s.id) ? '✓ ' : ''}{s.name}{s.chain ? ` (${s.chain})` : ''}
          </button>
        {/each}
      </div>
    {/if}
  </div>

  <!-- ── Stock entries (siblings) ───────────────────────────────────────── -->
  <div class="card">
    <div class="section-header">
      <h2 class="section-title">Bestände <span class="section-subtitle">({siblings.length})</span></h2>
    </div>

    {#if siblings.length === 0}
      <p class="empty-hint">Keine Bestände. Über „Bestand hinzufügen" im Inventar anlegen.</p>
    {:else}
      <div class="stock-list">
        {#each siblings as row (row.id)}
          {@const exp = expiryOf(row.bestBeforeDate)}
          <div class="stock-entry" class:stock-entry--current={row.id === data.item.id} class:stock-entry--consumed={row.status !== 'available'}>
            {#if editingRowId === row.id}
              <!-- Inline edit -->
              <div class="stock-edit">
                <div class="stock-edit-fields">
                  <label class="mini-field">
                    <span class="mini-label">Menge</span>
                    <input class="input" type="number" min="0" step="0.25" bind:value={draftQuantity} />
                  </label>
                  <label class="mini-field">
                    <span class="mini-label">Einheit</span>
                    <select class="input" bind:value={draftUnit}>
                      {#each units as u (u.id)}<option value={u.symbol}>{u.name}</option>{/each}
                    </select>
                  </label>
                  <label class="mini-field">
                    <span class="mini-label">MHD</span>
                    <input class="input" type="date" bind:value={draftMhd} />
                  </label>
                  <label class="mini-field">
                    <span class="mini-label">Markt</span>
                    <select class="input" bind:value={draftStoreId}>
                      <option value="">Kein Markt</option>
                      {#each availableStores as s (s.id)}<option value={s.id}>{s.name}{s.chain ? ` (${s.chain})` : ''}</option>{/each}
                    </select>
                  </label>
                </div>
                <button class="btn-link" type="button" onclick={() => openLocationPicker(row.id)}>
                  Lagerort: {row.locationPath.length ? row.locationPath.map((p) => p.name).join(' › ') : 'wählen…'}
                </button>
                <div class="stock-edit-actions">
                  <button class="btn-secondary" type="button" onclick={() => saveRow(row)}>Speichern</button>
                  <button class="btn-link" type="button" onclick={cancelRowEdit}>Abbrechen</button>
                </div>
              </div>
            {:else}
              <!-- Display -->
              <div class="stock-main">
                <span class="stock-qty">{row.quantity} {unitLabel(row.unit)}</span>
                <span class="stock-mhd {exp.cls}">{exp.label}</span>
                {#if row.status !== 'available'}
                  <span class="stock-status">{statusLabel(row.status)}</span>
                {/if}
              </div>
              <div class="stock-meta">
                {#if row.bestBeforeDate}<span>MHD: {formatDate(row.bestBeforeDate)}</span>{/if}
                {#if row.store}<span>· {row.store.name}</span>{/if}
                {#if row.locationPath.length}<span>· {row.locationPath.map((p) => p.name).join(' › ')}</span>{/if}
              </div>
              <div class="stock-actions">
                <button class="btn-link" type="button" onclick={() => startRowEdit(row)}>Bearbeiten</button>
                {#if row.status === 'available'}
                  <button class="btn-link" type="button" onclick={() => consumeRow(row)}>Verbraucht</button>
                  <button class="btn-link" type="button" onclick={() => setRowStatus(row, 'donated', 'Als gespendet markiert')}>Gespendet</button>
                  <button class="btn-link" type="button" onclick={() => setRowStatus(row, 'discarded', 'Als entsorgt markiert')}>Entsorgt</button>
                {/if}
                <button class="btn-link btn-link--danger" type="button" onclick={() => deleteRow(row)}>Entfernen</button>
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <!-- ── Product-wide actions ───────────────────────────────────────────── -->
  <div class="card actions-card actions-card--danger">
    <button
      class="btn-delete-product"
      type="button"
      onclick={() => showConfirm(
        'Produkt aus Katalog entfernen?',
        `„${product.name}" wird aus dem Katalog entfernt. Nur möglich, wenn keine Bestände mehr existieren.`,
        () => { closeConfirm(); deleteProductCatalog() }
      )}
    >
      Produkt aus Katalog entfernen
    </button>
    <button
      class="btn-delete-all"
      type="button"
      onclick={() => showConfirm(
        'Artikel vollständig löschen?',
        'Produkt, alle Bestände und alle zugehörigen Nährwertangaben werden dauerhaft gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.',
        () => { closeConfirm(); submitDeleteAll() },
        'Alles löschen'
      )}
    >
      Alles löschen (inkl. Bestände)
    </button>
    <form id="frm-del-all" method="POST" action="?/deleteAll" style="display:none"></form>
  </div>
</div>

<!-- ── Location picker (Modal) ────────────────────────────────────────────── -->
<Modal open={showLocationPicker} title="Lagerort auswählen" size="md" onClose={closeLocationPicker}>
  {#if data.allLocations.length === 0}
    <p class="empty-hint">Keine Lagerorte vorhanden. Lege zuerst Räume an.</p>
  {:else}
    {#each data.allLocations as loc (loc.id)}
      <div class="picker-location">
        <div class="picker-location-name"><span class="picker-icon">{loc.icon ?? '📍'}</span> {loc.name}</div>
        {#each loc.storages as st (st.id)}
          <div class="picker-storage">
            <div class="picker-storage-name">{st.name}</div>
            {#if st.places.length > 0}
              <div class="picker-places">
                {#each st.places as pl (pl.id)}
                  <button class="picker-place-btn" type="button" onclick={() => selectPlace(pl.id)}>{pl.name}</button>
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
  {#snippet footer()}
    <button class="btn-link" type="button" onclick={closeLocationPicker}>Abbrechen</button>
  {/snippet}
</Modal>

<!-- ── Toasts ─────────────────────────────────────────────────────────────── -->
{#if toasts.length > 0}
  <div class="toast-container" role="status" aria-live="polite">
    {#each toasts as toast (toast.id)}
      <div class="toast" class:toast--error={toast.type === 'error'}>{toast.message}</div>
    {/each}
  </div>
{/if}

<!-- ── Bestandskorrektur / Inventur (Modal) ───────────────────────────────── -->
<Modal open={showInventoryModal} title="Bestand korrigieren" size="sm" onClose={() => (showInventoryModal = false)}>
  <p class="scope-hint">Gib den tatsächlichen aktuellen Bestand an. Die Differenz wird auf die Bestände verrechnet (älteste MHD zuerst) und fließt als Bedarf auf die Einkaufsliste.</p>
  {#if invError}<p class="field-error">{invError}</p>{/if}
  {#if invNeedsIncrease}
    <p class="field-error">Der neue Bestand ist höher als der erfasste. Bitte den Zuwachs über „Bestand hinzufügen" mit MHD/Markt erfassen.</p>
  {/if}
  <div class="target-form">
    {#if (data.stockTotals.groups as StockGroupView[]).length > 1}
      <label class="tf-field">
        <span class="tf-label">Einheit-Gruppe</span>
        <select class="input" bind:value={invUnit} onchange={onInvUnitChange}>
          {#each data.stockTotals.groups as g (g.displayUnit)}
            <option value={g.displayUnit}>{g.displayName}</option>
          {/each}
        </select>
      </label>
    {/if}
    <label class="tf-field">
      <span class="tf-label">Tatsächlicher Bestand ({unitLabel(invUnit)})</span>
      <input class="input" type="number" min="0" step="0.25" bind:value={invValue} />
    </label>
  </div>
  {#snippet footer()}
    <button class="btn-secondary" type="button" disabled={invSaving} onclick={saveInventory}>Übernehmen</button>
  {/snippet}
</Modal>

<!-- ── Soll-Bestand (Modal) ───────────────────────────────────────────────── -->
<Modal open={showTargetModal} title="Soll-Bestand festlegen" size="sm" onClose={() => (showTargetModal = false)}>
  <p class="scope-hint">Definiert den gewünschten Bestand dieses Artikels. Bei Unterschreitung entsteht Bedarf (später auf der Einkaufsliste).</p>
  {#if targetError}<p class="field-error">{targetError}</p>{/if}
  <div class="target-form">
    <label class="tf-field">
      <span class="tf-label">Soll-Menge</span>
      <input class="input" type="number" min="0" step="0.25" bind:value={targetQtyInput} />
    </label>
    <label class="tf-field">
      <span class="tf-label">Einheit</span>
      <select class="input" bind:value={targetUnitInput}>
        {#each units as u (u.id)}<option value={u.symbol}>{u.name}</option>{/each}
      </select>
    </label>
    <label class="tf-field">
      <span class="tf-label">Mindestbestand (optional)</span>
      <input class="input" type="number" min="0" step="0.25" bind:value={targetMinInput} placeholder="z.B. 1" />
    </label>
  </div>
  {#snippet footer()}
    {#if stockTarget}
      <button class="btn-link btn-link--danger" type="button" onclick={deleteTarget}>Entfernen</button>
    {/if}
    <button class="btn-secondary" type="button" disabled={targetSaving} onclick={saveTarget}>Speichern</button>
  {/snippet}
</Modal>

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
  .page {
    max-width: 680px;
    margin: 0 auto;
    padding: var(--space-6) var(--space-4) var(--space-16);
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

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
  }
  .back-link:hover { color: var(--color-primary); }

  .card {
    background-color: var(--color-surface-raised);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: var(--space-5) var(--space-5);
    box-shadow: var(--shadow-sm);
  }

  .section-header { margin-bottom: var(--space-3); }
  .section-title {
    font-family: var(--font-display);
    font-size: var(--text-lg);
    font-weight: 700;
    color: var(--color-text-primary);
    margin: 0;
  }
  .section-subtitle {
    font-size: var(--text-xs);
    font-weight: 500;
    color: var(--color-text-muted);
  }

  .scope-hint {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    margin: 0 0 var(--space-3);
  }
  .empty-hint {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    margin: var(--space-1) 0;
  }

  .store-chips { display: flex; flex-wrap: wrap; gap: var(--space-2); }
  .store-chip {
    border: 1px solid var(--color-border);
    background: var(--color-surface);
    color: var(--color-text-secondary);
    border-radius: var(--radius-full);
    padding: var(--space-1) var(--space-3);
    font-size: var(--text-sm);
    font-weight: 500;
    cursor: pointer;
    transition: border-color var(--transition-fast), background var(--transition-fast), color var(--transition-fast);
  }
  .store-chip:hover:not(:disabled) { border-color: var(--color-primary); }
  .store-chip--on { border-color: var(--color-primary); background: var(--color-primary-subtle); color: var(--color-primary); font-weight: 600; }
  .store-chip:disabled { opacity: 0.6; cursor: not-allowed; }

  /* ── Product header ─────────────────────────────────────────────────── */
  .product-hero { display: flex; gap: var(--space-4); align-items: flex-start; }
  .product-image-placeholder { flex-shrink: 0; }
  .product-info { display: flex; flex-direction: column; gap: var(--space-1); min-width: 0; }
  .product-name {
    font-family: var(--font-display);
    font-size: var(--text-xl);
    font-weight: 700;
    color: var(--color-text-primary);
    margin: 0;
    word-break: break-word;
  }
  .product-brand, .product-category {
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
  }
  .product-desc {
    margin: var(--space-3) 0 0;
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
    line-height: 1.5;
  }

  .stock-total {
    margin-top: var(--space-4);
    padding-top: var(--space-3);
    border-top: 1px solid var(--color-border-subtle);
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--space-2);
  }
  .stock-total-label {
    font-size: var(--text-xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--color-text-muted);
  }
  .stock-total-value {
    font-family: var(--font-display);
    font-size: var(--text-lg);
    font-weight: 700;
    color: var(--color-text-primary);
  }
  .stock-total-count {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
  }

  /* ── Soll/Bedarf ─────────────────────────────────────────────────────── */
  .target-row {
    margin-top: var(--space-3);
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
  }
  .target-badge {
    display: inline-flex;
    align-items: center;
    height: 22px;
    padding: 0 var(--space-2);
    border-radius: var(--radius-full);
    font-size: 11px;
    font-weight: 700;
  }
  .target-badge--ok { background: var(--color-success-subtle, #dcfce7); color: var(--color-success, #16a34a); }
  .target-badge--below_target { background: #fef9c3; color: #ca8a04; }
  .target-badge--below_min { background: var(--color-danger-subtle, #fee2e2); color: var(--color-danger, #dc2626); }
  .target-badge--not_comparable { background: var(--color-surface-sunken); color: var(--color-text-muted); }
  .target-info { font-size: var(--text-xs); color: var(--color-text-muted); }
  .target-edit-btn {
    background: none;
    border: none;
    padding: 0;
    color: var(--color-primary);
    font-size: var(--text-xs);
    font-weight: 600;
    cursor: pointer;
  }
  .target-edit-btn:hover { text-decoration: underline; }

  .target-form { display: flex; flex-direction: column; gap: var(--space-3); }
  .tf-field { display: flex; flex-direction: column; gap: var(--space-1); }
  .tf-label { font-size: var(--text-xs); color: var(--color-text-muted); }

  /* ── Inputs / buttons ───────────────────────────────────────────────── */
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
    box-sizing: border-box;
    min-width: 0;
    transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
  }
  .input:focus {
    border-color: var(--color-border-focus);
    box-shadow: 0 0 0 3px rgba(196, 103, 58, 0.15);
  }

  .btn-secondary {
    height: 40px;
    padding: 0 var(--space-4);
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
  }
  .btn-secondary:hover:not(:disabled) { background-color: var(--color-primary-hover); }
  .btn-secondary:disabled { opacity: 0.45; cursor: not-allowed; }

  .btn-link {
    background: none;
    border: none;
    padding: var(--space-1) 0;
    color: var(--color-primary);
    font-family: var(--font-body);
    font-size: var(--text-sm);
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
  }
  .btn-link:hover { color: var(--color-primary-hover); text-decoration: underline; }
  .btn-link--danger { color: var(--color-danger, #dc2626); }

  .btn-icon-danger {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    border: 1px solid var(--color-border);
    background: transparent;
    color: var(--color-text-muted);
    border-radius: var(--radius-md);
    cursor: pointer;
    flex-shrink: 0;
    transition: border-color var(--transition-fast), color var(--transition-fast), background-color var(--transition-fast);
  }
  .btn-icon-danger:hover {
    border-color: var(--color-danger, #dc2626);
    color: var(--color-danger, #dc2626);
    background-color: var(--color-danger-subtle, #fee2e2);
  }

  /* ── Nutrient editor ─────────────────────────────────────────────────── */
  .nutrient-list { display: flex; flex-direction: column; gap: var(--space-2); margin-bottom: var(--space-3); }
  .nutrient-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .nutrient-name { flex: 1; font-size: var(--text-sm); color: var(--color-text-primary); min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .nutrient-value { width: 96px; flex-shrink: 0; }
  .nutrient-unit { width: 36px; flex-shrink: 0; font-size: var(--text-xs); color: var(--color-text-muted); }

  /* Add-Zeile: placeholder-artiger, gestrichelter „Prognose"-Slot */
  .nutrient-add {
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
    align-items: center;
    padding: var(--space-2) var(--space-3);
    border: 1.5px dashed var(--color-border-strong, var(--color-border));
    border-radius: var(--radius-md);
    background: var(--color-surface-sunken);
    transition: border-color var(--transition-fast), background var(--transition-fast);
  }
  .nutrient-add:hover,
  .nutrient-add:focus-within {
    border-color: var(--color-primary);
    background: var(--color-primary-subtle);
  }
  .nutrient-add .input {
    flex: 1 1 180px;
    border-color: transparent;
    background: transparent;
  }
  .nutrient-add .input:focus {
    background: var(--color-surface);
    border-color: var(--color-border);
  }

  .custom-nutrient { display: flex; gap: var(--space-2); flex-wrap: wrap; margin-top: var(--space-3); }
  .custom-nutrient .input { flex: 1 1 160px; }
  .custom-nutrient .custom-unit { flex: 0 1 90px; }

  /* ── Stock list ──────────────────────────────────────────────────────── */
  .stock-list { display: flex; flex-direction: column; gap: var(--space-2); }
  .stock-entry {
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-md);
    padding: var(--space-3);
    background-color: var(--color-surface);
  }
  .stock-entry--current { border-color: var(--color-primary); background-color: var(--color-primary-subtle); }
  .stock-entry--consumed { opacity: 0.6; }

  .stock-main { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
  .stock-qty { font-size: var(--text-base); font-weight: 700; color: var(--color-text-primary); }
  .stock-mhd {
    font-size: var(--text-xs);
    font-weight: 600;
    padding: 2px var(--space-2);
    border-radius: var(--radius-full);
  }
  .stock-status {
    font-size: var(--text-xs);
    font-weight: 600;
    color: var(--color-text-muted);
    padding: 2px var(--space-2);
    border-radius: var(--radius-full);
    background: var(--color-surface-sunken);
  }
  .stock-meta {
    display: flex;
    gap: var(--space-1);
    flex-wrap: wrap;
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    margin-top: var(--space-1);
  }
  .stock-actions { display: flex; gap: var(--space-3); margin-top: var(--space-2); flex-wrap: wrap; }

  .stock-edit { display: flex; flex-direction: column; gap: var(--space-2); }
  .stock-edit-fields { display: flex; gap: var(--space-2); flex-wrap: wrap; }
  .mini-field { display: flex; flex-direction: column; gap: 2px; flex: 1 1 120px; min-width: 0; }
  .mini-label { font-size: var(--text-xs); color: var(--color-text-muted); }
  .stock-edit-actions { display: flex; gap: var(--space-3); align-items: center; }

  /* MHD badge colors (shared classes from expiry utils) */
  :global(.mhd-fresh) { background: var(--color-success-subtle, #dcfce7); color: var(--color-success, #16a34a); }
  :global(.mhd-ok) { background: var(--color-success-subtle, #dcfce7); color: var(--color-success, #16a34a); }
  :global(.mhd-soon) { background: #fef9c3; color: #ca8a04; }
  :global(.mhd-critical) { background: #ffedd5; color: #ea580c; }
  :global(.mhd-expired) { background: var(--color-danger-subtle, #fee2e2); color: var(--color-danger, #dc2626); }
  :global(.mhd-none) { background: #fff7ed; color: #c2410c; border: 1px dashed #fdba74; }

  /* ── Actions card ────────────────────────────────────────────────────── */
  .actions-card { display: flex; flex-direction: column; gap: var(--space-2); }
  .actions-card--danger { border-color: rgba(220, 38, 38, 0.25); }
  .btn-delete-product, .btn-delete-all {
    height: 40px;
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
    background: transparent;
    color: var(--color-text-secondary);
    font-family: var(--font-body);
    font-size: var(--text-sm);
    font-weight: 600;
    cursor: pointer;
    transition: border-color var(--transition-fast), color var(--transition-fast), background-color var(--transition-fast);
  }
  .btn-delete-all { color: var(--color-danger, #dc2626); }
  .btn-delete-product:hover, .btn-delete-all:hover {
    border-color: var(--color-danger, #dc2626);
    color: var(--color-danger, #dc2626);
    background-color: var(--color-danger-subtle, #fee2e2);
  }

  /* ── Location picker (im Modal) ──────────────────────────────────────── */
  .picker-location { margin-bottom: var(--space-4); }
  .picker-location-name { font-weight: 700; font-size: var(--text-sm); margin-bottom: var(--space-2); }
  .picker-storage { margin-left: var(--space-3); margin-bottom: var(--space-2); }
  .picker-storage-name { font-size: var(--text-sm); font-weight: 600; color: var(--color-text-secondary); margin-bottom: var(--space-1); }
  .picker-places { display: flex; flex-wrap: wrap; gap: var(--space-2); }
  .picker-place-btn {
    padding: var(--space-1) var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
    background: var(--color-surface);
    color: var(--color-text-primary);
    font-size: var(--text-sm);
    cursor: pointer;
  }
  .picker-place-btn:hover { border-color: var(--color-primary); background: var(--color-primary-subtle); }
  .picker-no-places { font-size: var(--text-xs); color: var(--color-text-muted); margin: 0; }
  .picker-icon { margin-right: var(--space-1); }

  /* ── Toast ───────────────────────────────────────────────────────────── */
  .toast-container {
    position: fixed;
    bottom: calc(var(--space-6) + 64px);
    left: 50%;
    transform: translateX(-50%);
    z-index: 600;
    display: flex; flex-direction: column; gap: var(--space-2); align-items: center;
    pointer-events: none;
  }
  .toast {
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-lg);
    background: var(--color-accent, #1f2937);
    color: var(--color-text-inverse, #fff);
    font-size: var(--text-sm);
    font-weight: 500;
    box-shadow: var(--shadow-lg);
  }
  .toast--error { background: var(--color-danger, #dc2626); }

  /* ── Responsive ──────────────────────────────────────────────────────── */
  @media (max-width: 560px) {
    .page { padding: var(--space-4) var(--space-3) var(--space-12); }
    .card { padding: var(--space-4); }
    .stock-edit-fields .mini-field { flex-basis: 100%; }
    .nutrient-add .input { flex-basis: 100%; }
    .toast-container { left: var(--space-4); right: var(--space-4); transform: none; }
    .toast { width: 100%; text-align: center; }
  }
</style>

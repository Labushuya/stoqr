<script lang="ts">
  import type { PageData } from './$types'
  import {
    getExpiryStatus,
    getDaysRemaining,
    getExpiryLabel,
    EXPIRY_CLASS,
  } from '$lib/utils/expiry'

  // ── Types ──────────────────────────────────────────────────────────────────

  type Category = {
    id: string
    name: string
    icon: string | null
    slug: string
  }

  type Place = {
    id: string
    name: string
    storage: {
      id: string
      name: string
      location: {
        id: string
        name: string
      }
    }
  }

  type InventoryItem = {
    id: string
    quantity: string
    unit: string
    bestBeforeDate: string | null
    status: 'available' | 'consumed' | 'expired' | 'donated' | 'discarded'
    notes: string | null
    placeId: string | null
    place: Place | null
    product: {
      id: string
      name: string
      brand: string | null
      imageUrl: string | null
      categoryId: string | null
      category: Category | null
    }
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

  // ── Props ──────────────────────────────────────────────────────────────────

  let { data }: { data: PageData } = $props()

  // ── State ──────────────────────────────────────────────────────────────────
  // svelte-ignore state_referenced_locally
  let items = $state<InventoryItem[]>(data.items as InventoryItem[])
  // svelte-ignore state_referenced_locally
  let locationTree = $state<LocationTree[]>(data.locations as LocationTree[])

  let searchQuery = $state('')
  let filterPlaceId = $state('')
  let filterAvailableOnly = $state(true)

  let showSheet = $state(false)
  let sheetMode = $state<'add' | 'edit'>('add')
  let editingItem = $state<InventoryItem | null>(null)

  // Menu open state: itemId → boolean
  let openMenuId = $state<string | null>(null)

  // Toast
  type Toast = { id: number; message: string; type: 'success' | 'error' }
  let toasts = $state<Toast[]>([])
  let toastCounter = 0

  // Categories — initialised from server data, refreshed lazily if needed
  // svelte-ignore state_referenced_locally
  let categories = $state<Category[]>(data.categories as Category[])
  let categoriesLoaded = $state(true)

  // Add/edit form fields
  let formProductName = $state('')
  let formBarcode = $state('')
  let formCategoryId = $state('')
  let formLocationId = $state('')
  let formStorageId = $state('')
  let formPlaceId = $state('')
  let formMhd = $state('')
  let formQuantity = $state('1')
  let formUnit = $state('Stück')
  let formNotes = $state('')
  let formSaving = $state(false)

  // Barcode scanner
  let showScanner = $state(false)
  let scannerLoading = $state(false)
  let scannerNotFound = $state(false)
  let scannerVideoEl = $state<HTMLVideoElement | null>(null)
  let scannerStream = $state<MediaStream | null>(null)
  let scannerAnimFrame = $state<number | null>(null)

  // Expiry config defaults (fallback values — ideally server-loaded)
  const YELLOW_DAYS = 7
  const RED_DAYS = 2
  const TOLERANCE_DAYS = 0

  // svelte-ignore state_referenced_locally
  let unitOptions = $state(data.units as { id: string; name: string; symbol: string }[])

  // ── Derived ────────────────────────────────────────────────────────────────

  const filteredItems = $derived(() => {
    let result = items

    if (filterAvailableOnly) {
      result = result.filter((i) => i.status === 'available')
    }

    if (filterPlaceId) {
      result = result.filter((i) => i.placeId === filterPlaceId)
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      result = result.filter(
        (i) =>
          i.product.name.toLowerCase().includes(q) ||
          (i.product.brand ?? '').toLowerCase().includes(q)
      )
    }

    return result
  })

  // All places flat list for filter dropdown
  const allPlaces = $derived(() => {
    const list: { id: string; label: string }[] = []
    for (const loc of locationTree) {
      for (const st of loc.storages) {
        for (const pl of st.places) {
          list.push({ id: pl.id, label: `${loc.name} › ${st.name} › ${pl.name}` })
        }
      }
    }
    return list
  })

  // Storages for selected locationId in form
  const formStorages = $derived(() => {
    if (!formLocationId) return []
    const loc = locationTree.find((l) => l.id === formLocationId)
    return loc?.storages ?? []
  })

  // Places for selected storageId in form
  const formPlaces = $derived(() => {
    if (!formStorageId) return []
    const st = formStorages().find((s) => s.id === formStorageId)
    return st?.places ?? []
  })

  // ── Toast helpers ──────────────────────────────────────────────────────────

  function showToast(message: string, type: 'success' | 'error' = 'success') {
    const id = ++toastCounter
    toasts = [...toasts, { id, message, type }]
    setTimeout(() => {
      toasts = toasts.filter((t) => t.id !== id)
    }, 3500)
  }

  // ── Expiry helpers ─────────────────────────────────────────────────────────

  function expiryInfo(item: InventoryItem): {
    cssClass: string
    label: string
    hasDate: boolean
  } {
    if (!item.bestBeforeDate) {
      return { cssClass: 'mhd-fresh', label: 'Kein MHD', hasDate: false }
    }
    const date = new Date(item.bestBeforeDate)
    const status = getExpiryStatus(date, TOLERANCE_DAYS, {
      yellowDaysBefore: YELLOW_DAYS,
      redDaysBefore: RED_DAYS,
    })
    const days = getDaysRemaining(date, TOLERANCE_DAYS)
    const label = getExpiryLabel(status, days)
    return { cssClass: EXPIRY_CLASS[status], label, hasDate: true }
  }

  // ── Location breadcrumb ────────────────────────────────────────────────────

  function placeBreadcrumb(item: InventoryItem): string {
    if (!item.place) return ''
    return `${item.place.storage.location.name} › ${item.place.storage.name} › ${item.place.name}`
  }

  // ── Unit display ───────────────────────────────────────────────────────────

  function unitLabel(unit: string): string {
    const map: Record<string, string> = {
      piece: 'Stück',
      g: 'g',
      kg: 'kg',
      ml: 'ml',
      l: 'l',
    }
    return map[unit] ?? unit
  }

  function quantityDisplay(item: InventoryItem): string {
    const qty = parseFloat(item.quantity)
    const unit = unitLabel(item.unit)
    return `${qty % 1 === 0 ? qty.toFixed(0) : qty} ${unit}`
  }

  // ── Category icon ──────────────────────────────────────────────────────────

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

  function categoryIcon(item: InventoryItem): string {
    if (item.product.category?.icon) return item.product.category.icon
    const slug = item.product.category?.slug ?? ''
    for (const [key, icon] of Object.entries(CATEGORY_ICONS)) {
      if (slug.includes(key)) return icon
    }
    return '📦'
  }

  // ── Load categories ────────────────────────────────────────────────────────

  async function loadCategories() {
    if (categoriesLoaded) return
    const res = await fetch('/api/categories')
    if (res.ok) categories = await res.json()
    categoriesLoaded = true
  }

  // ── Open sheet ─────────────────────────────────────────────────────────────

  async function openAddSheet() {
    sheetMode = 'add'
    editingItem = null
    formProductName = ''
    formBarcode = ''
    formCategoryId = ''
    formLocationId = ''
    formStorageId = ''
    formPlaceId = ''
    formMhd = ''
    formQuantity = '1'
    formUnit = 'Stück'
    formNotes = ''
    showSheet = true
    await loadCategories()
  }

  async function openEditSheet(item: InventoryItem) {
    sheetMode = 'edit'
    editingItem = item
    formProductName = item.product.name
    formBarcode = ''
    formCategoryId = item.product.category?.id ?? ''
    formMhd = item.bestBeforeDate ?? ''
    formQuantity = item.quantity
    formUnit = item.unit
    formNotes = item.notes ?? ''

    // Set cascading place selectors
    if (item.place) {
      formLocationId = item.place.storage.location.id
      formStorageId = item.place.storage.id
      formPlaceId = item.placeId ?? ''
    } else {
      formLocationId = ''
      formStorageId = ''
      formPlaceId = ''
    }

    showSheet = true
    await loadCategories()
  }

  function closeSheet() {
    showSheet = false
  }

  // Reset child selectors when parent changes
  function onLocationChange() {
    formStorageId = ''
    formPlaceId = ''
  }

  function onStorageChange() {
    formPlaceId = ''
  }

  // ── Save item ──────────────────────────────────────────────────────────────

  async function saveItem() {
    if (!formProductName.trim()) return
    formSaving = true

    // Use symbol directly — unitOptions already stores the canonical symbol
    const unitValue = formUnit

    try {
      if (sheetMode === 'add') {
        const res = await fetch('/api/inventory', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            productName: formProductName.trim(),
            gtin: formBarcode.trim() || undefined,
            categoryId: formCategoryId || undefined,
            placeId: formPlaceId || undefined,
            bestBeforeDate: formMhd || undefined,
            quantity: formQuantity,
            unit: unitValue,
            notes: formNotes.trim() || undefined,
          }),
        })
        if (!res.ok) throw new Error(await res.text())
        // Reload items
        const refreshed = await fetch('/api/inventory')
        if (refreshed.ok) {
          const all: InventoryItem[] = await refreshed.json()
          items = all
        }
        showToast('Produkt hinzugefügt')
      } else if (sheetMode === 'edit' && editingItem) {
        const res = await fetch(`/api/inventory/${editingItem.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            placeId: formPlaceId || null,
            bestBeforeDate: formMhd || null,
            quantity: formQuantity,
            unit: unitValue,
            notes: formNotes.trim() || null,
            categoryId: formCategoryId || undefined,
          }),
        })
        if (!res.ok) throw new Error(await res.text())
        const updated = await res.json()
        // Patch local state (product stays same, only item fields change)
        const selectedCat = categories.find((c) => c.id === formCategoryId) || null
        items = items.map((i) =>
          i.id === editingItem!.id
            ? {
                ...i,
                quantity: updated.quantity,
                unit: updated.unit,
                bestBeforeDate: updated.bestBeforeDate,
                placeId: updated.placeId,
                notes: updated.notes,
                product: { ...i.product, categoryId: formCategoryId || null, category: selectedCat },
              }
            : i
        )
        // Update place breadcrumb from locationTree
        if (updated.placeId) {
          for (const loc of locationTree) {
            for (const st of loc.storages) {
              for (const pl of st.places) {
                if (pl.id === updated.placeId) {
                  items = items.map((i) =>
                    i.id === editingItem!.id
                      ? {
                          ...i,
                          place: {
                            id: pl.id,
                            name: pl.name,
                            storage: {
                              id: st.id,
                              name: st.name,
                              location: { id: loc.id, name: loc.name },
                            },
                          },
                        }
                      : i
                  )
                }
              }
            }
          }
        } else {
          items = items.map((i) =>
            i.id === editingItem!.id ? { ...i, place: null } : i
          )
        }
        showToast('Gespeichert')
      }
      closeSheet()
    } catch {
      showToast('Fehler beim Speichern', 'error')
    } finally {
      formSaving = false
    }
  }

  // ── Consume item ───────────────────────────────────────────────────────────

  async function consumeItem(item: InventoryItem) {
    openMenuId = null
    try {
      const res = await fetch(`/api/inventory/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'consumed' }),
      })
      if (!res.ok) throw new Error(await res.text())
      items = items.map((i) => (i.id === item.id ? { ...i, status: 'consumed' } : i))
      showToast(`"${item.product.name}" als verbraucht markiert`)
    } catch {
      showToast('Fehler', 'error')
    }
  }

  // ── Delete item ────────────────────────────────────────────────────────────

  async function deleteItem(item: InventoryItem) {
    openMenuId = null
    if (!window.confirm(`"${item.product.name}" wirklich löschen?`)) return
    try {
      const res = await fetch(`/api/inventory/${item.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await res.text())
      items = items.filter((i) => i.id !== item.id)
      showToast(`"${item.product.name}" gelöscht`)
    } catch {
      showToast('Fehler beim Löschen', 'error')
    }
  }

  // ── Menu toggle ────────────────────────────────────────────────────────────

  function toggleMenu(id: string, e: MouseEvent) {
    e.stopPropagation()
    openMenuId = openMenuId === id ? null : id
  }

  function closeMenu() {
    openMenuId = null
  }

  // ── Barcode scanner ────────────────────────────────────────────────────────

  async function openScanner() {
    scannerNotFound = false
    scannerLoading = false
    showScanner = true
    // Give DOM time to mount the video element
    await new Promise((r) => setTimeout(r, 80))
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      })
      scannerStream = stream
      if (scannerVideoEl) {
        scannerVideoEl.srcObject = stream
        await scannerVideoEl.play()
        startBarcodeDetection()
      }
    } catch {
      showToast('Kamerazugriff verweigert', 'error')
      closeScanner()
    }
  }

  function closeScanner() {
    if (scannerAnimFrame !== null) {
      cancelAnimationFrame(scannerAnimFrame)
      scannerAnimFrame = null
    }
    if (scannerStream) {
      scannerStream.getTracks().forEach((t) => t.stop())
      scannerStream = null
    }
    showScanner = false
  }

  function startBarcodeDetection() {
    // Use BarcodeDetector API if available
    if (!('BarcodeDetector' in window)) {
      showToast('BarcodeDetector nicht verfügbar — bitte manuell eingeben', 'error')
      closeScanner()
      return
    }
    // @ts-expect-error BarcodeDetector is not yet in all TS libs
    const detector = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'] })

    async function detect() {
      if (!scannerVideoEl || !showScanner) return
      try {
        const codes = await detector.detect(scannerVideoEl)
        if (codes.length > 0) {
          const rawValue: string = codes[0].rawValue
          await onBarcodeDetected(rawValue)
          return
        }
      } catch {
        // detection frame failed, retry
      }
      scannerAnimFrame = requestAnimationFrame(detect)
    }

    scannerAnimFrame = requestAnimationFrame(detect)
  }

  async function onBarcodeDetected(gtin: string) {
    closeScanner()
    formBarcode = gtin
    scannerLoading = true
    scannerNotFound = false
    try {
      const res = await fetch(`/api/barcode/${encodeURIComponent(gtin)}`)
      if (res.ok) {
        const product = await res.json()
        if (product) {
          if (product.name)  formProductName = product.name
          if (product.brand) {
            // brand is not a standalone form field but stored on product;
            // set notes hint if brand not otherwise capturable
          }
          if (product.categoryId) formCategoryId = product.categoryId
          scannerNotFound = false
        } else {
          scannerNotFound = true
        }
      } else if (res.status === 404) {
        scannerNotFound = true
      } else {
        showToast('Fehler beim Abrufen des Produkts', 'error')
      }
    } catch {
      showToast('Netzwerkfehler beim Barcode-Lookup', 'error')
    } finally {
      scannerLoading = false
    }
  }

  // ── Sheet keyboard ─────────────────────────────────────────────────────────

  function onSheetKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') closeSheet()
  }
</script>

<!-- Click outside to close menus -->
<svelte:window onclick={closeMenu} />

<!-- ── Page ──────────────────────────────────────────────────────────────── -->

<div class="page">
  <!-- Header -->
  <div class="page-header">
    <h1 class="page-title">Inventar</h1>
    <span class="item-count">{filteredItems().length} Artikel</span>
  </div>

  <!-- Search bar -->
  <div class="search-wrap">
    <svg class="search-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="5" stroke="currentColor" stroke-width="1.5"/>
      <path d="M10.5 10.5L14 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    </svg>
    <input
      class="search-input"
      type="search"
      placeholder="Produkt suchen…"
      bind:value={searchQuery}
      aria-label="Inventar durchsuchen"
    />
  </div>

  <!-- Filter row -->
  <div class="filter-row">
    <select
      class="filter-select"
      bind:value={filterPlaceId}
      aria-label="Ort filtern"
    >
      <option value="">Alle Orte</option>
      {#each allPlaces() as place (place.id)}
        <option value={place.id}>{place.label}</option>
      {/each}
    </select>

    <label class="filter-toggle">
      <input
        type="checkbox"
        bind:checked={filterAvailableOnly}
        aria-label="Nur verfügbare anzeigen"
      />
      <span class="toggle-track">
        <span class="toggle-thumb"></span>
      </span>
      <span class="toggle-label">Nur verfügbare</span>
    </label>
  </div>

  <!-- Item grid / empty state -->
  {#if filteredItems().length === 0}
    <div class="empty-state">
      <div class="empty-icon" aria-hidden="true">
        <svg width="72" height="72" viewBox="0 0 72 72" fill="none">
          <rect width="72" height="72" rx="16" fill="var(--color-primary-subtle)"/>
          <rect x="20" y="22" width="32" height="28" rx="4" stroke="var(--color-primary)" stroke-width="2.5" fill="none"/>
          <path d="M28 34h16M28 40h10" stroke="var(--color-primary)" stroke-width="2.5" stroke-linecap="round"/>
          <path d="M28 28h16" stroke="var(--color-primary)" stroke-width="2.5" stroke-linecap="round"/>
        </svg>
      </div>
      {#if searchQuery || filterPlaceId}
        <p class="empty-title">Keine Treffer</p>
        <p class="empty-sub">Passe die Filter an oder entferne den Suchbegriff.</p>
        <button
          class="btn-secondary"
          type="button"
          onclick={() => { searchQuery = ''; filterPlaceId = '' }}
        >Filter zurücksetzen</button>
      {:else}
        <p class="empty-title">Noch nichts im Inventar</p>
        <p class="empty-sub">Füge dein erstes Produkt hinzu, um den Überblick zu behalten.</p>
        <button class="btn-primary btn-primary--lg" type="button" onclick={openAddSheet}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
          Erstes Produkt hinzufügen
        </button>
      {/if}
    </div>
  {:else}
    <ul class="item-grid" role="list">
      {#each filteredItems() as item (item.id)}
        {@const expiry = expiryInfo(item)}
        {@const breadcrumb = placeBreadcrumb(item)}
        {@const icon = categoryIcon(item)}
        <li class="item-card" class:item-card--consumed={item.status !== 'available'}>
          <!-- Image / icon area -->
          <div class="item-thumb">
            {#if item.product.imageUrl}
              <img
                src={item.product.imageUrl}
                alt={item.product.name}
                class="item-image"
                loading="lazy"
              />
            {:else}
              <span class="item-cat-icon" aria-hidden="true">{icon}</span>
            {/if}
          </div>

          <!-- Content -->
          <div class="item-body">
            <div class="item-name-row">
              <span class="item-name">{item.product.name}</span>
              <!-- Three-dot menu -->
              <div class="menu-wrap">
                <button
                  class="btn-dots"
                  type="button"
                  aria-label="Optionen"
                  aria-expanded={openMenuId === item.id}
                  onclick={(e) => toggleMenu(item.id, e)}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <circle cx="8" cy="3" r="1.2" fill="currentColor"/>
                    <circle cx="8" cy="8" r="1.2" fill="currentColor"/>
                    <circle cx="8" cy="13" r="1.2" fill="currentColor"/>
                  </svg>
                </button>
                {#if openMenuId === item.id}
                  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
                  <ul class="dropdown" role="menu" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
                    <li role="menuitem">
                      <button
                        class="dropdown-item"
                        type="button"
                        onclick={() => { closeMenu(); openEditSheet(item) }}
                      >
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                          <path d="M9.5 2.5L11.5 4.5L5 11H3V9L9.5 2.5Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
                        </svg>
                        Bearbeiten
                      </button>
                    </li>
                    {#if item.status === 'available'}
                      <li role="menuitem">
                        <button
                          class="dropdown-item"
                          type="button"
                          onclick={() => consumeItem(item)}
                        >
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                            <path d="M2 7l3.5 3.5L12 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                          </svg>
                          Verbraucht
                        </button>
                      </li>
                    {/if}
                    <li role="menuitem">
                      <button
                        class="dropdown-item dropdown-item--danger"
                        type="button"
                        onclick={() => deleteItem(item)}
                      >
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                          <path d="M2 3.5h10M5.5 3.5V2.5h3V3.5M5 3.5V11h4V3.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                        Löschen
                      </button>
                    </li>
                  </ul>
                {/if}
              </div>
            </div>

            {#if item.product.brand}
              <span class="item-brand">{item.product.brand}</span>
            {/if}

            <!-- MHD badge -->
            {#if expiry.hasDate}
              <span class="mhd-badge {expiry.cssClass}">{expiry.label}</span>
            {/if}

            <!-- Breadcrumb -->
            {#if breadcrumb}
              <span class="item-breadcrumb">{breadcrumb}</span>
            {/if}

            <!-- Footer: quantity + status -->
            <div class="item-footer">
              <span class="item-qty">{quantityDisplay(item)}</span>
              {#if item.status !== 'available'}
                <span class="status-badge status-badge--{item.status}">
                  {item.status === 'consumed'
                    ? 'Verbraucht'
                    : item.status === 'expired'
                      ? 'Abgelaufen'
                      : item.status === 'donated'
                        ? 'Verschenkt'
                        : 'Entsorgt'}
                </span>
              {/if}
            </div>
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<!-- ── FAB ────────────────────────────────────────────────────────────────── -->

<button class="fab" type="button" aria-label="Produkt hinzufügen" onclick={openAddSheet}>
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
  </svg>
</button>

<!-- ── AddItemSheet ───────────────────────────────────────────────────────── -->

{#if showSheet}
  <!-- Backdrop -->
  <div
    class="sheet-backdrop"
    role="presentation"
    onclick={closeSheet}
    onkeydown={onSheetKeydown}
  ></div>

  <!-- Sheet panel -->
  <div
    class="sheet"
    role="dialog"
    aria-modal="true"
    aria-label={sheetMode === 'add' ? 'Produkt hinzufügen' : 'Produkt bearbeiten'}
  >
    <div class="sheet-handle" aria-hidden="true"></div>

    <div class="sheet-header">
      <h2 class="sheet-title">
        {sheetMode === 'add' ? 'Produkt hinzufügen' : 'Bearbeiten'}
      </h2>
      <button class="sheet-close" type="button" aria-label="Schließen" onclick={closeSheet}>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="M4 4l12 12M16 4L4 16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
      </button>
    </div>

    <div class="sheet-body">
      <!-- Product name -->
      <div class="field">
        <label class="label" for="f-name">Produktname <span class="required">*</span></label>
        <input
          id="f-name"
          class="input"
          type="text"
          placeholder="z.B. Vollmilch"
          bind:value={formProductName}
          required
        />
      </div>

      <!-- Barcode (only on add) -->
      {#if sheetMode === 'add'}
        <div class="field">
          <label class="label" for="f-barcode">Barcode <span class="optional">(optional)</span></label>
          <div class="input-addon">
            <input
              id="f-barcode"
              class="input"
              type="text"
              placeholder="EAN / GTIN"
              bind:value={formBarcode}
            />
            <button
              class="addon-btn addon-btn--active"
              type="button"
              title="Barcode scannen"
              onclick={openScanner}
              disabled={scannerLoading}
            >
              {#if scannerLoading}
                <span class="spinner spinner--dark" aria-hidden="true"></span>
              {:else}
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                  <rect x="2" y="4" width="2" height="10" fill="currentColor"/>
                  <rect x="5" y="4" width="1" height="10" fill="currentColor"/>
                  <rect x="7" y="4" width="2" height="10" fill="currentColor"/>
                  <rect x="10.5" y="4" width="1" height="10" fill="currentColor"/>
                  <rect x="12.5" y="4" width="3" height="10" fill="currentColor"/>
                  <path d="M1 2h3M14 2h3M1 16h3M14 16h3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
                </svg>
              {/if}
            </button>
          </div>
          {#if scannerNotFound}
            <p class="barcode-hint barcode-hint--warn">Produkt nicht gefunden — bitte manuell eingeben.</p>
          {/if}
        </div>
      {/if}

      <!-- Category -->
      <div class="field">
        <label class="label" for="f-cat">Kategorie</label>
        <select id="f-cat" class="input" bind:value={formCategoryId}>
          <option value="">Keine Kategorie</option>
          {#each categories as cat (cat.id)}
            <option value={cat.id}>{cat.icon ? cat.icon + ' ' : ''}{cat.name}</option>
          {/each}
        </select>
      </div>

      <!-- Location cascade -->
      <div class="field-group">
        <div class="field">
          <label class="label" for="f-loc">Ort</label>
          <select
            id="f-loc"
            class="input"
            bind:value={formLocationId}
            onchange={onLocationChange}
          >
            <option value="">Kein Ort</option>
            {#each locationTree as loc (loc.id)}
              <option value={loc.id}>{loc.icon ? loc.icon + ' ' : ''}{loc.name}</option>
            {/each}
          </select>
        </div>

        {#if formLocationId && formStorages().length > 0}
          <div class="field">
            <label class="label" for="f-storage">Lagerort</label>
            <select
              id="f-storage"
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

        {#if formStorageId && formPlaces().length > 0}
          <div class="field">
            <label class="label" for="f-place">Fach</label>
            <select id="f-place" class="input" bind:value={formPlaceId}>
              <option value="">Kein Fach</option>
              {#each formPlaces() as pl (pl.id)}
                <option value={pl.id}>{pl.name}</option>
              {/each}
            </select>
          </div>
        {/if}
      </div>

      <!-- MHD -->
      <div class="field">
        <label class="label" for="f-mhd">MHD</label>
        <input id="f-mhd" class="input" type="date" bind:value={formMhd} />
      </div>

      <!-- Quantity + Unit -->
      <div class="field-row">
        <div class="field field--qty">
          <label class="label" for="f-qty">Menge</label>
          <input
            id="f-qty"
            class="input"
            type="number"
            min="0"
            step="0.01"
            bind:value={formQuantity}
          />
        </div>
        <div class="field field--unit">
          <label class="label" for="f-unit">Einheit</label>
          <select id="f-unit" class="input" bind:value={formUnit}>
            {#each unitOptions as u (u.id)}
              <option value={u.symbol}>{u.name}</option>
            {/each}
          </select>
        </div>
      </div>

      <!-- Notes -->
      <div class="field">
        <label class="label" for="f-notes">Notizen <span class="optional">(optional)</span></label>
        <textarea
          id="f-notes"
          class="input textarea"
          placeholder="z.B. Bereits geöffnet"
          rows="2"
          bind:value={formNotes}
        ></textarea>
      </div>
    </div>

    <div class="sheet-footer">
      <button
        class="btn-primary btn-save-sheet"
        type="button"
        disabled={formSaving || !formProductName.trim()}
        onclick={saveItem}
      >
        {#if formSaving}
          <span class="spinner" aria-hidden="true"></span>
          Speichern…
        {:else if sheetMode === 'add'}
          Hinzufügen
        {:else}
          Speichern
        {/if}
      </button>
    </div>
  </div>
{/if}

<!-- ── BarcodeScanner overlay ─────────────────────────────────────────────── -->

{#if showScanner}
  <div class="scanner-backdrop" role="presentation" onclick={closeScanner}></div>
  <div class="scanner-panel" role="dialog" aria-modal="true" aria-label="Barcode scannen">
    <div class="scanner-header">
      <span class="scanner-title">Barcode scannen</span>
      <button class="sheet-close" type="button" aria-label="Scanner schließen" onclick={closeScanner}>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="M4 4l12 12M16 4L4 16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
      </button>
    </div>
    <div class="scanner-viewport">
      <!-- svelte-ignore a11y_media_has_caption -->
      <video
        class="scanner-video"
        bind:this={scannerVideoEl}
        playsinline
        autoplay
        muted
      ></video>
      <div class="scanner-reticle" aria-hidden="true"></div>
      <p class="scanner-hint">Barcode in den Rahmen halten</p>
    </div>
  </div>
{/if}

<!-- ── Toast container ───────────────────────────────────────────────────── -->

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
  /* ── Page ─────────────────────────────────────────────────────────────── */

  .page {
    max-width: 1100px;
    margin: 0 auto;
    padding: var(--space-8) var(--space-6) calc(var(--space-8) + 80px);
  }

  .page-header {
    display: flex;
    align-items: baseline;
    gap: var(--space-3);
    margin-bottom: var(--space-5);
  }

  .page-title {
    font-family: var(--font-display);
    font-size: var(--text-2xl);
    font-weight: 700;
    color: var(--color-text-primary);
    letter-spacing: -0.02em;
    margin: 0;
  }

  .item-count {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    font-weight: 500;
  }

  /* ── Search ───────────────────────────────────────────────────────────── */

  .search-wrap {
    position: relative;
    margin-bottom: var(--space-3);
  }

  .search-icon {
    position: absolute;
    left: var(--space-3);
    top: 50%;
    transform: translateY(-50%);
    color: var(--color-text-muted);
    pointer-events: none;
  }

  .search-input {
    width: 100%;
    height: 42px;
    padding: 0 var(--space-3) 0 calc(var(--space-3) * 2 + 16px);
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

  /* ── Filter row ───────────────────────────────────────────────────────── */

  .filter-row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    margin-bottom: var(--space-5);
    flex-wrap: wrap;
  }

  .filter-select {
    height: 36px;
    padding: 0 var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
    background-color: var(--color-surface);
    color: var(--color-text-primary);
    font-family: var(--font-body);
    font-size: var(--text-sm);
    outline: none;
    cursor: pointer;
    transition: border-color var(--transition-fast);
    min-width: 180px;
    max-width: 280px;
  }

  .filter-select:focus {
    border-color: var(--color-border-focus);
    box-shadow: 0 0 0 3px rgba(196, 103, 58, 0.15);
  }

  /* Toggle */
  .filter-toggle {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    cursor: pointer;
    user-select: none;
  }

  .filter-toggle input {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
  }

  .toggle-track {
    position: relative;
    display: inline-flex;
    align-items: center;
    width: 36px;
    height: 20px;
    border-radius: var(--radius-full);
    background-color: var(--color-border);
    transition: background-color var(--transition-fast);
    flex-shrink: 0;
  }

  .filter-toggle input:checked ~ .toggle-track {
    background-color: var(--color-primary);
  }

  .toggle-thumb {
    position: absolute;
    left: 2px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background-color: white;
    box-shadow: var(--shadow-sm);
    transition: transform var(--transition-fast);
  }

  .filter-toggle input:checked ~ .toggle-track .toggle-thumb {
    transform: translateX(16px);
  }

  .toggle-label {
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--color-text-secondary);
    white-space: nowrap;
  }

  /* ── Item grid ────────────────────────────────────────────────────────── */

  .item-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: var(--space-3);
    list-style: none;
    margin: 0;
    padding: 0;
  }

  @media (min-width: 640px) {
    .item-grid {
      grid-template-columns: repeat(3, 1fr);
    }
  }

  @media (min-width: 1024px) {
    .item-grid {
      grid-template-columns: repeat(4, 1fr);
    }
  }

  /* ── Item card ────────────────────────────────────────────────────────── */

  .item-card {
    background-color: var(--color-surface-raised);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    /* overflow: hidden removed — it clips the dropdown menu */
    overflow: visible;
    display: flex;
    flex-direction: column;
    box-shadow: var(--shadow-sm);
    transition: box-shadow var(--transition-fast), transform var(--transition-fast);
    position: relative;
  }

  .item-card:hover {
    box-shadow: var(--shadow-md);
    transform: translateY(-1px);
  }

  .item-card--consumed {
    opacity: 0.6;
  }

  /* Thumb */
  .item-thumb {
    aspect-ratio: 1;
    background-color: var(--color-surface-sunken);
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    flex-shrink: 0;
    /* Round top corners to compensate for overflow:visible on .item-card */
    border-radius: calc(var(--radius-lg) - 1px) calc(var(--radius-lg) - 1px) 0 0;
  }

  .item-image {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .item-cat-icon {
    font-size: 2.2rem;
    line-height: 1;
  }

  /* Body */
  .item-body {
    padding: var(--space-3);
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    flex: 1;
  }

  .item-name-row {
    display: flex;
    align-items: flex-start;
    gap: var(--space-1);
  }

  .item-name {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--color-text-primary);
    flex: 1;
    line-height: 1.35;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  .item-brand {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .item-breadcrumb {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .item-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-1);
    margin-top: auto;
    padding-top: var(--space-1);
  }

  .item-qty {
    font-size: var(--text-sm);
    font-weight: 700;
    color: var(--color-text-primary);
  }

  /* ── MHD badge ────────────────────────────────────────────────────────── */

  :global(.mhd-badge) {
    display: inline-flex;
    align-items: center;
    height: 18px;
    padding: 0 var(--space-2);
    border-radius: var(--radius-full);
    font-size: 10px;
    font-weight: 600;
    width: fit-content;
    white-space: nowrap;
  }

  :global(.mhd-badge.mhd-fresh) {
    background-color: var(--color-success-subtle, #dcfce7);
    color: var(--color-success, #16a34a);
  }

  :global(.mhd-badge.mhd-ok) {
    background-color: var(--color-success-subtle, #dcfce7);
    color: var(--color-success, #16a34a);
  }

  :global(.mhd-badge.mhd-soon) {
    background-color: #fef9c3;
    color: #a16207;
  }

  :global(.mhd-badge.mhd-critical) {
    background-color: #fee2e2;
    color: var(--color-danger, #dc2626);
  }

  :global(.mhd-badge.mhd-expired) {
    background-color: #fce7f3;
    color: #9d174d;
  }

  /* ── Status badge ─────────────────────────────────────────────────────── */

  .status-badge {
    display: inline-flex;
    align-items: center;
    height: 18px;
    padding: 0 var(--space-2);
    border-radius: var(--radius-full);
    font-size: 10px;
    font-weight: 600;
    white-space: nowrap;
  }

  .status-badge--consumed {
    background-color: var(--color-accent-subtle);
    color: var(--color-accent);
  }

  .status-badge--expired {
    background-color: #fee2e2;
    color: var(--color-danger, #dc2626);
  }

  .status-badge--donated,
  .status-badge--discarded {
    background-color: var(--color-surface-sunken);
    color: var(--color-text-muted);
  }

  /* ── Three-dot menu ───────────────────────────────────────────────────── */

  .menu-wrap {
    position: relative;
    flex-shrink: 0;
  }

  .btn-dots {
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
    padding: 0;
    transition: background-color var(--transition-fast), color var(--transition-fast);
    flex-shrink: 0;
  }

  .btn-dots:hover {
    background-color: var(--color-surface-sunken);
    color: var(--color-text-primary);
  }

  .dropdown {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    z-index: var(--z-dropdown, 200);
    min-width: 148px;
    background-color: var(--color-surface-raised);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    list-style: none;
    margin: 0;
    padding: var(--space-1);
    overflow: hidden;
  }

  .dropdown-item {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    padding: var(--space-2) var(--space-3);
    border: none;
    background-color: transparent;
    color: var(--color-text-primary);
    font-family: var(--font-body);
    font-size: var(--text-sm);
    font-weight: 500;
    cursor: pointer;
    border-radius: var(--radius-md);
    text-align: left;
    transition: background-color var(--transition-fast), color var(--transition-fast);
    white-space: nowrap;
  }

  .dropdown-item:hover {
    background-color: var(--color-surface-sunken);
  }

  .dropdown-item--danger {
    color: var(--color-danger, #dc2626);
  }

  .dropdown-item--danger:hover {
    background-color: var(--color-danger-subtle, #fee2e2);
  }

  /* ── Empty state ──────────────────────────────────────────────────────── */

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-4);
    padding: var(--space-16) var(--space-6);
    text-align: center;
  }

  .empty-icon {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .empty-title {
    font-family: var(--font-display);
    font-size: var(--text-lg);
    font-weight: 600;
    color: var(--color-text-primary);
    margin: 0;
  }

  .empty-sub {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    margin: 0;
    max-width: 320px;
    line-height: 1.6;
  }

  /* ── Buttons ──────────────────────────────────────────────────────────── */

  .btn-primary {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    height: 38px;
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
    transition: background-color var(--transition-fast), box-shadow var(--transition-fast);
  }

  .btn-primary:hover:not(:disabled) {
    background-color: var(--color-primary-hover);
    box-shadow: var(--shadow-md);
  }

  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-primary--lg {
    height: 44px;
    padding: 0 var(--space-6);
    font-size: var(--text-base);
  }

  .btn-secondary {
    display: inline-flex;
    align-items: center;
    height: 38px;
    padding: 0 var(--space-4);
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
    background-color: transparent;
    color: var(--color-text-secondary);
    font-family: var(--font-body);
    font-size: var(--text-sm);
    font-weight: 500;
    cursor: pointer;
    transition: border-color var(--transition-fast), color var(--transition-fast);
  }

  .btn-secondary:hover {
    border-color: var(--color-border-strong);
    color: var(--color-text-primary);
  }

  /* ── FAB ──────────────────────────────────────────────────────────────── */

  .fab {
    position: fixed;
    bottom: calc(var(--space-6) + env(safe-area-inset-bottom, 0px));
    right: var(--space-6);
    z-index: var(--z-fab, 100);
    width: 56px;
    height: 56px;
    border-radius: var(--radius-full);
    border: none;
    background-color: var(--color-primary);
    color: var(--color-text-inverse);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    box-shadow: var(--shadow-lg);
    transition: background-color var(--transition-fast), box-shadow var(--transition-fast), transform var(--transition-fast);
  }

  .fab:hover {
    background-color: var(--color-primary-hover);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
    transform: scale(1.05);
  }

  .fab:active {
    transform: scale(0.97);
  }

  /* ── Sheet backdrop ───────────────────────────────────────────────────── */

  .sheet-backdrop {
    position: fixed;
    inset: 0;
    z-index: var(--z-sheet-backdrop, 300);
    background-color: rgba(0, 0, 0, 0.4);
    animation: fade-in 180ms ease;
  }

  @keyframes fade-in {
    from { opacity: 0 }
    to   { opacity: 1 }
  }

  /* ── Sheet panel ──────────────────────────────────────────────────────── */

  .sheet {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: var(--z-sheet, 400);
    background-color: var(--color-surface);
    border-radius: var(--radius-xl) var(--radius-xl) 0 0;
    box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.12);
    max-height: 92dvh;
    display: flex;
    flex-direction: column;
    animation: sheet-up 240ms cubic-bezier(0.32, 0.72, 0, 1);
  }

  @keyframes sheet-up {
    from { transform: translateY(100%) }
    to   { transform: translateY(0) }
  }

  @media (min-width: 640px) {
    .sheet {
      left: 50%;
      right: auto;
      transform: translateX(-50%);
      width: 480px;
      border-radius: var(--radius-xl);
      bottom: var(--space-8);
      animation: sheet-pop 200ms cubic-bezier(0.32, 0.72, 0, 1);
    }
    @keyframes sheet-pop {
      from { opacity: 0; transform: translateX(-50%) scale(0.96) }
      to   { opacity: 1; transform: translateX(-50%) scale(1) }
    }
  }

  .sheet-handle {
    width: 36px;
    height: 4px;
    border-radius: var(--radius-full);
    background-color: var(--color-border);
    margin: var(--space-3) auto var(--space-1);
    flex-shrink: 0;
  }

  @media (min-width: 640px) {
    .sheet-handle { display: none; }
  }

  .sheet-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-3) var(--space-5) var(--space-3);
    flex-shrink: 0;
    border-bottom: 1px solid var(--color-border-subtle);
  }

  .sheet-title {
    font-family: var(--font-display);
    font-size: var(--text-lg);
    font-weight: 700;
    color: var(--color-text-primary);
    margin: 0;
  }

  .sheet-close {
    display: inline-flex;
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
  }

  .sheet-close:hover {
    background-color: var(--color-surface-sunken);
    color: var(--color-text-primary);
  }

  .sheet-body {
    overflow-y: auto;
    padding: var(--space-4) var(--space-5);
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    flex: 1;
    min-height: 0;
  }

  .sheet-footer {
    padding: var(--space-4) var(--space-5) calc(var(--space-4) + env(safe-area-inset-bottom, 0px));
    border-top: 1px solid var(--color-border-subtle);
    flex-shrink: 0;
  }

  .btn-save-sheet {
    width: 100%;
    height: 44px;
    justify-content: center;
    font-size: var(--text-base);
  }

  /* ── Form fields ──────────────────────────────────────────────────────── */

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

  .field-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-3);
  }

  .field--qty { flex: 1; }
  .field--unit { flex: 1; }

  .label {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--color-text-secondary);
  }

  .required { color: var(--color-danger, #dc2626); }
  .optional { font-weight: 400; color: var(--color-text-muted); }

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

  .textarea {
    height: auto;
    padding: var(--space-2) var(--space-3);
    resize: vertical;
    min-height: 64px;
  }

  /* Barcode input with scan button */
  .input-addon {
    display: flex;
    gap: 0;
    border-radius: var(--radius-md);
    overflow: hidden;
    border: 1px solid var(--color-border);
    transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
  }

  .input-addon:focus-within {
    border-color: var(--color-border-focus);
    box-shadow: 0 0 0 3px rgba(196, 103, 58, 0.15);
  }

  .input-addon .input {
    border: none;
    border-radius: 0;
    flex: 1;
  }

  .input-addon .input:focus {
    box-shadow: none;
  }

  .addon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 42px;
    flex-shrink: 0;
    border: none;
    background-color: var(--color-surface-sunken);
    color: var(--color-text-muted);
    cursor: not-allowed;
    border-left: 1px solid var(--color-border);
    transition: background-color var(--transition-fast), color var(--transition-fast);
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
      padding: var(--space-5) var(--space-3) calc(var(--space-5) + 80px);
    }

    .item-grid {
      grid-template-columns: repeat(2, 1fr);
      gap: var(--space-2);
    }

    .filter-row {
      gap: var(--space-2);
    }

    .filter-select {
      min-width: 0;
      flex: 1;
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
  .addon-btn--active {
    cursor: pointer;
    color: var(--color-primary);
    background-color: var(--color-primary-subtle);
  }

  .addon-btn--active:hover:not(:disabled) {
    background-color: var(--color-primary);
    color: var(--color-text-inverse);
  }

  .addon-btn--active:disabled {
    cursor: not-allowed;
    opacity: 0.7;
  }

  .barcode-hint {
    font-size: var(--text-xs);
    margin: 0;
  }

  .barcode-hint--warn {
    color: var(--color-danger, #dc2626);
  }

  /* ── Scanner overlay ──────────────────────────────────────────────────── */

  .scanner-backdrop {
    position: fixed;
    inset: 0;
    z-index: var(--z-sheet-backdrop, 300);
    background-color: rgba(0, 0, 0, 0.7);
    animation: fade-in 180ms ease;
  }

  .scanner-panel {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: var(--z-sheet, 400);
    background-color: var(--color-surface);
    border-radius: var(--radius-xl) var(--radius-xl) 0 0;
    box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.18);
    display: flex;
    flex-direction: column;
    max-height: 80dvh;
    animation: sheet-up 240ms cubic-bezier(0.32, 0.72, 0, 1);
  }

  @media (min-width: 640px) {
    .scanner-panel {
      left: 50%;
      right: auto;
      transform: translateX(-50%);
      width: 480px;
      border-radius: var(--radius-xl);
      bottom: var(--space-8);
      animation: sheet-pop 200ms cubic-bezier(0.32, 0.72, 0, 1);
    }
  }

  .scanner-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-4) var(--space-5);
    border-bottom: 1px solid var(--color-border-subtle);
    flex-shrink: 0;
  }

  .scanner-title {
    font-family: var(--font-display);
    font-size: var(--text-lg);
    font-weight: 700;
    color: var(--color-text-primary);
  }

  .scanner-viewport {
    position: relative;
    flex: 1;
    overflow: hidden;
    background-color: #000;
    min-height: 280px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .scanner-video {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .scanner-reticle {
    position: absolute;
    inset: 0;
    margin: auto;
    width: 220px;
    height: 120px;
    border: 2px solid var(--color-primary);
    border-radius: var(--radius-md);
    box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.45);
    pointer-events: none;
  }

  .scanner-hint {
    position: absolute;
    bottom: var(--space-4);
    left: 50%;
    transform: translateX(-50%);
    background-color: rgba(0, 0, 0, 0.55);
    color: #fff;
    font-size: var(--text-xs);
    font-weight: 500;
    padding: var(--space-1) var(--space-3);
    border-radius: var(--radius-full);
    white-space: nowrap;
    pointer-events: none;
  }

  .spinner--dark {
    border-color: rgba(0, 0, 0, 0.2);
    border-top-color: var(--color-primary);
  }

</style>

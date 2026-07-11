<script lang="ts">
  import type { PageData } from './$types'
  import { toast } from '$lib/stores/toast'
  import ConfirmModal from '$lib/components/ConfirmModal.svelte'

  // ── Props ──────────────────────────────────────────────────────────────────

  let { data }: { data: PageData } = $props()

  // ── Types ────────────────────────────────────────────────────────────────

  type Category = { id: string; name: string }
  type Product = {
    id: string
    name: string
    brand: string | null
    description: string | null
    notes: string | null
    categoryId: string | null
    defaultUnit: string
    gtin: string | null
    imageUrl: string | null
    category?: { id: string; name: string } | null
  }

  // ── State ────────────────────────────────────────────────────────────────

  // svelte-ignore state_referenced_locally
  let productRows = $state<Product[]>(data.products as Product[])
  // svelte-ignore state_referenced_locally
  let pageLoadError = $state<string | null>(data.loadError ?? null)

  const categories = $derived(data.categories as Category[])

  // Add form
  let newName = $state('')
  let newDescription = $state('')
  let newCategoryId = $state('')
  let newUnit = $state('Stück')
  let newNotes = $state('')
  let adding = $state(false)
  let addError = $state<string | null>(null)

  // Inline edit
  let editingId = $state<string | null>(null)
  let editingName = $state('')
  let editingDescription = $state('')
  let editingCategoryId = $state('')
  let editingUnit = $state('')
  let editingNotes = $state('')
  let editSaving = $state(false)
  let editError = $state<string | null>(null)

  // Delete
  let deleting = $state<string | null>(null)
  let confirmModal = $state<{ open: boolean; title: string; message: string; onConfirm: () => void } | null>(null)

  function showConfirm(title: string, message: string, onConfirm: () => void) {
    confirmModal = { open: true, title, message, onConfirm }
  }
  function closeConfirm() {
    confirmModal = null
  }

  function categoryName(id: string | null): string | null {
    if (!id) return null
    return categories.find((c) => c.id === id)?.name ?? null
  }

  // ── Edit ────────────────────────────────────────────────────────────────

  function startEdit(p: Product) {
    editingId = p.id
    editingName = p.name
    editingDescription = p.description ?? ''
    editingCategoryId = p.categoryId ?? ''
    editingUnit = p.defaultUnit ?? ''
    editingNotes = p.notes ?? ''
    editError = null
  }

  function cancelEdit() {
    editingId = null
    editError = null
  }

  async function saveEdit(id: string) {
    const name = editingName.trim()
    if (!name) {
      editError = 'Name ist erforderlich.'
      return
    }

    editSaving = true
    editError = null

    try {
      const res = await fetch(`/api/products/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description: editingDescription.trim() || null,
          categoryId: editingCategoryId || null,
          defaultUnit: editingUnit.trim() || 'Stück',
          notes: editingNotes.trim() || null,
        }),
      })
      const body = await res.json().catch(() => ({}))

      if (!res.ok) {
        editError = String(body?.error ?? `Fehler ${res.status}`)
        return
      }

      const updated = body as Product
      productRows = productRows
        .map((p) => (p.id === id ? { ...p, ...updated } : p))
        .sort((a, b) => a.name.localeCompare(b.name))
      editingId = null
      toast.success('Artikel gespeichert')
    } catch {
      editError = 'Netzwerkfehler.'
    } finally {
      editSaving = false
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  async function performDelete(id: string) {
    deleting = id
    try {
      const res = await fetch(`/api/products/${id}`, { method: 'DELETE' })

      if (res.status === 409) {
        const body = await res.json().catch(() => ({}))
        toast.error(
          String(body?.error ?? 'Artikel hat noch Bestände. Bitte zuerst alle Bestände entfernen.')
        )
        return
      }

      if (!res.ok && res.status !== 204) {
        const body = await res.json().catch(() => ({}))
        toast.error(String(body?.error ?? `Fehler ${res.status}`))
        return
      }

      productRows = productRows.filter((p) => p.id !== id)
      toast.success('Artikel gelöscht')
    } catch {
      toast.error('Netzwerkfehler beim Löschen.')
    } finally {
      deleting = null
    }
  }

  function requestDelete(p: Product) {
    showConfirm(
      'Artikel löschen',
      `„${p.name}" endgültig aus dem Katalog entfernen? Das ist nur möglich, wenn keine Bestände mehr darauf verweisen.`,
      () => {
        closeConfirm()
        performDelete(p.id)
      }
    )
  }

  // ── Add ────────────────────────────────────────────────────────────────

  async function addProduct() {
    const name = newName.trim()
    if (!name) {
      addError = 'Name ist erforderlich.'
      return
    }

    adding = true
    addError = null

    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description: newDescription.trim() || undefined,
          categoryId: newCategoryId || undefined,
          defaultUnit: newUnit.trim() || 'Stück',
          notes: newNotes.trim() || undefined,
        }),
      })
      const body = await res.json().catch(() => ({}))

      if (!res.ok) {
        addError = String(body?.error ?? `Fehler ${res.status}`)
        return
      }

      productRows = [...productRows, body as Product].sort((a, b) => a.name.localeCompare(b.name))
      newName = ''
      newDescription = ''
      newCategoryId = ''
      newUnit = 'Stück'
      newNotes = ''
      toast.success('Artikel angelegt')
    } catch {
      addError = 'Netzwerkfehler.'
    } finally {
      adding = false
    }
  }
</script>

<div class="page">
  <!-- ── Breadcrumb ─────────────────────────────────────────────────────────── -->

  <nav class="breadcrumb" aria-label="Breadcrumb">
    <a href="/einstellungen" class="breadcrumb-back">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M10 3L5 8l5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      Einstellungen
    </a>
    <span class="breadcrumb-sep" aria-hidden="true">/</span>
    <span class="breadcrumb-current" aria-current="page">Artikel</span>
  </nav>

  <!-- ── Header ─────────────────────────────────────────────────────────────── -->

  <header class="page-header">
    <h1 class="page-title">Artikel</h1>
    <p class="page-desc">
      Verwalte deine Artikel-Stammdaten. Ein Artikel beschreibt ein Lebensmittel einmal —
      Bestände (Menge, MHD, EAN, Markt, Lagerort) werden separat im Inventar erfasst.
    </p>
  </header>

  <!-- ── Load error banner ─────────────────────────────────────────────────── -->

  {#if pageLoadError}
    <div class="alert alert--error" role="alert" style="margin-bottom: var(--space-6);">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.5"/>
        <path d="M8 5v3.5M8 11v.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
      {pageLoadError}
    </div>
  {/if}

  <!-- ── Article list ──────────────────────────────────────────────────────── -->

  <section class="settings-section">
    <div class="section-header">
      <h2 class="section-title">
        <span class="section-icon" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M3 2.5h8l4 4V15.5H3V2.5Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
            <path d="M11 2.5V6.5H15" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
          </svg>
        </span>
        Meine Artikel
      </h2>
    </div>

    {#if productRows.length === 0}
      <div class="empty-hint">Noch keine Artikel angelegt.</div>
    {:else}
      <div class="store-list" role="list">
        {#each productRows as product (product.id)}
          <div class="store-row" role="listitem">
            {#if editingId === product.id}
              <!-- Inline edit -->
              <div class="store-edit-form">
                <div class="edit-fields">
                  <input
                    class="input"
                    type="text"
                    bind:value={editingName}
                    placeholder="Artikelname"
                    maxlength="255"
                    aria-label="Artikelname"
                    onkeydown={(e) => { if (e.key === 'Escape') cancelEdit() }}
                  />
                  <select class="input input--cat" bind:value={editingCategoryId} aria-label="Kategorie">
                    <option value="">Kategorie (optional)</option>
                    {#each categories as cat (cat.id)}
                      <option value={cat.id}>{cat.name}</option>
                    {/each}
                  </select>
                  <input
                    class="input input--unit"
                    type="text"
                    bind:value={editingUnit}
                    placeholder="Einheit"
                    maxlength="16"
                    aria-label="Standard-Einheit"
                    onkeydown={(e) => { if (e.key === 'Escape') cancelEdit() }}
                  />
                </div>
                <div class="edit-fields">
                  <input
                    class="input input--wide"
                    type="text"
                    bind:value={editingDescription}
                    placeholder="Beschreibung (optional)"
                    maxlength="255"
                    aria-label="Beschreibung"
                    onkeydown={(e) => { if (e.key === 'Escape') cancelEdit() }}
                  />
                </div>
                <div class="edit-fields">
                  <input
                    class="input input--wide"
                    type="text"
                    bind:value={editingNotes}
                    placeholder="Notizen (optional)"
                    maxlength="500"
                    aria-label="Notizen"
                    onkeydown={(e) => { if (e.key === 'Escape') cancelEdit() }}
                  />
                </div>
                {#if editError}
                  <p class="field-error">{editError}</p>
                {/if}
                <div class="edit-actions">
                  <button
                    class="btn-save-inline"
                    type="button"
                    disabled={editSaving}
                    aria-label="Speichern"
                    onclick={() => saveEdit(product.id)}
                  >
                    {#if editSaving}
                      <span class="spinner spinner--sm" aria-hidden="true"></span>
                    {:else}
                      <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                        <path d="M2 7l3.5 3.5L12 3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
                      </svg>
                    {/if}
                    Speichern
                  </button>
                  <button class="btn-cancel-inline" type="button" onclick={cancelEdit} aria-label="Abbrechen">
                    Abbrechen
                  </button>
                </div>
              </div>
            {:else}
              <!-- Display row -->
              <div class="store-info">
                <div class="store-info-main">
                  <span class="store-name">{product.name}</span>
                  {#if categoryName(product.categoryId)}
                    <span class="chain-badge">{categoryName(product.categoryId)}</span>
                  {/if}
                  <span class="unit-badge">{product.defaultUnit}</span>
                </div>
                {#if product.description}
                  <span class="store-address">{product.description}</span>
                {/if}
              </div>
              <div class="store-actions">
                <button
                  class="btn-edit-inline"
                  type="button"
                  onclick={() => startEdit(product)}
                  aria-label="{product.name} bearbeiten"
                >
                  <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                    <path d="M9.5 2.5L11.5 4.5L5 11H3V9L9.5 2.5Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
                  </svg>
                  Bearbeiten
                </button>
                <button
                  class="btn-delete-inline"
                  type="button"
                  disabled={deleting === product.id}
                  onclick={() => requestDelete(product)}
                  aria-label="{product.name} löschen"
                >
                  {#if deleting === product.id}
                    <span class="spinner spinner--sm spinner--danger" aria-hidden="true"></span>
                  {:else}
                    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                      <path d="M2 3.5h10M5 3.5V2.5h4v1M5.5 6v4M8.5 6v4M3 3.5l.7 8h6.6l.7-8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  {/if}
                  Löschen
                </button>
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </section>

  <!-- ── Add new article ───────────────────────────────────────────────────── -->

  <section class="settings-section">
    <div class="section-header">
      <h2 class="section-title">
        <span class="section-icon" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <circle cx="9" cy="9" r="7.5" stroke="currentColor" stroke-width="1.5"/>
            <path d="M9 5.5v7M5.5 9h7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </span>
        Neuen Artikel anlegen
      </h2>
    </div>

    {#if addError}
      <div class="alert alert--error" role="alert">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.5"/>
          <path d="M8 5v3.5M8 11v.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
        {addError}
      </div>
    {/if}

    <div class="add-form">
      <div class="add-fields">
        <input
          class="input"
          type="text"
          bind:value={newName}
          placeholder="Artikelname — z.B. Vollmilch"
          maxlength="255"
          aria-label="Name des neuen Artikels"
          onkeydown={(e) => { if (e.key === 'Enter') addProduct() }}
        />
        <select class="input input--cat" bind:value={newCategoryId} aria-label="Kategorie">
          <option value="">Kategorie (optional)</option>
          {#each categories as cat (cat.id)}
            <option value={cat.id}>{cat.name}</option>
          {/each}
        </select>
        <input
          class="input input--unit"
          type="text"
          bind:value={newUnit}
          placeholder="Einheit"
          maxlength="16"
          aria-label="Standard-Einheit"
          onkeydown={(e) => { if (e.key === 'Enter') addProduct() }}
        />
      </div>
      <div class="add-fields">
        <input
          class="input input--wide"
          type="text"
          bind:value={newDescription}
          placeholder="Beschreibung (optional) — z.B. Milch mit 3,5% Fett"
          maxlength="255"
          aria-label="Beschreibung"
          onkeydown={(e) => { if (e.key === 'Enter') addProduct() }}
        />
      </div>
      <div class="add-fields">
        <input
          class="input input--wide"
          type="text"
          bind:value={newNotes}
          placeholder="Notizen (optional)"
          maxlength="500"
          aria-label="Notizen"
          onkeydown={(e) => { if (e.key === 'Enter') addProduct() }}
        />
      </div>
      <div class="add-footer">
        <button class="btn-primary" type="button" disabled={adding} onclick={addProduct}>
          {#if adding}
            <span class="spinner" aria-hidden="true"></span>
            Anlegen…
          {:else}
            Anlegen
          {/if}
        </button>
      </div>
    </div>
  </section>
</div>

{#if confirmModal}
  <ConfirmModal
    open={confirmModal.open}
    title={confirmModal.title}
    message={confirmModal.message}
    confirmLabel="Löschen"
    destructive={true}
    onConfirm={confirmModal.onConfirm}
    onCancel={closeConfirm}
  />
{/if}

<style>
  /* ── Page ─────────────────────────────────────────────────────────────── */

  .page {
    max-width: 760px;
    margin: 0 auto;
    padding: var(--space-8) var(--space-6) var(--space-16);
  }

  /* ── Breadcrumb ───────────────────────────────────────────────────────── */

  .breadcrumb {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-bottom: var(--space-6);
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }

  .breadcrumb-back {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    color: var(--color-primary);
    text-decoration: none;
    font-weight: 500;
    transition: color var(--transition-fast);
  }

  .breadcrumb-back:hover {
    color: var(--color-primary-hover);
  }

  .breadcrumb-sep {
    color: var(--color-text-muted);
    user-select: none;
  }

  .breadcrumb-current {
    color: var(--color-text-secondary);
    font-weight: 500;
  }

  /* ── Page header ──────────────────────────────────────────────────────── */

  .page-header {
    margin-bottom: var(--space-8);
  }

  .page-title {
    font-family: var(--font-display);
    font-size: var(--text-2xl);
    font-weight: 700;
    color: var(--color-text-primary);
    letter-spacing: -0.02em;
    margin: 0 0 var(--space-2);
  }

  .page-desc {
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
    margin: 0;
    line-height: 1.6;
  }

  /* ── Section ──────────────────────────────────────────────────────────── */

  .settings-section {
    background-color: var(--color-surface-raised);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-xl);
    padding: var(--space-6);
    margin-bottom: var(--space-6);
    box-shadow: var(--shadow-sm);
  }

  .section-header {
    margin-bottom: var(--space-5);
  }

  .section-title {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-family: var(--font-display);
    font-size: var(--text-lg);
    font-weight: 700;
    color: var(--color-text-primary);
    margin: 0;
  }

  .section-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: var(--radius-md);
    background-color: var(--color-primary-subtle);
    color: var(--color-primary);
    flex-shrink: 0;
  }

  /* ── Empty hint ───────────────────────────────────────────────────────── */

  .empty-hint {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    padding: var(--space-2) 0 var(--space-1);
  }

  /* ── List ─────────────────────────────────────────────────────────────── */

  .store-list {
    display: flex;
    flex-direction: column;
    gap: 0;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    overflow: hidden;
  }

  .store-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid var(--color-border-subtle);
    background-color: var(--color-surface);
    transition: background-color var(--transition-fast);
    min-height: 52px;
  }

  .store-row:last-child {
    border-bottom: none;
  }

  .store-row:hover {
    background-color: var(--color-surface-sunken);
  }

  .store-info {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    flex: 1;
    min-width: 0;
  }

  .store-info-main {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-wrap: wrap;
  }

  .store-address {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .store-name {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--color-text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .chain-badge {
    display: inline-flex;
    align-items: center;
    height: 20px;
    padding: 0 var(--space-2);
    border-radius: var(--radius-full);
    background-color: var(--color-primary-subtle);
    color: var(--color-primary);
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .unit-badge {
    display: inline-flex;
    align-items: center;
    height: 20px;
    padding: 0 var(--space-2);
    border-radius: var(--radius-full);
    background-color: var(--color-surface-sunken);
    color: var(--color-text-muted);
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .store-actions {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-shrink: 0;
  }

  /* ── Inline edit form ─────────────────────────────────────────────────── */

  .store-edit-form {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .edit-fields {
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
  }

  .edit-actions {
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
  }

  .field-error {
    font-size: var(--text-xs);
    color: var(--color-danger, #dc2626);
    margin: 0;
  }

  /* ── Add form ─────────────────────────────────────────────────────────── */

  .add-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .add-fields {
    display: flex;
    gap: var(--space-3);
    flex-wrap: wrap;
  }

  .add-footer {
    display: flex;
    justify-content: flex-start;
  }

  /* ── Inputs ───────────────────────────────────────────────────────────── */

  .input {
    flex: 1 1 160px;
    min-width: 140px;
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
    box-sizing: border-box;
    appearance: none;
  }

  .input::placeholder {
    color: var(--color-text-muted);
  }

  .input:focus {
    border-color: var(--color-border-focus);
    box-shadow: 0 0 0 3px rgba(196, 103, 58, 0.15);
  }

  .input--cat {
    flex: 1 1 180px;
  }

  .input--unit {
    flex: 0 1 110px;
    min-width: 90px;
  }

  .input--wide {
    flex: 1 1 100%;
  }

  /* ── Alerts ───────────────────────────────────────────────────────────── */

  .alert {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    font-weight: 500;
    margin-bottom: var(--space-4);
  }

  .alert--error {
    background-color: var(--color-danger-subtle, #fee2e2);
    color: var(--color-danger, #dc2626);
    border: 1px solid rgba(220, 38, 38, 0.2);
  }

  /* ── Buttons ──────────────────────────────────────────────────────────── */

  .btn-primary {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    height: 40px;
    padding: 0 var(--space-5);
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
    opacity: 0.45;
    cursor: not-allowed;
  }

  .btn-edit-inline {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    height: 30px;
    padding: 0 var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
    background-color: transparent;
    color: var(--color-text-secondary);
    font-family: var(--font-body);
    font-size: var(--text-xs);
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
    transition: border-color var(--transition-fast), color var(--transition-fast),
      background-color var(--transition-fast);
  }

  .btn-edit-inline:hover {
    border-color: var(--color-primary);
    color: var(--color-primary);
    background-color: var(--color-primary-subtle);
  }

  .btn-delete-inline {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    height: 30px;
    padding: 0 var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
    background-color: transparent;
    color: var(--color-text-muted);
    font-family: var(--font-body);
    font-size: var(--text-xs);
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
    transition: border-color var(--transition-fast), color var(--transition-fast),
      background-color var(--transition-fast);
  }

  .btn-delete-inline:hover:not(:disabled) {
    border-color: var(--color-danger, #dc2626);
    color: var(--color-danger, #dc2626);
    background-color: var(--color-danger-subtle, #fee2e2);
  }

  .btn-delete-inline:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-save-inline {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    height: 30px;
    padding: 0 var(--space-3);
    border-radius: var(--radius-md);
    border: none;
    background-color: var(--color-primary);
    color: var(--color-text-inverse);
    font-family: var(--font-body);
    font-size: var(--text-xs);
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    transition: background-color var(--transition-fast);
  }

  .btn-save-inline:hover:not(:disabled) {
    background-color: var(--color-primary-hover);
  }

  .btn-save-inline:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-cancel-inline {
    display: inline-flex;
    align-items: center;
    height: 30px;
    padding: 0 var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
    background-color: transparent;
    color: var(--color-text-muted);
    font-family: var(--font-body);
    font-size: var(--text-xs);
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
    transition: border-color var(--transition-fast), color var(--transition-fast);
  }

  .btn-cancel-inline:hover {
    border-color: var(--color-border-strong);
    color: var(--color-text-primary);
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

  .spinner--sm {
    width: 11px;
    height: 11px;
  }

  .spinner--danger {
    border-color: rgba(220, 38, 38, 0.3);
    border-top-color: var(--color-danger, #dc2626);
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* ── Responsive ───────────────────────────────────────────────────────── */

  @media (max-width: 560px) {
    .page {
      padding: var(--space-5) var(--space-3) var(--space-12);
    }

    .settings-section {
      padding: var(--space-4);
    }

    .store-row {
      flex-direction: column;
      align-items: flex-start;
    }

    .store-actions {
      width: 100%;
      justify-content: flex-end;
    }

    .add-footer .btn-primary {
      width: 100%;
      justify-content: center;
    }
  }
</style>

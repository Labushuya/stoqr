<script lang="ts">
  import { enhance } from '$app/forms'
  import type { PageData, ActionData } from './$types'
  import { toast } from '$lib/stores/toast'

  // ── Props ──────────────────────────────────────────────────────────────────

  let { data, form }: { data: PageData; form: ActionData } = $props()

  // ── Global tolerance state ─────────────────────────────────────────────────

  // svelte-ignore state_referenced_locally
  let yellowDays = $state(data.expiryConfig.yellowDaysBefore)
  // svelte-ignore state_referenced_locally
  let redDays = $state(data.expiryConfig.redDaysBefore)
  // svelte-ignore state_referenced_locally
  let graceDays = $state(data.expiryConfig.graceDaysAfter)
  let globalSaving = $state(false)

  // ── Category tolerance state ───────────────────────────────────────────────

  type Category = {
    id: string
    name: string
    slug: string
    icon: string | null
    defaultExpiryToleranceDays: number
  }

  // svelte-ignore state_referenced_locally
  let categoryRows = $state<Category[]>(data.categories as Category[])

  // Which row is being edited inline (by id)
  let editingCategoryId = $state<string | null>(null)
  // Draft value while editing
  let editingTolerance = $state(0)
  let categorySaving = $state(false)

  // ── Helpers ────────────────────────────────────────────────────────────────

  function startEditCategory(cat: Category) {
    editingCategoryId = cat.id
    editingTolerance = cat.defaultExpiryToleranceDays
  }

  function cancelEditCategory() {
    editingCategoryId = null
  }

  // ── Derived success/error from form action results ─────────────────────────

  const globalSuccess = $derived(
    form && (form as any).action === 'updateGlobalTolerance' && (form as any).success
  )
  const globalError = $derived(
    form && (form as any).action === 'updateGlobalTolerance' ? (form as any).error : null
  )
  const categoryError = $derived(
    form && (form as any).action === 'updateCategoryTolerance' ? (form as any).error : null
  )

  // ── Units state ────────────────────────────────────────────────────────────

  type Unit = {
    id: string
    name: string
    symbol: string
    isSystem: boolean
    householdId: string | null
    sortOrder: number | null
  }

  // svelte-ignore state_referenced_locally
  let unitRows = $state<Unit[]>((data as any).units as Unit[])
  let newUnitName = $state('')
  let newUnitSymbol = $state('')
  let unitAdding = $state(false)
  let unitAddError = $state<string | null>(null)

  // Per-row errors: keyed by unit id
  let unitRowErrors = $state<Record<string, string>>({})

  // Inline edit state
  let editingUnitId = $state<string | null>(null)
  let editingUnitName = $state('')
  let editingUnitSymbol = $state('')
  let unitEditSaving = $state(false)

  function startEditUnit(unit: Unit) {
    editingUnitId = unit.id
    editingUnitName = unit.name
    editingUnitSymbol = unit.symbol
    unitRowErrors = { ...unitRowErrors, [unit.id]: '' }
  }

  function cancelEditUnit() {
    editingUnitId = null
  }

  async function saveEditUnit(id: string) {
    const name = editingUnitName.trim()
    const symbol = editingUnitSymbol.trim()
    if (!name || !symbol) {
      unitRowErrors = { ...unitRowErrors, [id]: 'Name und Kürzel sind erforderlich.' }
      return
    }
    unitEditSaving = true
    unitRowErrors = { ...unitRowErrors, [id]: '' }
    try {
      const res = await fetch(`/api/units/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, symbol }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        unitRowErrors = { ...unitRowErrors, [id]: body.error ?? `Fehler ${res.status}` }
        return
      }
      const updated: Unit = await res.json()
      unitRows = unitRows.map((u) => (u.id === id ? updated : u))
      editingUnitId = null
    } catch {
      unitRowErrors = { ...unitRowErrors, [id]: 'Netzwerkfehler.' }
    } finally {
      unitEditSaving = false
    }
  }

  async function addUnit() {
    const name = newUnitName.trim()
    const symbol = newUnitSymbol.trim()
    if (!name || !symbol) {
      unitAddError = 'Name und Kürzel sind erforderlich.'
      return
    }
    unitAdding = true
    unitAddError = null
    try {
      const res = await fetch('/api/units', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, symbol }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        unitAddError = body.error ?? `Fehler ${res.status}`
        return
      }
      const created: Unit = await res.json()
      unitRows = [...unitRows, created]
      newUnitName = ''
      newUnitSymbol = ''
    } catch {
      unitAddError = 'Netzwerkfehler.'
    } finally {
      unitAdding = false
    }
  }

  async function deleteUnit(id: string) {
    try {
      const res = await fetch(`/api/units/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        toast.error(body.error ?? `Fehler ${res.status}`)
        return
      }
      unitRows = unitRows.filter((u) => u.id !== id)
    } catch {
      toast.error('Netzwerkfehler.')
    }
  }
</script>

<div class="page">
  <header class="page-header">
    <h1 class="page-title">Einstellungen</h1>
  </header>

  <!-- ── Haushaltsmitglieder ───────────────────────────────────────────────── -->

  <section class="settings-section">
    <div class="section-header">
      <h2 class="section-title">Haushaltsmitglieder</h2>
      <span class="section-desc">Mitglieder einladen und verwalten</span>
    </div>
    <div class="section-body">
      <a href="/einstellungen/mitglieder" class="members-link">
        <span>Mitglieder verwalten</span>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M6 3l5 5-5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </a>
    </div>
  </section>

  <!-- ── Märkte ─────────────────────────────────────────────────────────────── -->

  <section class="settings-section">
    <div class="section-header">
      <h2 class="section-title">Märkte</h2>
      <span class="section-desc">Einkaufsmärkte verwalten und Artikeln zuordnen</span>
    </div>
    <div class="section-body">
      <a href="/einstellungen/maerkte" class="members-link">
        <span>Märkte verwalten</span>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M6 3l5 5-5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </a>
    </div>
  </section>

  <section class="settings-section">
    <div class="section-header">
      <h2 class="section-title">
        <span class="section-icon" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <circle cx="9" cy="9" r="7.5" stroke="currentColor" stroke-width="1.5"/>
            <circle cx="9" cy="5.5" r="1.5" fill="currentColor"/>
            <circle cx="9" cy="9" r="1.5" fill="currentColor"/>
            <circle cx="9" cy="12.5" r="1.5" fill="currentColor"/>
          </svg>
        </span>
        MHD-Ampel Konfiguration
      </h2>
      <p class="section-desc">
        Legt fest, ab wann Artikel in der MHD-Ampel als "bald ablaufend" (gelb) oder
        "kritisch" (rot) angezeigt werden.
      </p>
    </div>

    <form
      method="POST"
      action="?/updateGlobalTolerance"
      use:enhance={() => {
        globalSaving = true
        return async ({ update }) => {
          await update()
          globalSaving = false
        }
      }}
    >
      <div class="form-grid">
        <div class="field">
          <label class="label" for="yellow-days">
            <span class="label-dot label-dot--yellow" aria-hidden="true"></span>
            Gelb ab X Tagen vor MHD
          </label>
          <div class="number-input-wrap">
            <input
              id="yellow-days"
              class="input input--number"
              type="number"
              name="yellow_days_before"
              min="0"
              max="365"
              bind:value={yellowDays}
              required
            />
            <span class="input-suffix">Tage</span>
          </div>
          <p class="field-hint">Artikel wird gelb markiert wenn MHD in {yellowDays} Tagen oder weniger.</p>
        </div>

        <div class="field">
          <label class="label" for="red-days">
            <span class="label-dot label-dot--red" aria-hidden="true"></span>
            Rot ab X Tagen vor MHD
          </label>
          <div class="number-input-wrap">
            <input
              id="red-days"
              class="input input--number"
              type="number"
              name="red_days_before"
              min="0"
              max="365"
              bind:value={redDays}
              required
            />
            <span class="input-suffix">Tage</span>
          </div>
          <p class="field-hint">Artikel wird rot markiert wenn MHD in {redDays} Tagen oder weniger.</p>
        </div>

        <div class="field">
          <label class="label" for="grace-days">
            <span class="label-dot label-dot--grace" aria-hidden="true"></span>
            Gnadenfrist nach MHD
          </label>
          <div class="number-input-wrap">
            <input
              id="grace-days"
              class="input input--number"
              type="number"
              name="grace_days_after"
              min="0"
              max="365"
              bind:value={graceDays}
              required
            />
            <span class="input-suffix">Tage</span>
          </div>
          <p class="field-hint">Artikel gilt noch {graceDays} {graceDays === 1 ? 'Tag' : 'Tage'} nach MHD als verwendbar.</p>
        </div>
      </div>

      {#if globalError}
        <div class="alert alert--error" role="alert">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.5"/>
            <path d="M8 5v3.5M8 11v.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          {globalError}
        </div>
      {/if}

      {#if globalSuccess}
        <div class="alert alert--success" role="status">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.5"/>
            <path d="M5 8l2 2 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Ampel-Konfiguration gespeichert.
        </div>
      {/if}

      <div class="form-footer">
        <button
          class="btn-primary"
          type="submit"
          disabled={globalSaving}
        >
          {#if globalSaving}
            <span class="spinner" aria-hidden="true"></span>
            Speichern…
          {:else}
            Speichern
          {/if}
        </button>
      </div>
    </form>
  </section>

  <!-- ── Section 2: MHD-Toleranz nach Kategorie ─────────────────────────── -->

  <section class="settings-section">
    <div class="section-header">
      <h2 class="section-title">
        <span class="section-icon" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <rect x="2.5" y="2.5" width="5.5" height="5.5" rx="1.5" stroke="currentColor" stroke-width="1.5"/>
            <rect x="10" y="2.5" width="5.5" height="5.5" rx="1.5" stroke="currentColor" stroke-width="1.5"/>
            <rect x="2.5" y="10" width="5.5" height="5.5" rx="1.5" stroke="currentColor" stroke-width="1.5"/>
            <rect x="10" y="10" width="5.5" height="5.5" rx="1.5" stroke="currentColor" stroke-width="1.5"/>
          </svg>
        </span>
        MHD-Toleranz nach Kategorie
      </h2>
      <p class="section-desc">
        Pro Kategorie kann ein Toleranz-Offset gesetzt werden.
        <strong>Positive Werte</strong> bedeuten: Artikel ist noch verwendbar X Tage nach MHD
        (z.B. Konserven +180). <strong>Negative Werte</strong> bedeuten: Artikel schon X Tage
        vor MHD als abgelaufen behandeln (z.B. Frischfleisch -1).
      </p>
    </div>

    {#if categoryError}
      <div class="alert alert--error" role="alert">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.5"/>
          <path d="M8 5v3.5M8 11v.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
        {categoryError}
      </div>
    {/if}

    {#if categoryRows.length === 0}
      <div class="empty-hint">Keine Kategorien vorhanden.</div>
    {:else}
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th class="th">Kategorie</th>
              <th class="th th--center">Toleranz-Tage</th>
              <th class="th th--right">Aktion</th>
            </tr>
          </thead>
          <tbody>
            {#each categoryRows as cat (cat.id)}
              <tr class="tr" class:tr--editing={editingCategoryId === cat.id}>
                <td class="td">
                  <span class="cat-name">
                    {#if cat.icon}
                      <span class="cat-icon" aria-hidden="true">{cat.icon}</span>
                    {/if}
                    {cat.name}
                  </span>
                </td>

                <td class="td td--center">
                  {#if editingCategoryId === cat.id}
                    <input
                      class="input input--inline-number"
                      type="number"
                      min="-365"
                      max="365"
                      bind:value={editingTolerance}
                      aria-label="Toleranz-Tage für {cat.name}"
                    />
                  {:else}
                    <span
                      class="tolerance-value"
                      class:tolerance-value--positive={cat.defaultExpiryToleranceDays > 0}
                      class:tolerance-value--negative={cat.defaultExpiryToleranceDays < 0}
                    >
                      {cat.defaultExpiryToleranceDays > 0 ? '+' : ''}{cat.defaultExpiryToleranceDays}
                    </span>
                  {/if}
                </td>

                <td class="td td--right">
                  {#if editingCategoryId === cat.id}
                    <div class="action-row">
                      <form
                        method="POST"
                        action="?/updateCategoryTolerance"
                        use:enhance={() => {
                          categorySaving = true
                          return async ({ result, update }) => {
                            await update({ reset: false })
                            categorySaving = false
                            if (result.type === 'success') {
                              // Patch local state
                              categoryRows = categoryRows.map((c) =>
                                c.id === cat.id
                                  ? { ...c, defaultExpiryToleranceDays: editingTolerance }
                                  : c
                              )
                              editingCategoryId = null
                            }
                          }
                        }}
                      >
                        <input type="hidden" name="category_id" value={cat.id} />
                        <input type="hidden" name="tolerance_days" value={editingTolerance} />
                        <button
                          class="btn-save-inline"
                          type="submit"
                          disabled={categorySaving}
                          aria-label="Speichern"
                        >
                          {#if categorySaving}
                            <span class="spinner spinner--sm" aria-hidden="true"></span>
                          {:else}
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                              <path d="M2 7l3.5 3.5L12 3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                          {/if}
                          Speichern
                        </button>
                      </form>
                      <button
                        class="btn-cancel-inline"
                        type="button"
                        onclick={cancelEditCategory}
                        aria-label="Abbrechen"
                      >
                        Abbrechen
                      </button>
                    </div>
                  {:else}
                    <button
                      class="btn-edit-inline"
                      type="button"
                      onclick={() => startEditCategory(cat)}
                      aria-label="Toleranz für {cat.name} bearbeiten"
                    >
                      <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                        <path d="M9.5 2.5L11.5 4.5L5 11H3V9L9.5 2.5Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
                      </svg>
                      Bearbeiten
                    </button>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </section>

  <!-- ── Section 3: Einheiten ──────────────────────────────────────────── -->

  <section class="settings-section">
    <div class="section-header">
      <h2 class="section-title">
        <span class="section-icon" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M4 14V4M4 9h6M10 4v10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M13 7l2 2-2 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </span>
        Einheiten
      </h2>
      <p class="section-desc">
        Verwalte die Mengeneinheiten, die bei Artikeln verwendet werden. System-Einheiten sind
        schreibgeschützt. Eigene Einheiten können jederzeit gelöscht werden.
      </p>
    </div>

    {#if unitAddError}
      <div class="alert alert--error" role="alert">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.5"/>
          <path d="M8 5v3.5M8 11v.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
        {unitAddError}
      </div>
    {/if}

    <div class="units-list" role="list">
      {#each unitRows as unit (unit.id)}
        <div class="unit-row" role="listitem">
          {#if editingUnitId === unit.id}
            <div class="unit-chip unit-chip--editing">
              <input
                class="input unit-input-inline"
                type="text"
                value={editingUnitName}
                oninput={(e) => { editingUnitName = (e.currentTarget as HTMLInputElement).value }}
                maxlength="32"
                aria-label="Name"
                onkeydown={(e) => {
                  if (e.key === 'Enter') saveEditUnit(unit.id)
                  if (e.key === 'Escape') cancelEditUnit()
                }}
              />
              <input
                class="input unit-input-inline unit-input-inline--symbol"
                type="text"
                value={editingUnitSymbol}
                oninput={(e) => { editingUnitSymbol = (e.currentTarget as HTMLInputElement).value }}
                maxlength="8"
                aria-label="Kürzel"
                onkeydown={(e) => {
                  if (e.key === 'Enter') saveEditUnit(unit.id)
                  if (e.key === 'Escape') cancelEditUnit()
                }}
              />
              <button
                class="btn-save-inline"
                type="button"
                disabled={unitEditSaving}
                aria-label="Speichern"
                onclick={() => saveEditUnit(unit.id)}
              >
                {#if unitEditSaving}
                  <span class="spinner spinner--sm" aria-hidden="true"></span>
                {:else}
                  <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                    <path d="M2 7l3.5 3.5L12 3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                {/if}
                Speichern
              </button>
              <button
                class="btn-cancel-inline"
                type="button"
                onclick={cancelEditUnit}
                aria-label="Abbrechen"
              >
                Abbrechen
              </button>
            </div>
          {:else}
            <div class="unit-chip">
              <span class="unit-name">{unit.name}</span>
              <span class="unit-symbol">({unit.symbol})</span>
              {#if unit.isSystem}
                <span class="unit-badge" aria-label="System-Einheit">
                  <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
                    <rect x="3" y="5" width="5" height="4" rx="0.75" stroke="currentColor" stroke-width="1.2"/>
                    <path d="M4 5V3.5a1.5 1.5 0 013 0V5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
                  </svg>
                  System
                </span>
              {:else}
                <button
                  class="unit-edit"
                  type="button"
                  aria-label="Einheit {unit.name} bearbeiten"
                  onclick={() => startEditUnit(unit)}
                >
                  <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                    <path d="M9.5 2.5L11.5 4.5L5 11H3V9L9.5 2.5Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
                  </svg>
                </button>
                <button
                  class="unit-delete"
                  type="button"
                  aria-label="Einheit {unit.name} löschen"
                  onclick={() => deleteUnit(unit.id)}
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                    <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                  </svg>
                </button>
              {/if}
            </div>
          {/if}
        </div>
      {/each}
    </div>

    <div class="unit-add-row">
      <input
        class="input unit-input"
        type="text"
        placeholder="Name"
        bind:value={newUnitName}
        maxlength="64"
        aria-label="Name der neuen Einheit"
        onkeydown={(e) => { if (e.key === 'Enter') addUnit() }}
      />
      <input
        class="input unit-input unit-input--symbol"
        type="text"
        placeholder="Kürzel"
        bind:value={newUnitSymbol}
        maxlength="16"
        aria-label="Kürzel der neuen Einheit"
        onkeydown={(e) => { if (e.key === 'Enter') addUnit() }}
      />
      <button
        class="btn-primary"
        type="button"
        disabled={unitAdding}
        onclick={addUnit}
      >
        {#if unitAdding}
          <span class="spinner" aria-hidden="true"></span>
          Hinzufügen…
        {:else}
          Hinzufügen
        {/if}
      </button>
    </div>
  </section>

  <!-- ── Section 4: Bring! Integration (Placeholder) ───────────────────── -->

  <section class="settings-section settings-section--disabled">
    <div class="section-header">
      <h2 class="section-title">
        <span class="section-icon" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <circle cx="9" cy="9" r="7.5" stroke="currentColor" stroke-width="1.5"/>
            <path d="M6 9h6M9 6l3 3-3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </span>
        Bring! Integration
        <span class="coming-soon-badge">Kommt in Phase 3</span>
      </h2>
      <p class="section-desc">
        Verbinde stoqr mit deiner Bring!-Einkaufsliste. Abgelaufene oder verbrauchte Artikel
        werden automatisch auf die Einkaufsliste gesetzt.
      </p>
    </div>

    <div class="form-grid">
      <div class="field">
        <label class="label label--disabled" for="bring-email">Bring! E-Mail</label>
        <input
          id="bring-email"
          class="input input--disabled"
          type="email"
          placeholder="deine@email.de"
          disabled
          autocomplete="off"
        />
      </div>

      <div class="field">
        <label class="label label--disabled" for="bring-password">Bring! Passwort</label>
        <input
          id="bring-password"
          class="input input--disabled"
          type="password"
          placeholder="••••••••"
          disabled
          autocomplete="off"
        />
      </div>
    </div>

    <div class="form-footer">
      <button class="btn-primary btn-primary--disabled" type="button" disabled>
        Verbinden
      </button>
    </div>
  </section>
</div>

<style>
  /* ── Page ─────────────────────────────────────────────────────────────── */

  .page {
    max-width: 760px;
    margin: 0 auto;
    padding: var(--space-8) var(--space-6) var(--space-16);
  }

  .page-header {
    margin-bottom: var(--space-8);
  }

  .page-title {
    font-family: var(--font-display);
    font-size: var(--text-2xl);
    font-weight: 700;
    color: var(--color-text-primary);
    letter-spacing: -0.02em;
    margin: 0;
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

  .settings-section--disabled {
    opacity: 0.6;
  }

  .section-header {
    margin-bottom: var(--space-6);
  }

  .section-title {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-family: var(--font-display);
    font-size: var(--text-lg);
    font-weight: 700;
    color: var(--color-text-primary);
    margin: 0 0 var(--space-2);
    flex-wrap: wrap;
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

  .section-desc {
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
    margin: 0;
    line-height: 1.6;
  }

  /* ── Coming-soon badge ────────────────────────────────────────────────── */

  .coming-soon-badge {
    display: inline-flex;
    align-items: center;
    height: 20px;
    padding: 0 var(--space-2);
    border-radius: var(--radius-full);
    background-color: var(--color-accent-subtle);
    color: var(--color-accent);
    font-family: var(--font-body);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.01em;
    white-space: nowrap;
  }

  /* ── Form grid ────────────────────────────────────────────────────────── */

  .form-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: var(--space-5);
    margin-bottom: var(--space-5);
  }

  .form-footer {
    display: flex;
    justify-content: flex-end;
  }

  /* ── Field ────────────────────────────────────────────────────────────── */

  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .label {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--color-text-secondary);
  }

  .label--disabled {
    color: var(--color-text-muted);
  }

  .label-dot {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .label-dot--yellow { background-color: #ca8a04; }
  .label-dot--red    { background-color: var(--color-danger, #dc2626); }
  .label-dot--grace  { background-color: var(--color-success, #16a34a); }

  .field-hint {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    margin: 0;
    line-height: 1.5;
  }

  /* ── Inputs ───────────────────────────────────────────────────────────── */

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

  .input::placeholder {
    color: var(--color-text-muted);
  }

  .input:focus {
    border-color: var(--color-border-focus);
    box-shadow: 0 0 0 3px rgba(196, 103, 58, 0.15);
  }

  .input--disabled {
    background-color: var(--color-surface-sunken);
    color: var(--color-text-muted);
    cursor: not-allowed;
  }

  .input--number {
    max-width: 120px;
  }

  .input--inline-number {
    height: 32px;
    width: 80px;
    font-size: var(--text-sm);
    text-align: center;
  }

  .number-input-wrap {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .input-suffix {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    white-space: nowrap;
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

  .alert--success {
    background-color: var(--color-success-subtle, #dcfce7);
    color: var(--color-success, #16a34a);
    border: 1px solid rgba(22, 163, 74, 0.2);
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

  .btn-primary:disabled,
  .btn-primary--disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  /* ── Table ────────────────────────────────────────────────────────────── */

  .table-wrap {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    border-radius: var(--radius-lg);
    border: 1px solid var(--color-border);
  }

  .table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--text-sm);
  }

  .th {
    padding: var(--space-3) var(--space-4);
    background-color: var(--color-surface-sunken);
    font-weight: 600;
    color: var(--color-text-secondary);
    text-align: left;
    border-bottom: 1px solid var(--color-border);
    white-space: nowrap;
  }

  .th--center { text-align: center; }
  .th--right  { text-align: right; }

  .tr {
    border-bottom: 1px solid var(--color-border-subtle);
    transition: background-color var(--transition-fast);
  }

  .tr:last-child {
    border-bottom: none;
  }

  .tr:hover {
    background-color: var(--color-surface-sunken);
  }

  .tr--editing {
    background-color: var(--color-primary-subtle);
  }

  .td {
    padding: var(--space-3) var(--space-4);
    color: var(--color-text-primary);
    vertical-align: middle;
  }

  .td--center { text-align: center; }
  .td--right  { text-align: right; }

  /* ── Category name cell ───────────────────────────────────────────────── */

  .cat-name {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    font-weight: 500;
  }

  .cat-icon {
    font-size: 1rem;
    line-height: 1;
    flex-shrink: 0;
  }

  /* ── Tolerance value display ──────────────────────────────────────────── */

  .tolerance-value {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 48px;
    height: 24px;
    padding: 0 var(--space-2);
    border-radius: var(--radius-full);
    font-size: var(--text-xs);
    font-weight: 700;
    background-color: var(--color-surface-sunken);
    color: var(--color-text-muted);
  }

  .tolerance-value--positive {
    background-color: var(--color-success-subtle, #dcfce7);
    color: var(--color-success, #16a34a);
  }

  .tolerance-value--negative {
    background-color: var(--color-danger-subtle, #fee2e2);
    color: var(--color-danger, #dc2626);
  }

  /* ── Inline edit actions ──────────────────────────────────────────────── */

  .action-row {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--space-2);
    flex-wrap: wrap;
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

  /* ── Empty hint ───────────────────────────────────────────────────────── */

  .empty-hint {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    padding: var(--space-4) 0;
  }

  /* ── Units ────────────────────────────────────────────────────────────── */

  .units-list {
    display: flex;
    flex-direction: row;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-bottom: var(--space-5);
    min-height: 36px;
    align-items: flex-start;
  }

  .unit-row {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .unit-chip {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    min-height: 36px;
    padding: 0 var(--space-3);
    border-radius: var(--radius-full);
    border: 1px solid var(--color-border);
    background-color: var(--color-surface);
    font-size: var(--text-sm);
    color: var(--color-text-primary);
    white-space: nowrap;
    align-self: flex-start;
  }

  .unit-chip--editing {
    border-radius: var(--radius-lg);
    padding: var(--space-2) var(--space-3);
    gap: var(--space-2);
    white-space: normal;
    flex-wrap: wrap;
    align-self: stretch;
  }

  .unit-name {
    font-weight: 500;
  }

  .unit-symbol {
    color: var(--color-text-muted);
    font-size: var(--text-xs);
  }

  .unit-badge {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    height: 20px;
    padding: 0 var(--space-2);
    border-radius: var(--radius-full);
    background-color: var(--color-surface-sunken);
    color: var(--color-text-muted);
    font-size: 11px;
    font-weight: 600;
    margin-left: var(--space-1);
  }

  .unit-edit {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: none;
    background-color: transparent;
    color: var(--color-text-muted);
    cursor: pointer;
    padding: 0;
    margin-left: var(--space-1);
    flex-shrink: 0;
    transition: background-color var(--transition-fast), color var(--transition-fast);
  }

  .unit-edit:hover {
    background-color: var(--color-primary-subtle);
    color: var(--color-primary);
  }

  .unit-delete {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: none;
    background-color: transparent;
    color: var(--color-text-muted);
    cursor: pointer;
    padding: 0;
    margin-left: var(--space-1);
    flex-shrink: 0;
    transition: background-color var(--transition-fast), color var(--transition-fast);
  }

  .unit-delete:hover {
    background-color: var(--color-danger-subtle, #fee2e2);
    color: var(--color-danger, #dc2626);
  }

  .unit-input-inline {
    height: 28px;
    flex: 1 1 100px;
    min-width: 80px;
    max-width: 180px;
    font-size: var(--text-sm);
    padding: 0 var(--space-2);
  }

  .unit-input-inline--symbol {
    flex: 0 1 72px;
    max-width: 80px;
  }

  .unit-add-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-wrap: wrap;
  }

  .unit-input {
    flex: 1 1 140px;
    max-width: 220px;
  }

  .unit-input--symbol {
    flex: 0 1 100px;
    max-width: 100px;
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

    .form-grid {
      grid-template-columns: 1fr;
    }

    .form-footer {
      justify-content: stretch;
    }

    .btn-primary {
      width: 100%;
      justify-content: center;
    }

    .action-row {
      gap: var(--space-1);
    }

    /* Increase inline button touch targets for mobile */
    .btn-edit-inline,
    .btn-save-inline,
    .btn-cancel-inline {
      height: 44px;
      padding: 0 var(--space-4);
    }

    /* Unit edit/delete icon buttons — increase tap area */
    .unit-edit,
    .unit-delete {
      width: 36px;
      height: 36px;
    }
  }

  .members-link {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    color: var(--color-primary);
    text-decoration: none;
    font-weight: 500;
    font-size: var(--text-base);
    padding: var(--space-3) var(--space-4);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    transition: background var(--transition-fast), border-color var(--transition-fast);
  }
  .members-link:hover {
    background: var(--color-primary-subtle);
    border-color: var(--color-primary);
  }

  .section-desc {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    margin-top: var(--space-1);
    display: block;
  }
</style>

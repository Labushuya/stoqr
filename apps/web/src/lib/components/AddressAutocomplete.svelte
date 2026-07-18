<script lang="ts">
  import type { GeoSuggestion } from '$lib/utils/geo'
  import { formatStreet } from '$lib/utils/geo'

  interface Props {
    // Aktueller Adress-Text (Straße + Hausnummer); bind:value vom Parent.
    value: string
    placeholder?: string
    ariaLabel?: string
    // Wird beim Auswählen eines Vorschlags aufgerufen (Parent füllt Stadt/Koordinaten).
    onselect?: (s: GeoSuggestion) => void
  }

  let { value = $bindable(''), placeholder = 'Adresse suchen…', ariaLabel = 'Adresse', onselect }: Props =
    $props()

  let suggestions = $state<GeoSuggestion[]>([])
  let open = $state(false)
  let loading = $state(false)
  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  async function runSearch(q: string) {
    loading = true
    try {
      const res = await fetch(`/api/geo/search?q=${encodeURIComponent(q)}`)
      const b = await res.json().catch(() => ({ results: [] }))
      suggestions = Array.isArray(b?.results) ? (b.results as GeoSuggestion[]) : []
      open = suggestions.length > 0
    } catch {
      suggestions = []
      open = false
    } finally {
      loading = false
    }
  }

  function onInput() {
    if (debounceTimer) clearTimeout(debounceTimer)
    const q = value.trim()
    if (q.length < 3) {
      suggestions = []
      open = false
      return
    }
    // Debounce >= 450ms (Nominatim-Höflichkeit + weniger Requests).
    debounceTimer = setTimeout(() => runSearch(q), 500)
  }

  function pick(s: GeoSuggestion) {
    const street = formatStreet(s)
    value = street || s.displayName
    open = false
    suggestions = []
    onselect?.(s)
  }
</script>

<div class="addr-autocomplete">
  <input
    class="input"
    type="text"
    bind:value
    {placeholder}
    aria-label={ariaLabel}
    autocomplete="off"
    oninput={onInput}
    onfocus={() => { if (suggestions.length) open = true }}
    onblur={() => setTimeout(() => (open = false), 150)}
  />
  {#if loading}<span class="addr-hint">suche…</span>{/if}
  {#if open && suggestions.length}
    <ul class="addr-list" role="listbox">
      {#each suggestions as s (s.displayName)}
        <li>
          <button type="button" class="addr-item" onclick={() => pick(s)}>
            {s.displayName}
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .addr-autocomplete { position: relative; flex: 1 1 100%; }
  .addr-autocomplete .input { width: 100%; box-sizing: border-box; }
  .addr-hint { position: absolute; right: var(--space-2); top: 50%; transform: translateY(-50%); font-size: 11px; color: var(--color-text-muted); }
  .addr-list {
    position: absolute; z-index: 40; top: calc(100% + 2px); left: 0; right: 0;
    margin: 0; padding: var(--space-1); list-style: none;
    background: var(--color-surface-raised); border: 1px solid var(--color-border);
    border-radius: var(--radius-md); box-shadow: var(--shadow-lg);
    max-height: 260px; overflow-y: auto;
  }
  .addr-item {
    display: block; width: 100%; text-align: left; padding: var(--space-2) var(--space-3);
    border: none; background: transparent; color: var(--color-text-primary);
    font-size: var(--text-sm); cursor: pointer; border-radius: var(--radius-sm);
  }
  .addr-item:hover { background: var(--color-primary-subtle); }
</style>

<script lang="ts">
  interface NutrientEntry {
    nutrientType: {
      name: string;
      unit: string;
      slug: string;
      parentId: string | null;
    };
    valuePer100: string;
  }

  interface SavePayload {
    slug: string;
    value: number;
  }

  interface Props {
    nutrients: NutrientEntry[];
    editable?: boolean;
    onSave?: (nutrients: SavePayload[]) => void;
  }

  let { nutrients = [], editable = false, onSave }: Props = $props();

  // Standard nutrient order with sub-row metadata
  const STANDARD_NUTRIENTS: { slug: string; label: string; unit: string; isChild: boolean }[] = [
    { slug: 'energie',                  label: 'Energie',                     unit: 'kcal', isChild: false },
    { slug: 'fett',                     label: 'Fett',                        unit: 'g',    isChild: false },
    { slug: 'gesaettigte-fettsaeuren',  label: 'davon gesättigte Fettsäuren', unit: 'g',    isChild: true  },
    { slug: 'kohlenhydrate',            label: 'Kohlenhydrate',               unit: 'g',    isChild: false },
    { slug: 'zucker',                   label: 'davon Zucker',                unit: 'g',    isChild: true  },
    { slug: 'ballaststoffe',            label: 'Ballaststoffe',               unit: 'g',    isChild: false },
    { slug: 'eiweiss',                  label: 'Eiweiß',                      unit: 'g',    isChild: false },
    { slug: 'salz',                     label: 'Salz',                        unit: 'g',    isChild: false },
  ];

  // Build a lookup map from slug → valuePer100
  const nutrientMap = $derived(
    new Map(nutrients.map((n) => [n.nutrientType.slug, n.valuePer100]))
  );

  // Edit state: draft values for standard rows + custom rows
  let draftStandard = $state<Record<string, string>>({});
  let customRows = $state<{ slug: string; label: string; unit: string; value: string }[]>([]);
  let customSlugCounter = $state(0);

  // Initialise draft when entering edit mode or when nutrients change
  $effect(() => {
    if (editable) {
      const initial: Record<string, string> = {};
      for (const row of STANDARD_NUTRIENTS) {
        initial[row.slug] = nutrientMap.get(row.slug) ?? '';
      }
      draftStandard = initial;

      // Populate custom rows: anything in nutrients that is NOT a standard slug
      const standardSlugs = new Set(STANDARD_NUTRIENTS.map((r) => r.slug));
      customRows = nutrients
        .filter((n) => !standardSlugs.has(n.nutrientType.slug))
        .map((n) => ({
          slug: n.nutrientType.slug,
          label: n.nutrientType.name,
          unit: n.nutrientType.unit,
          value: n.valuePer100,
        }));
    }
  });

  function addCustomRow() {
    customSlugCounter += 1;
    customRows = [
      ...customRows,
      { slug: `custom-${customSlugCounter}`, label: '', unit: 'g', value: '' },
    ];
  }

  function removeCustomRow(slug: string) {
    customRows = customRows.filter((r) => r.slug !== slug);
  }

  function handleSave() {
    const result: SavePayload[] = [];

    for (const row of STANDARD_NUTRIENTS) {
      const raw = draftStandard[row.slug];
      if (raw !== '' && raw !== undefined) {
        const num = parseFloat(raw);
        if (!isNaN(num)) result.push({ slug: row.slug, value: num });
      }
    }

    for (const row of customRows) {
      if (row.label.trim() && row.value !== '') {
        const num = parseFloat(row.value);
        if (!isNaN(num)) result.push({ slug: row.slug || row.label.trim().toLowerCase().replace(/\s+/g, '-'), value: num });
      }
    }

    onSave?.(result);
  }
</script>

<div class="nutrient-table">
  <div class="table-header">
    <span class="header-label">Nährwerte</span>
    <span class="header-sub">je 100 g / 100 ml</span>
  </div>

  <table>
    <tbody>
      {#if editable}
        {#each STANDARD_NUTRIENTS as row}
          <tr class:child-row={row.isChild}>
            <td class="label-cell">
              {#if row.isChild}
                <span class="child-indent">{row.label}</span>
              {:else}
                {row.label}
              {/if}
            </td>
            <td class="value-cell">
              <div class="input-group">
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  placeholder="—"
                  bind:value={draftStandard[row.slug]}
                  class="nutrient-input"
                  aria-label="{row.label} in {row.unit}"
                />
                <span class="unit">{row.unit}</span>
              </div>
            </td>
          </tr>
        {/each}

        {#each customRows as row (row.slug)}
          <tr class="custom-row">
            <td class="label-cell">
              <input
                type="text"
                placeholder="Bezeichnung"
                bind:value={row.label}
                class="label-input"
                aria-label="Bezeichnung"
              />
            </td>
            <td class="value-cell">
              <div class="input-group">
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  placeholder="—"
                  bind:value={row.value}
                  class="nutrient-input"
                  aria-label="Wert"
                />
                <input
                  type="text"
                  placeholder="Einheit"
                  bind:value={row.unit}
                  class="unit-input"
                  aria-label="Einheit"
                />
                <button
                  type="button"
                  class="remove-btn"
                  onclick={() => removeCustomRow(row.slug)}
                  aria-label="Zeile entfernen"
                >
                  ×
                </button>
              </div>
            </td>
          </tr>
        {/each}
      {:else}
        {#each STANDARD_NUTRIENTS as row}
          {@const val = nutrientMap.get(row.slug)}
          <tr class:child-row={row.isChild}>
            <td class="label-cell">
              {#if row.isChild}
                <span class="child-indent">{row.label}</span>
              {:else}
                {row.label}
              {/if}
            </td>
            <td class="value-cell">
              {#if val !== undefined}
                <span class="value">{val}</span>
                <span class="unit">{row.unit}</span>
              {:else}
                <span class="no-value">Keine Angabe</span>
              {/if}
            </td>
          </tr>
        {/each}

        {#each nutrients.filter((n) => !STANDARD_NUTRIENTS.some((s) => s.slug === n.nutrientType.slug)) as extra}
          <tr>
            <td class="label-cell">{extra.nutrientType.name}</td>
            <td class="value-cell">
              <span class="value">{extra.valuePer100}</span>
              <span class="unit">{extra.nutrientType.unit}</span>
            </td>
          </tr>
        {/each}
      {/if}
    </tbody>
  </table>

  {#if editable}
    <div class="actions">
      <button type="button" class="btn-add" onclick={addCustomRow}>
        + Nährwert hinzufügen
      </button>
      <button type="button" class="btn-save" onclick={handleSave}>
        Speichern
      </button>
    </div>
  {/if}
</div>

<style>
  .nutrient-table {
    background-color: var(--color-surface-raised);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    overflow: hidden;
    box-shadow: var(--shadow-sm);
  }

  /* ---- Header ---- */
  .table-header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    padding: var(--space-3) var(--space-4);
    background-color: var(--color-accent-subtle);
    border-bottom: 1px solid var(--color-border);
  }

  .header-label {
    font-family: var(--font-display);
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--color-text-primary);
    letter-spacing: 0.02em;
    text-transform: uppercase;
  }

  .header-sub {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    font-weight: 400;
  }

  /* ---- Table ---- */
  table {
    width: 100%;
    border-collapse: collapse;
  }

  tr {
    border-bottom: 1px solid var(--color-border-subtle);
  }

  tr:last-child {
    border-bottom: none;
  }

  tr.child-row {
    background-color: var(--color-surface);
  }

  tr.custom-row {
    background-color: var(--color-primary-subtle);
  }

  td {
    padding: var(--space-2) var(--space-4);
    font-size: var(--text-sm);
    vertical-align: middle;
  }

  /* ---- Label column ---- */
  .label-cell {
    color: var(--color-text-secondary);
    width: 60%;
  }

  .child-indent {
    display: inline-block;
    padding-left: var(--space-5);
    color: var(--color-text-muted);
    font-style: italic;
  }

  /* ---- Value column ---- */
  .value-cell {
    text-align: right;
    color: var(--color-text-primary);
    white-space: nowrap;
  }

  .value {
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    font-weight: 500;
  }

  .unit {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    margin-left: var(--space-1);
  }

  .no-value {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    font-style: italic;
  }

  /* ---- Edit mode inputs ---- */
  .input-group {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--space-1);
  }

  .nutrient-input {
    width: 80px;
    text-align: right;
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background-color: var(--color-surface);
    color: var(--color-text-primary);
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
    appearance: textfield;
    -moz-appearance: textfield;
  }

  .nutrient-input::-webkit-outer-spin-button,
  .nutrient-input::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  .nutrient-input:focus {
    outline: none;
    border-color: var(--color-border-focus);
    box-shadow: 0 0 0 2px var(--color-primary-subtle);
  }

  .label-input {
    width: 100%;
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background-color: var(--color-surface);
    color: var(--color-text-primary);
    font-family: var(--font-body);
    font-size: var(--text-sm);
    transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
  }

  .label-input:focus {
    outline: none;
    border-color: var(--color-border-focus);
    box-shadow: 0 0 0 2px var(--color-primary-subtle);
  }

  .unit-input {
    width: 48px;
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background-color: var(--color-surface);
    color: var(--color-text-muted);
    font-family: var(--font-body);
    font-size: var(--text-xs);
    text-align: center;
    transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
  }

  .unit-input:focus {
    outline: none;
    border-color: var(--color-border-focus);
    box-shadow: 0 0 0 2px var(--color-primary-subtle);
  }

  .remove-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border: none;
    border-radius: var(--radius-full);
    background-color: var(--color-danger-subtle);
    color: var(--color-danger);
    font-size: var(--text-base);
    line-height: 1;
    cursor: pointer;
    transition: background-color var(--transition-fast), color var(--transition-fast);
    flex-shrink: 0;
  }

  .remove-btn:hover {
    background-color: var(--color-danger);
    color: var(--color-text-inverse);
  }

  /* ---- Actions bar ---- */
  .actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-3) var(--space-4);
    border-top: 1px solid var(--color-border);
    background-color: var(--color-surface);
  }

  .btn-add {
    padding: var(--space-2) var(--space-3);
    border: 1px dashed var(--color-border-strong);
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-text-secondary);
    font-family: var(--font-body);
    font-size: var(--text-sm);
    cursor: pointer;
    transition: border-color var(--transition-fast), color var(--transition-fast), background-color var(--transition-fast);
  }

  .btn-add:hover {
    border-color: var(--color-primary);
    color: var(--color-primary);
    background-color: var(--color-primary-subtle);
  }

  .btn-save {
    padding: var(--space-2) var(--space-5);
    border: none;
    border-radius: var(--radius-sm);
    background-color: var(--color-primary);
    color: var(--color-text-inverse);
    font-family: var(--font-body);
    font-size: var(--text-sm);
    font-weight: 600;
    cursor: pointer;
    transition: background-color var(--transition-fast), box-shadow var(--transition-fast);
  }

  .btn-save:hover {
    background-color: var(--color-primary-hover);
    box-shadow: var(--shadow-sm);
  }

  .btn-save:active {
    transform: translateY(1px);
  }
</style>

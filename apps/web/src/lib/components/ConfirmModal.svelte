<script lang="ts">
  let {
    open = false,
    title,
    message,
    confirmLabel = 'Bestätigen',
    cancelLabel = 'Abbrechen',
    destructive = false,
    onConfirm,
    onCancel,
  }: {
    open: boolean
    title: string
    message: string
    confirmLabel?: string
    cancelLabel?: string
    destructive?: boolean
    onConfirm: () => void
    onCancel: () => void
  } = $props()
</script>

{#if open}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="modal-backdrop" onclick={onCancel} onkeydown={(e) => e.key === 'Escape' && onCancel()}>
    <div
      class="modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
      tabindex="-1"
    >
      <div class="modal-header">
        <h2 id="modal-title" class="modal-title">{title}</h2>
      </div>
      <div class="modal-body">
        <p class="modal-message">{message}</p>
      </div>
      <div class="modal-footer">
        <button class="btn-cancel" type="button" onclick={onCancel}>
          {cancelLabel}
        </button>
        <button
          class="btn-confirm"
          class:btn-confirm--destructive={destructive}
          type="button"
          onclick={onConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: var(--z-modal, 400);
    background: rgba(0, 0, 0, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-4);
  }

  .modal {
    background: var(--color-surface-raised);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-xl);
    box-shadow: var(--shadow-xl);
    width: 100%;
    max-width: 420px;
    overflow: hidden;
    animation: modal-in 160ms cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  @keyframes modal-in {
    from { opacity: 0; transform: scale(0.95) translateY(8px); }
    to   { opacity: 1; transform: scale(1)    translateY(0);   }
  }

  .modal-header {
    padding: var(--space-5) var(--space-6) 0;
  }

  .modal-title {
    font-family: var(--font-display);
    font-size: var(--text-lg);
    font-weight: 700;
    color: var(--color-text-primary);
    margin: 0;
  }

  .modal-body {
    padding: var(--space-3) var(--space-6) var(--space-5);
  }

  .modal-message {
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
    line-height: 1.6;
    margin: 0;
    white-space: pre-line;
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-3);
    padding: var(--space-4) var(--space-6);
    border-top: 1px solid var(--color-border-subtle);
    background: var(--color-surface);
  }

  .btn-cancel {
    height: 36px;
    padding: 0 var(--space-4);
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
    background: transparent;
    color: var(--color-text-secondary);
    font-size: var(--text-sm);
    font-weight: 500;
    cursor: pointer;
    transition: background var(--transition-fast), color var(--transition-fast);
  }

  .btn-cancel:hover {
    background: var(--color-surface-sunken);
    color: var(--color-text-primary);
  }

  .btn-confirm {
    height: 36px;
    padding: 0 var(--space-4);
    border-radius: var(--radius-md);
    border: none;
    background: var(--color-primary);
    color: #fff;
    font-size: var(--text-sm);
    font-weight: 600;
    cursor: pointer;
    transition: background var(--transition-fast);
  }

  .btn-confirm:hover {
    background: var(--color-primary-hover);
  }

  .btn-confirm--destructive {
    background: var(--color-danger);
  }

  .btn-confirm--destructive:hover {
    background: #901c12;
  }
</style>

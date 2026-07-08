<script lang="ts">
  // No reactive state needed for a static placeholder
</script>

<div class="page">
  <div class="card">
    <!-- Cart icon -->
    <div class="icon-wrap" aria-hidden="true">
      <svg
        width="48"
        height="48"
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M6 8h4l5.6 22.4A4 4 0 0 0 19.5 33h17a4 4 0 0 0 3.87-3L43 16H14"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <circle cx="20" cy="40" r="2.5" stroke="currentColor" stroke-width="2.5" />
        <circle cx="36" cy="40" r="2.5" stroke="currentColor" stroke-width="2.5" />
      </svg>
    </div>

    <h1 class="heading">Einkaufsliste</h1>

    <p class="subtext">Die Einkaufsliste wird in Phase 3 implementiert.</p>

    <div class="planned-box">
      <p class="planned-label">Geplante Features</p>
      <ul class="planned-list">
        <li>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M2 7l3.5 3.5L12 3.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Automatische Generierung aus Vorrat &amp; Bedarf
        </li>
        <li>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M2 7l3.5 3.5L12 3.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Integration mit Bring!
        </li>
        <li>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M2 7l3.5 3.5L12 3.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Manuelle Artikel hinzufügen &amp; abhaken
        </li>
      </ul>
    </div>

    <a href="/" class="back-link">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M10 3L5 8l5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      Zurück zum Dashboard
    </a>
  </div>
</div>

<style>
  .page {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 60vh;
    padding: var(--space-8) var(--space-6);
  }

  .card {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: var(--space-5);
    max-width: 420px;
    width: 100%;
    background-color: var(--color-surface-raised);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-xl);
    padding: var(--space-12) var(--space-8);
    box-shadow: var(--shadow-md);
  }

  .icon-wrap {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 80px;
    height: 80px;
    border-radius: var(--radius-xl);
    background-color: var(--color-primary-subtle);
    color: var(--color-primary);
    flex-shrink: 0;
  }

  .heading {
    font-family: var(--font-display);
    font-size: var(--text-2xl);
    font-weight: 700;
    color: var(--color-text-primary);
    letter-spacing: -0.02em;
    margin: 0;
  }

  .subtext {
    font-size: var(--text-base);
    color: var(--color-text-secondary);
    margin: 0;
    line-height: 1.6;
  }

  .planned-box {
    width: 100%;
    background-color: var(--color-surface);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-lg);
    padding: var(--space-4) var(--space-5);
    text-align: left;
  }

  .planned-label {
    font-size: var(--text-xs);
    font-weight: 600;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin: 0 0 var(--space-3);
  }

  .planned-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .planned-list li {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
    line-height: 1.5;
  }

  .planned-list li svg {
    color: var(--color-secondary);
    flex-shrink: 0;
  }

  .back-link {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--color-text-link);
    text-decoration: none;
    transition: color var(--transition-fast), gap var(--transition-fast);
  }

  .back-link:hover {
    color: var(--color-primary-hover);
    gap: var(--space-2);
  }

  @media (max-width: 480px) {
    .card {
      padding: var(--space-8) var(--space-5);
    }

    .heading {
      font-size: var(--text-xl);
    }
  }
</style>

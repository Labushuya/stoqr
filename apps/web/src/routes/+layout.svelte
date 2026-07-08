<script lang="ts">
  import '../app.css'
  import { page } from '$app/stores'
  import { goto, invalidateAll } from '$app/navigation'
  import Toast from '$lib/components/Toast.svelte'

  let { data, children } = $props()

  let menuOpen = $state(false)

  // Dark mode — persisted in localStorage
  let darkMode = $state(
    typeof localStorage !== 'undefined'
      ? localStorage.getItem('stoqr-theme') === 'dark'
      : false
  )

  function toggleDarkMode() {
    darkMode = !darkMode
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('stoqr-theme', darkMode ? 'dark' : 'light')
    }
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : '')
  }

  // Apply on mount
  $effect(() => {
    if (darkMode) {
      document.documentElement.setAttribute('data-theme', 'dark')
    }
  })

  const navLinks = [
    { href: '/',          label: 'Dashboard' },
    { href: '/inventar',  label: 'Inventar'  },
    { href: '/orte',      label: 'Orte'      },
    { href: '/einkaufsliste', label: 'Einkaufsliste' },
    { href: '/einstellungen', label: 'Einstellungen' },
  ]

  function isActive(href: string): boolean {
    if (href === '/') return $page.url.pathname === '/'
    return $page.url.pathname === href || $page.url.pathname.startsWith(href + '/')
  }

  function toggleMenu() {
    menuOpen = !menuOpen
  }

  function closeMenu() {
    menuOpen = false
  }

  async function logout() {
    await fetch('/api/auth/sign-out', { method: 'POST' })
    await invalidateAll()
    goto('/login')
  }
</script>

{#if data.user}
  <div class="app-shell">
    <nav class="navbar">
      <div class="navbar-inner">
        <!-- Logo -->
        <a href="/" class="logo" onclick={closeMenu}>stoqr</a>

        <!-- Desktop nav links -->
        <ul class="nav-links" role="list">
          {#each navLinks as link}
            <li>
              <a
                href={link.href}
                class="nav-link"
                class:active={isActive(link.href)}
              >
                {link.label}
              </a>
            </li>
          {/each}
        </ul>

        <!-- Right side: user + theme toggle + logout -->
        <div class="nav-right">
          <span class="username">{data.user.name || data.user.email}</span>
          <button
            class="btn-theme"
            class:btn-theme--dark={darkMode}
            onclick={toggleDarkMode}
            type="button"
            title={darkMode ? 'Light Mode' : 'Dark Mode'}
            aria-label={darkMode ? 'Light Mode aktivieren' : 'Dark Mode aktivieren'}
          >
            {#if darkMode}🌙{:else}☀️{/if}
          </button>
          <button class="btn-logout" onclick={logout} type="button">
            Abmelden
          </button>
        </div>

        <!-- Hamburger (mobile only) -->
        <button
          class="hamburger"
          onclick={toggleMenu}
          aria-label="Menü öffnen"
          aria-expanded={menuOpen}
          type="button"
        >
          {#if menuOpen}
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M4 4L16 16M16 4L4 16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
          {:else}
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
          {/if}
        </button>
      </div>

      <!-- Mobile menu -->
      {#if menuOpen}
        <div class="mobile-menu" role="navigation" aria-label="Mobile Navigation">
          <ul role="list">
            {#each navLinks as link}
              <li>
                <a
                  href={link.href}
                  class="mobile-nav-link"
                  class:active={isActive(link.href)}
                  onclick={closeMenu}
                >
                  {link.label}
                </a>
              </li>
            {/each}
          </ul>
          <div class="mobile-user">
            <span class="username">{data.user.name || data.user.email}</span>
            <button class="btn-logout" onclick={logout} type="button">
              Abmelden
            </button>
          </div>
        </div>
      {/if}
    </nav>

    <main class="main-content">
      {@render children()}
    </main>
  </div>
{:else}
  {@render children()}
{/if}

<Toast />

<style>
  .app-shell {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    background-color: var(--color-base);
  }

  /* ── Navbar ─────────────────────────────────────── */

  .navbar {
    position: sticky;
    top: 0;
    z-index: var(--z-sticky);
    height: 56px;
    background-color: var(--color-surface-raised);
    border-bottom: 1px solid var(--color-border);
    box-shadow: var(--shadow-sm);
  }

  .navbar-inner {
    display: flex;
    align-items: center;
    height: 56px;
    max-width: 1280px;
    margin: 0 auto;
    padding: 0 var(--space-6);
    gap: var(--space-6);
  }

  /* ── Logo ───────────────────────────────────────── */

  .logo {
    font-family: var(--font-display);
    font-size: var(--text-lg);
    font-weight: 700;
    color: var(--color-accent);
    text-decoration: none;
    letter-spacing: -0.02em;
    flex-shrink: 0;
    transition: color var(--transition-fast);
  }

  .logo:hover {
    color: var(--color-primary);
  }

  /* ── Desktop nav links ──────────────────────────── */

  .nav-links {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    list-style: none;
    margin: 0;
    padding: 0;
    flex: 1;
  }

  .nav-link {
    display: inline-flex;
    align-items: center;
    height: 32px;
    padding: 0 var(--space-3);
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--color-text-secondary);
    text-decoration: none;
    transition: color var(--transition-fast), background-color var(--transition-fast);
    white-space: nowrap;
  }

  .nav-link:hover {
    color: var(--color-text-primary);
    background-color: var(--color-surface-sunken);
  }

  .nav-link.active {
    color: var(--color-primary);
    background-color: var(--color-primary-subtle);
    font-weight: 600;
  }

  /* ── Right side ─────────────────────────────────── */

  .nav-right {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    flex-shrink: 0;
    margin-left: auto;
  }

  .username {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    max-width: 160px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }


  .btn-theme {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 32px;
    width: 36px;
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
    background: var(--color-surface);
    cursor: pointer;
    font-size: 1rem;
    transition: background var(--transition-base), border-color var(--transition-base), box-shadow var(--transition-base);
  }

  .btn-theme:hover {
    border-color: var(--color-border-strong);
    background: var(--color-surface-sunken);
  }

  /* Dark mode button — bläulich-lila */
  .btn-theme--dark {
    background: linear-gradient(135deg, #2d2060 0%, #1a1040 100%);
    border-color: #6040b0;
    box-shadow: 0 0 8px rgba(100, 60, 200, 0.25);
  }

  .btn-theme--dark:hover {
    background: linear-gradient(135deg, #3d2880 0%, #221560 100%);
    border-color: #7050c0;
  }

  .btn-logout {
    display: inline-flex;
    align-items: center;
    height: 32px;
    padding: 0 var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
    background-color: transparent;
    color: var(--color-text-secondary);
    font-family: var(--font-body);
    font-size: var(--text-sm);
    font-weight: 500;
    cursor: pointer;
    transition: color var(--transition-fast), border-color var(--transition-fast), background-color var(--transition-fast);
    white-space: nowrap;
  }

  .btn-logout:hover {
    color: var(--color-danger);
    border-color: var(--color-danger);
    background-color: var(--color-danger-subtle);
  }

  /* ── Hamburger ──────────────────────────────────── */

  .hamburger {
    display: none;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: var(--radius-md);
    border: none;
    background-color: transparent;
    color: var(--color-text-secondary);
    cursor: pointer;
    flex-shrink: 0;
    margin-left: auto;
    transition: color var(--transition-fast), background-color var(--transition-fast);
  }

  .hamburger:hover {
    color: var(--color-text-primary);
    background-color: var(--color-surface-sunken);
  }

  /* ── Mobile menu ────────────────────────────────── */

  .mobile-menu {
    background-color: var(--color-surface-raised);
    border-top: 1px solid var(--color-border-subtle);
    padding: var(--space-3) var(--space-4) var(--space-4);
  }

  .mobile-menu ul {
    list-style: none;
    margin: 0 0 var(--space-3);
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .mobile-nav-link {
    display: flex;
    align-items: center;
    height: 40px;
    padding: 0 var(--space-3);
    border-radius: var(--radius-md);
    font-size: var(--text-base);
    font-weight: 500;
    color: var(--color-text-secondary);
    text-decoration: none;
    transition: color var(--transition-fast), background-color var(--transition-fast);
  }

  .mobile-nav-link:hover {
    color: var(--color-text-primary);
    background-color: var(--color-surface-sunken);
  }

  .mobile-nav-link.active {
    color: var(--color-primary);
    background-color: var(--color-primary-subtle);
    font-weight: 600;
  }

  .mobile-user {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: var(--space-3);
    border-top: 1px solid var(--color-border-subtle);
  }

  /* ── Main content ───────────────────────────────── */

  .main-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  /* ── Responsive breakpoint ──────────────────────── */

  @media (max-width: 680px) {
    .navbar {
      height: auto;
    }

    .navbar-inner {
      height: 56px;
    }

    .nav-links,
    .nav-right {
      display: none;
    }

    .hamburger {
      display: flex;
    }
  }
</style>

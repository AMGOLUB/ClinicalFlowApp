/* ═══════════════════════════════════════════════════════════════
   CLINICALFLOW WEBSITE — main.js
   Nav scroll effect, scroll-reveal animations, mobile menu,
   platform-aware download, smooth interactions
   ═══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ═══════════════════════════════════════
     0. THEME — Dark / Light mode
     ═══════════════════════════════════════ */
  const THEME_KEY = 'cf-theme';

  // Apply saved theme immediately (before paint) — also set in <head> inline script
  function getPreferredTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved) return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function applyTheme(theme, animate) {
    if (animate) {
      document.documentElement.setAttribute('data-theme-transition', '');
      requestAnimationFrame(() => {
        document.documentElement.setAttribute('data-theme', theme);
        setTimeout(() => {
          document.documentElement.removeAttribute('data-theme-transition');
        }, 550);
      });
    } else {
      document.documentElement.setAttribute('data-theme', theme);
    }
    localStorage.setItem(THEME_KEY, theme);
  }

  // Apply immediately
  const currentTheme = getPreferredTheme();
  if (currentTheme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  }

  // Inject toggle button into nav
  function injectThemeToggle() {
    const navInner = document.querySelector('.nav-inner');
    if (!navInner) return;

    // Insert before mobile toggle or at end
    const mobileToggle = navInner.querySelector('.nav-mobile-toggle');
    const btn = document.createElement('button');
    btn.className = 'theme-toggle';
    btn.setAttribute('aria-label', 'Toggle dark mode');
    btn.setAttribute('title', 'Toggle dark mode');
    btn.innerHTML = ''
      + '<div class="theme-toggle-track">'
      +   '<div class="theme-toggle-stars">'
      +     '<span class="theme-toggle-star"></span>'
      +     '<span class="theme-toggle-star"></span>'
      +     '<span class="theme-toggle-star"></span>'
      +     '<span class="theme-toggle-star"></span>'
      +   '</div>'
      + '</div>'
      + '<div class="theme-toggle-orb">'
      +   '<span class="theme-toggle-crater"></span>'
      +   '<span class="theme-toggle-crater"></span>'
      +   '<span class="theme-toggle-crater"></span>'
      +   '<div class="theme-toggle-rays">'
      +     '<span class="theme-toggle-ray"></span>'
      +     '<span class="theme-toggle-ray"></span>'
      +     '<span class="theme-toggle-ray"></span>'
      +     '<span class="theme-toggle-ray"></span>'
      +     '<span class="theme-toggle-ray"></span>'
      +     '<span class="theme-toggle-ray"></span>'
      +     '<span class="theme-toggle-ray"></span>'
      +     '<span class="theme-toggle-ray"></span>'
      +   '</div>'
      + '</div>';

    if (mobileToggle) navInner.insertBefore(btn, mobileToggle);
    else navInner.appendChild(btn);

    // Flash overlay element
    const flash = document.createElement('div');
    flash.className = 'theme-flash';
    document.body.appendChild(flash);

    btn.addEventListener('click', (e) => {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      const newTheme = isDark ? 'light' : 'dark';

      // Position flash from button
      const rect = btn.getBoundingClientRect();
      flash.style.setProperty('--flash-x', rect.left + rect.width / 2 + 'px');
      flash.style.setProperty('--flash-y', rect.top + rect.height / 2 + 'px');
      flash.classList.remove('active');
      void flash.offsetWidth;
      flash.classList.add('active');

      applyTheme(newTheme, true);
    });
  }

  injectThemeToggle();

  // Respect system preference changes
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (!localStorage.getItem(THEME_KEY)) {
      applyTheme(e.matches ? 'dark' : 'light', true);
    }
  });


  /* ─── DOM REFS ─── */
  const nav = document.getElementById('nav');
  const navToggle = document.getElementById('navToggle');
  const navLinks = document.getElementById('navLinks');


  /* ═══════════════════════════════════════
     1. NAV — Glass blur on scroll
     ═══════════════════════════════════════ */
  let lastScroll = 0;
  let navScrolled = false;

  function handleNavScroll() {
    const y = window.scrollY;
    if (y > 40 && !navScrolled) {
      nav.classList.add('scrolled');
      navScrolled = true;
    } else if (y <= 40 && navScrolled) {
      nav.classList.remove('scrolled');
      navScrolled = false;
    }
    lastScroll = y;
  }

  window.addEventListener('scroll', handleNavScroll, { passive: true });
  handleNavScroll(); // run on load in case page is already scrolled


  /* ═══════════════════════════════════════
     2. MOBILE MENU
     ═══════════════════════════════════════ */
  let menuOpen = false;
  let backdrop = null;

  if (navToggle && navLinks) {
    // Replace SVG with animated bars
    navToggle.innerHTML = `
      <span class="hamburger-bar"></span>
      <span class="hamburger-bar"></span>
      <span class="hamburger-bar"></span>`;

    // Create backdrop overlay
    backdrop = document.createElement('div');
    backdrop.className = 'nav-mobile-backdrop';
    document.body.appendChild(backdrop);

    // Inject mobile CTA buttons into the menu (Log In + Sign Up only)
    const navCta = document.querySelector('.nav-cta');
    if (navCta && !navLinks.querySelector('.nav-mobile-cta')) {
      const mobileCta = document.createElement('li');
      mobileCta.className = 'nav-mobile-cta';
      const links = navCta.querySelectorAll('a');
      links.forEach(a => {
        // Skip "Docs" link on mobile for compactness
        if (a.textContent.trim() === 'Docs') return;
        const clone = a.cloneNode(true);
        clone.classList.remove('btn--ghost', 'btn--sm');
        if (!a.classList.contains('btn--primary')) {
          clone.classList.add('btn--secondary');
        }
        mobileCta.appendChild(clone);
      });
      navLinks.appendChild(mobileCta);
    }

    function openMenu() {
      menuOpen = true;
      navLinks.classList.add('nav-links--open');
      navToggle.classList.add('open');
      navToggle.setAttribute('aria-expanded', 'true');
      backdrop.classList.add('visible');
      document.body.style.overflow = 'hidden';
    }

    function closeMenu() {
      menuOpen = false;
      navLinks.classList.remove('nav-links--open');
      navToggle.classList.remove('open');
      navToggle.setAttribute('aria-expanded', 'false');
      backdrop.classList.remove('visible');
      document.body.style.overflow = '';
    }

    navToggle.addEventListener('click', () => {
      if (menuOpen) closeMenu();
      else openMenu();
    });

    // Close on backdrop tap
    backdrop.addEventListener('click', closeMenu);

    // Close menu when a link is clicked
    navLinks.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        if (menuOpen) closeMenu();
      });
    });

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && menuOpen) closeMenu();
    });
  }


  /* ═══════════════════════════════════════
     3. SCROLL-REVEAL ANIMATIONS
     ═══════════════════════════════════════ */
  const revealElements = document.querySelectorAll('.reveal');

  if ('IntersectionObserver' in window) {
    const revealObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          revealObserver.unobserve(entry.target); // only animate once
        }
      });
    }, {
      threshold: 0.12,
      rootMargin: '0px 0px -40px 0px'
    });

    revealElements.forEach(el => revealObserver.observe(el));
  } else {
    // Fallback: show everything immediately
    revealElements.forEach(el => el.classList.add('visible'));
  }


  /* ═══════════════════════════════════════
     4. SMOOTH SCROLL for anchor links
     ═══════════════════════════════════════ */
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      const targetId = this.getAttribute('href');
      if (targetId === '#') return;

      const target = document.querySelector(targetId);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });

        // Update URL without jumping
        history.pushState(null, null, targetId);
      }
    });
  });


  /* ═══════════════════════════════════════
     5. ACTIVE NAV LINK on scroll
     ═══════════════════════════════════════ */
  const sections = document.querySelectorAll('section[id]');
  const navLinkItems = document.querySelectorAll('.nav-links a');

  function updateActiveNav() {
    const scrollY = window.scrollY + 120;

    sections.forEach(section => {
      const top = section.offsetTop;
      const height = section.offsetHeight;
      const id = section.getAttribute('id');

      if (scrollY >= top && scrollY < top + height) {
        navLinkItems.forEach(link => {
          link.classList.remove('active');
          if (link.getAttribute('href') === '#' + id) {
            link.classList.add('active');
          }
        });
      }
    });
  }

  window.addEventListener('scroll', updateActiveNav, { passive: true });


  /* ═══════════════════════════════════════
     6. PLATFORM DETECTION for download
     ═══════════════════════════════════════ */
  function detectPlatform() {
    const ua = navigator.userAgent.toLowerCase();
    const platform = navigator.platform?.toLowerCase() || '';

    if (ua.includes('mac') || platform.includes('mac')) return 'macos';
    if (ua.includes('win') || platform.includes('win')) return 'windows';
    if (ua.includes('linux') || platform.includes('linux')) return 'linux';
    return 'unknown';
  }

  function highlightPlatformDownload() {
    const platform = detectPlatform();
    const cards = document.querySelectorAll('.download-card');

    cards.forEach(card => {
      const h4 = card.querySelector('h4');
      if (!h4) return;

      const label = h4.textContent.toLowerCase();
      if (
        (platform === 'macos' && label.includes('macos')) ||
        (platform === 'windows' && label.includes('windows')) ||
        (platform === 'linux' && label.includes('linux'))
      ) {
        card.style.borderColor = 'var(--accent)';
        card.style.boxShadow = 'var(--shadow-lg), var(--shadow-glow)';

        // Add "Detected" badge
        const badge = document.createElement('div');
        badge.className = 'mode-badge';
        badge.textContent = '✓ Your platform';
        badge.style.marginBottom = '12px';
        card.insertBefore(badge, card.firstChild);
      }
    });
  }

  highlightPlatformDownload();


  /* ═══════════════════════════════════════
     7. HERO DOWNLOAD BUTTON — platform-aware
     ═══════════════════════════════════════ */
  function updateHeroDownloadButton() {
    const platform = detectPlatform();
    const heroBtn = document.querySelector('.hero .btn--primary');
    if (!heroBtn) return;

    const labels = {
      macos: 'Download for macOS',
      windows: 'Download for Windows',
      linux: 'Download for Linux',
      unknown: 'Download for Free'
    };

    // Keep the SVG icon, just update the text
    const svg = heroBtn.querySelector('svg');
    if (svg) {
      heroBtn.textContent = '';
      heroBtn.appendChild(svg);
      heroBtn.appendChild(document.createTextNode(' ' + labels[platform]));
    }
  }

  updateHeroDownloadButton();


  /* ═══════════════════════════════════════
     8. STAT NUMBER ANIMATION (count up)
     ═══════════════════════════════════════ */
  function animateStatNumbers() {
    const stats = document.querySelectorAll('.problem-stat-number');

    if (!('IntersectionObserver' in window)) return;

    const statObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const el = entry.target;
          const text = el.textContent.trim();

          // Only animate pure numbers or percentages
          const match = text.match(/^(\d+)(\+?)(%?)\s*(.*)/);
          if (match) {
            const target = parseInt(match[1], 10);
            const plus = match[2];
            const pct = match[3];
            const suffix = match[4];

            // Don't re-animate
            if (el.dataset.animated) return;
            el.dataset.animated = 'true';

            let start = 0;
            const duration = 1200;
            const startTime = performance.now();

            function step(now) {
              const elapsed = now - startTime;
              const progress = Math.min(elapsed / duration, 1);
              // Ease out cubic
              const eased = 1 - Math.pow(1 - progress, 3);
              const current = Math.round(eased * target);

              // Preserve the gradient class by setting textContent
              el.textContent = current + plus + pct + (suffix ? ' ' + suffix : '');

              if (progress < 1) {
                requestAnimationFrame(step);
              }
            }

            el.textContent = '0' + plus + pct + (suffix ? ' ' + suffix : '');
            requestAnimationFrame(step);
          }

          statObserver.unobserve(el);
        }
      });
    }, { threshold: 0.5 });

    stats.forEach(stat => statObserver.observe(stat));
  }

  animateStatNumbers();


  /* ═══════════════════════════════════════
     9. KEYBOARD NAVIGATION SUPPORT
     ═══════════════════════════════════════ */
  // Show focus outlines only on keyboard navigation
  document.body.addEventListener('mousedown', () => {
    document.body.classList.add('using-mouse');
  });
  document.body.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      document.body.classList.remove('using-mouse');
    }
  });


  /* ═══════════════════════════════════════
     10. YEAR AUTO-UPDATE in footer
     ═══════════════════════════════════════ */
  const yearSpan = document.querySelector('.footer-bottom span');
  if (yearSpan) {
    const year = new Date().getFullYear();
    yearSpan.textContent = yearSpan.textContent.replace(/\d{4}/, year);
  }

})();

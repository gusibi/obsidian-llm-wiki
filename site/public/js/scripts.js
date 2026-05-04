/* ============================================================
   LLM Wiki — Shared Scripts
   ============================================================ */

(function () {
  'use strict';

  // ---- Theme Toggle ----
  const themeToggle = document.getElementById('themeToggle');
  const html = document.documentElement;

  function getPreferredTheme() {
    const stored = localStorage.getItem('llmwiki-theme');
    if (stored) return stored;
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }

  function applyTheme(theme) {
    html.setAttribute('data-theme', theme);
    if (themeToggle) {
      themeToggle.innerHTML = theme === 'dark' ? '&#9788;' : '&#9790;';
      themeToggle.setAttribute('aria-label', 'Toggle ' + (theme === 'dark' ? 'light' : 'dark') + ' theme');
    }
    localStorage.setItem('llmwiki-theme', theme);
  }

  applyTheme(getPreferredTheme());

  if (themeToggle) {
    themeToggle.addEventListener('click', function () {
      const current = html.getAttribute('data-theme');
      applyTheme(current === 'dark' ? 'light' : 'dark');
    });
  }

  // Watch for OS theme changes
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', function (e) {
    if (!localStorage.getItem('llmwiki-theme')) {
      applyTheme(e.matches ? 'light' : 'dark');
    }
  });

  // ---- Mobile Navigation ----
  const navToggle = document.getElementById('navToggle');
  const navLinks = document.getElementById('navLinks');

  if (navToggle && navLinks) {
    navToggle.addEventListener('click', function () {
      const isOpen = navLinks.classList.toggle('open');
      navToggle.setAttribute('aria-expanded', isOpen);
    });

    // Close on link click
    navLinks.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        navLinks.classList.remove('open');
        navToggle.setAttribute('aria-expanded', 'false');
      });
    });

    // Close on Escape
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && navLinks.classList.contains('open')) {
        navLinks.classList.remove('open');
        navToggle.setAttribute('aria-expanded', 'false');
        navToggle.focus();
      }
    });
  }

  // ---- Nav Scroll Effect ----
  var nav = document.getElementById('nav');
  if (nav) {
    var scrollTimeout;
    window.addEventListener('scroll', function () {
      if (scrollTimeout) cancelAnimationFrame(scrollTimeout);
      scrollTimeout = requestAnimationFrame(function () {
        nav.classList.toggle('nav--scrolled', window.scrollY > 10);
      });
    }, { passive: true });
  }

  // ---- Scroll-triggered Animations ----
  var observerOptions = { threshold: 0.1, rootMargin: '0px 0px -40px 0px' };

  var animationObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.style.animationPlayState = 'running';
        animationObserver.unobserve(entry.target);
      }
    });
  }, observerOptions);

  document.querySelectorAll('.animate-in').forEach(function (el) {
    el.style.animationPlayState = 'paused';
    animationObserver.observe(el);
  });

})();

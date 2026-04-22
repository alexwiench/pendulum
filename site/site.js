// Scroll reveal + docs nav active state
(function () {
  // Only enable the fade-in animation if IO is supported AND we can actually animate.
  // Elements stay visible by default (see CSS) — this is pure progressive enhancement.
  if ('IntersectionObserver' in window) {
    document.documentElement.classList.add('js-reveal');
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
    document.querySelectorAll('.reveal').forEach(el => io.observe(el));
    // Safety: reveal anything in viewport after a short delay.
    setTimeout(() => {
      document.querySelectorAll('.reveal:not(.in)').forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.top < window.innerHeight && r.bottom > 0) el.classList.add('in');
      });
    }, 300);
    // Fallback: reveal everything once window loads, no matter what
    window.addEventListener('load', () => {
      setTimeout(() => {
        document.querySelectorAll('.reveal:not(.in)').forEach(el => el.classList.add('in'));
      }, 1500);
    });
  }

  // Docs nav active on scroll
  const navLinks = document.querySelectorAll('.docs-nav a[href^="#"]');
  const targets = Array.from(navLinks).map(a => {
    const id = a.getAttribute('href').slice(1);
    return { link: a, el: document.getElementById(id) };
  }).filter(x => x.el);

  function onScroll() {
    const y = window.scrollY + 120;
    let current = targets[0];
    for (const t of targets) {
      if (t.el.offsetTop <= y) current = t;
    }
    navLinks.forEach(l => l.classList.remove('active'));
    if (current) current.link.classList.add('active');
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Smooth anchor scrolling
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href').slice(1);
      const el = document.getElementById(id);
      if (!el) return;
      e.preventDefault();
      window.scrollTo({ top: el.offsetTop - 70, behavior: 'smooth' });
    });
  });


})();

/* animations.js — GSAP motion design for the blendxr one-pager.
   Respects prefers-reduced-motion (no animations, no marquee, no parallax).
   Splits desktop vs. mobile via gsap.matchMedia for performance + ergonomics. */

(() => {
  if (typeof gsap === 'undefined') return;
  const hasST = typeof ScrollTrigger !== 'undefined';
  if (hasST) gsap.registerPlugin(ScrollTrigger);

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Reduced-motion path: instant reveal, no scroll triggers, no marquee.
  if (reduce) {
    gsap.set(
      '.brand, .topnav__links a, .topnav__login, .topnav .btn--primary, ' +
      '.hero__title, .hero__sub, .hero__cta, .hero__stage',
      { opacity: 1, clearProps: 'transform' }
    );
    return;
  }

  // The inline <style> in index.html sets opacity:0 on above-fold targets so
  // they don't flash before GSAP runs. We clear that here so gsap.from()'s
  // captured "natural" state is visible (opacity:1), not still-hidden.
  gsap.set(
    '.brand, .topnav__links a, .topnav__login, .topnav .btn--primary, ' +
    '.hero__title, .hero__sub, .hero__cta, .hero__photos img, .hero__cutout',
    { opacity: 1 }
  );

  // Split the hero title into per-word spans so the timeline can stagger them
  // out from behind a mask. We only ever do this once — the dataset guard
  // prevents a second run from re-wrapping already-wrapped spans (which would
  // duplicate the markup and break the layout).
  const titleEl = document.querySelector('.hero__title');
  if (titleEl && !titleEl.dataset.split) {
    const words = titleEl.textContent.trim().split(/\s+/);
    titleEl.innerHTML = words
      .map((w) => `<span class="word"><span class="word__inner">${w}</span></span>`)
      .join(' ');
    titleEl.dataset.split = '1';
  }

  // ─── HERO INTRO ────────────────────────────────────────────────────
  // One coordinated timeline so nav + headline + CTA + showcase land together.
  const heroTl = gsap.timeline({
    defaults: { ease: 'power3.out', duration: 0.9 },
  });

  heroTl
    .from('.brand', { opacity: 0, y: -8, duration: 0.6 }, 0)
    .from('.topnav__links a', { opacity: 0, y: -6, stagger: 0.05, duration: 0.5 }, 0.1)
    .from('.topnav__login', { opacity: 0, duration: 0.5 }, 0.3)
    .from('.topnav .btn--primary', { opacity: 0, x: 8, duration: 0.5 }, 0.3)
    // Words rise from behind the mask. yPercent (not y) keeps the offset
    // proportional to font-size so the effect holds at every clamp() value.
    .from('.hero__title .word__inner', {
      yPercent: 110,
      opacity: 0,
      stagger: 0.07,
      duration: 0.9,
      ease: 'expo.out',
    }, 0.25)
    .from('.hero__sub', { opacity: 0, y: 18, duration: 0.7 }, 0.7)
    .from('.hero__cta .btn', { opacity: 0, y: 18, stagger: 0.08, duration: 0.7 }, 0.8)
    // Photo grid cells cascade in around where the headset cutout will sit.
    // 'center' stagger from a 2-row × 5-col grid: middle cells animate first,
    // edges last — feels like the lenses are being assembled around the text.
    .from('.hero__photos img', {
      opacity: 0,
      scale: 0.88,
      stagger: { each: 0.06, from: 'center', grid: [2, 5] },
      duration: 0.7,
      ease: 'power2.out',
      transformOrigin: '50% 50%',
    }, 0.5)
    // Cutout pops in once the photos are landing so the headset silhouette
    // crisply reveals the text window — title's word-mask is already mid-rise.
    // Just opacity here — scale is owned by the scroll-scrub blackout below.
    .from('.hero__cutout', { opacity: 0, duration: 0.6, ease: 'power2.out' }, 0.7);

  // Strata "breathing" — slow yo-yo rotation behind the showcase.
  gsap.to('.hero__stage .strata', {
    rotation: 6,
    yoyo: true,
    repeat: -1,
    duration: 14,
    ease: 'sine.inOut',
    transformOrigin: '50% 50%',
  });

  // ─── HERO CUTOUT BLACKOUT ZOOM ────────────────────────────────────
  // As the user scrolls past the hero, the canvas-coloured goggle
  // silhouette scales up massively (1 → 22) — its bridge dip and outline
  // both leave the viewport, leaving the screen filled with --color-canvas.
  // That solid black bleeds into the dark backgrounds of "Trusted industry
  // partners" + the Problem section below, so the next section appears
  // to fade up out of the blackout rather than scroll into view.
  if (hasST) {
    gsap.fromTo('.hero__cutout',
      { scale: 1, transformOrigin: '50% 50%' },
      {
        scale: 22,
        ease: 'none',
        scrollTrigger: {
          trigger: '.hero',
          start: 'top top',
          end: 'bottom top',
          scrub: 0.8,
        },
      }
    );
  }

  // ─── SCROLL REVEALS ────────────────────────────────────────────────
  if (hasST) {
    const reveal = (selector, opts = {}) => {
      const els = gsap.utils.toArray(selector);
      if (!els.length) return;
      const trigger = opts.trigger || els[0];
      gsap.from(els, {
        opacity: 0,
        y: opts.y !== undefined ? opts.y : 32,
        x: opts.x || 0,
        stagger: opts.stagger || 0.08,
        duration: opts.duration || 0.8,
        ease: 'power3.out',
        scrollTrigger: {
          trigger,
          start: opts.start || 'top 86%',
          once: true,
        },
      });
    };

    reveal('.logos > *', { trigger: '.logos', stagger: 0.08 });

    reveal('#solution .sec-head__text > *', { stagger: 0.1 });
    reveal('.prob-card', { stagger: 0.15, y: 44 });

    // After each prob-card lands, slide its pain items in from the left so the
    // list feels like it's being filled in, not just appearing.
    gsap.utils.toArray('.prob-card').forEach((card) => {
      ScrollTrigger.create({
        trigger: card,
        start: 'top 75%',
        once: true,
        onEnter: () => {
          gsap.from(card.querySelectorAll('.pain'), {
            opacity: 0,
            x: -16,
            stagger: 0.1,
            duration: 0.55,
            ease: 'power2.out',
            delay: 0.35,
          });
        },
      });
    });

    reveal('#work .bio > div:first-child > *', { stagger: 0.08, y: 24 });
    reveal('.bio__photo', { trigger: '.bio', y: 0, x: 40, duration: 1.0, stagger: 0 });

    // Bio stats count-up — every .bio__stat .n animates from 0 to its target.
    // We capture the integer target once, then drive a proxy object so the DOM
    // text node is the only thing rewritten per tick (cheap, jank-free).
    gsap.utils.toArray('.bio__stat .n').forEach((el) => {
      const target = parseFloat(el.textContent);
      if (Number.isNaN(target)) return;
      const final = el.textContent;
      const isInt = !final.includes('.');
      el.textContent = '0';
      ScrollTrigger.create({
        trigger: el,
        start: 'top 85%',
        once: true,
        onEnter: () => {
          const proxy = { v: 0 };
          gsap.to(proxy, {
            v: target,
            duration: 1.6,
            ease: 'power2.out',
            onUpdate: () => {
              el.textContent = isInt
                ? Math.round(proxy.v).toString()
                : proxy.v.toFixed(1);
            },
            onComplete: () => { el.textContent = final; },
          });
        },
      });
    });

    reveal(
      '.band-light:first-of-type .tag, .band-light:first-of-type h2',
      { trigger: '.cmp-grid', stagger: 0.1 }
    );
    reveal('.cmp-card', { stagger: 0.14 });

    // Check / cross icons pop in after the comparison card lands.
    gsap.utils.toArray('.cmp-card').forEach((card) => {
      ScrollTrigger.create({
        trigger: card,
        start: 'top 75%',
        once: true,
        onEnter: () => {
          gsap.from(card.querySelectorAll('.cmprow__i'), {
            scale: 0,
            opacity: 0,
            stagger: 0.08,
            duration: 0.5,
            ease: 'back.out(2)',
            delay: 0.35,
            transformOrigin: '50% 50%',
          });
        },
      });
    });

    reveal('#reviews .sec-head__text > *', { stagger: 0.1 });

    reveal('.gaps__intro > *', { stagger: 0.08 });
    reveal('.gapcard', { stagger: 0.12, x: 24, y: 16 });

    reveal('.booking > .tag, .booking > h2, .booking__sub', { stagger: 0.08 });
    reveal('.cal', { y: 60, duration: 1.0, stagger: 0 });

    // The 30 calendar cells are appended by index.html's inline calendar
    // script BEFORE animations.js runs, so they exist by the time we look.
    // back.out gives them a tactile pop without dragging the timeline.
    ScrollTrigger.create({
      trigger: '.cal',
      start: 'top 78%',
      once: true,
      onEnter: () => {
        gsap.from('.cal__day', {
          opacity: 0,
          scale: 0.7,
          stagger: { each: 0.015 },
          duration: 0.45,
          ease: 'back.out(1.6)',
          delay: 0.4,
          transformOrigin: '50% 50%',
        });
      },
    });

    reveal('#faq .tag, #faq h2', { stagger: 0.1 });
    reveal('.faq-item', { stagger: 0.05, y: 16, duration: 0.6 });

    reveal('.foot__row > *', { trigger: '.foot', stagger: 0.06, y: 12 });

    // Footer mark spins in as a small flourish — matches the strata motif's
    // recurring rotation throughout the page.
    ScrollTrigger.create({
      trigger: '.foot__mark',
      start: 'top 95%',
      once: true,
      onEnter: () => {
        gsap.from('.foot__mark', {
          rotation: -60,
          scale: 0.5,
          opacity: 0,
          duration: 1.0,
          ease: 'back.out(1.7)',
          transformOrigin: '50% 50%',
        });
      },
    });
  }

  // ─── REVIEW MARQUEE ────────────────────────────────────────────────
  // Auto-scrolling testimonial track so every card is seen on every viewport.
  // Slows on hover/touch so users can read.
  const track = document.getElementById('reviewTrack');
  if (track) {
    Array.from(track.children).forEach((card) => {
      const clone = card.cloneNode(true);
      clone.setAttribute('aria-hidden', 'true');
      track.appendChild(clone);
    });
    const marquee = gsap.to(track, {
      xPercent: -50,
      duration: 60,
      ease: 'none',
      repeat: -1,
    });
    const slow = () => marquee.timeScale(0.15);
    const fast = () => marquee.timeScale(1);
    track.addEventListener('mouseenter', slow);
    track.addEventListener('mouseleave', fast);
    track.addEventListener('touchstart', slow, { passive: true });
    track.addEventListener('touchend', fast, { passive: true });
  }

  // ─── DESKTOP-ONLY ENHANCEMENTS ─────────────────────────────────────
  // Parallax + hover lift / scale only fire on viewports that have the room
  // and the pointing device for them.
  if (hasST) {
    const mm = gsap.matchMedia();

    mm.add('(min-width: 768px) and (prefers-reduced-motion: no-preference)', () => {
      // Hero photo grid scrolls slightly upward as the section exits.
      // Targets the photos container (not individual imgs) so we don't run
      // 10 parallel parallax tweens.
      gsap.to('.hero__photos', {
        yPercent: -6,
        ease: 'none',
        scrollTrigger: {
          trigger: '.hero',
          start: 'top top',
          end: 'bottom top',
          scrub: 0.6,
        },
      });

      // Studio photo slow parallax inside the bio section.
      gsap.to('.bio__photo', {
        yPercent: -8,
        ease: 'none',
        scrollTrigger: {
          trigger: '.bio',
          start: 'top bottom',
          end: 'bottom top',
          scrub: true,
        },
      });

      // Reviews disc rotates + drifts as the section passes.
      gsap.to('.reviews__bg', {
        rotation: 30,
        yPercent: -12,
        ease: 'none',
        scrollTrigger: {
          trigger: '.reviews',
          start: 'top bottom',
          end: 'bottom top',
          scrub: true,
        },
      });

      // Card hover lift.
      const lift = document.querySelectorAll(
        '.prob-card, .cmp-card, .gapcard, .faq-item'
      );
      lift.forEach((card) => {
        const enter = () => gsap.to(card, { y: -4, duration: 0.28, ease: 'power2.out' });
        const leave = () => gsap.to(card, { y: 0, duration: 0.28, ease: 'power2.out' });
        card.addEventListener('mouseenter', enter);
        card.addEventListener('mouseleave', leave);
      });

      // Button micro-scale on hover.
      document.querySelectorAll('.btn').forEach((btn) => {
        const enter = () => gsap.to(btn, { scale: 1.03, duration: 0.18, ease: 'power2.out' });
        const leave = () => gsap.to(btn, { scale: 1, duration: 0.18, ease: 'power2.out' });
        btn.addEventListener('mouseenter', enter);
        btn.addEventListener('mouseleave', leave);
      });

      // 3D tilt on the hero showcase + studio photo. Mouse position drives a
      // ±max-degree rotateX/Y, eased to feel like the surface is being pushed
      // around rather than snapping. transformPerspective on the element so we
      // don't need a 3D-rendered ancestor.
      const tilt = (el, max = 7) => {
        if (!el) return;
        const onMove = (e) => {
          const r = el.getBoundingClientRect();
          const xPct = (e.clientX - r.left) / r.width - 0.5;
          const yPct = (e.clientY - r.top) / r.height - 0.5;
          gsap.to(el, {
            rotationY: xPct * max,
            rotationX: -yPct * max,
            transformPerspective: 900,
            transformOrigin: '50% 50%',
            duration: 0.4,
            ease: 'power2.out',
          });
        };
        const onLeave = () => {
          gsap.to(el, {
            rotationX: 0,
            rotationY: 0,
            duration: 0.7,
            ease: 'power2.out',
          });
        };
        el.addEventListener('mousemove', onMove);
        el.addEventListener('mouseleave', onLeave);
      };
      // .hero__shot is no longer in the DOM (replaced by the photo grid); we
      // tilt the bio photo only. Skipping the hero on purpose — tilting a
      // 10-image grid would feel chaotic, and the cutout sits on top anyway.
      tilt(document.querySelector('.bio__photo'), 5);

      // Magnetic primary CTAs — the button drifts a fraction of the cursor
      // offset toward the pointer. Elastic ease on release for a soft snap.
      const magnetic = (btn, strength = 0.3) => {
        const onMove = (e) => {
          const r = btn.getBoundingClientRect();
          const dx = (e.clientX - r.left - r.width / 2) * strength;
          const dy = (e.clientY - r.top - r.height / 2) * strength;
          gsap.to(btn, { x: dx, y: dy, duration: 0.4, ease: 'power2.out' });
        };
        const onLeave = () => {
          gsap.to(btn, { x: 0, y: 0, duration: 0.7, ease: 'elastic.out(1, 0.45)' });
        };
        btn.addEventListener('mousemove', onMove);
        btn.addEventListener('mouseleave', onLeave);
      };
      document.querySelectorAll('.hero__cta .btn--primary, #book .cal__confirm').forEach((b) => magnetic(b, 0.25));
    });

    // Nav hides on scroll-down past hero, returns on scroll-up. Runs on all
    // viewports — mobile gets the most benefit from the extra vertical space.
    const nav = document.getElementById('topnav');
    if (nav) {
      let lastScroll = 0;
      let hidden = false;
      ScrollTrigger.create({
        start: 0,
        end: 'max',
        onUpdate: () => {
          const y = window.scrollY;
          if (y < 80) {
            if (hidden) {
              gsap.to(nav, { yPercent: 0, duration: 0.3, ease: 'power2.out' });
              hidden = false;
            }
            lastScroll = y;
            return;
          }
          const delta = y - lastScroll;
          if (delta > 8 && !hidden) {
            gsap.to(nav, { yPercent: -100, duration: 0.3, ease: 'power2.out' });
            hidden = true;
          } else if (delta < -6 && hidden) {
            gsap.to(nav, { yPercent: 0, duration: 0.3, ease: 'power2.out' });
            hidden = false;
          }
          lastScroll = y;
        },
      });
    }
  }
})();

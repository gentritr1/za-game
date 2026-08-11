(() => {
  'use strict';

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let comparisonId = 0;
  document.documentElement.classList.add('stories-enhanced');

  function setCompareView(compare, view, announce = true) {
    const buttons = Array.from(compare.querySelectorAll('[data-story-view]'));
    const panels = Array.from(compare.querySelectorAll('[data-story-panel]'));
    const status = compare.querySelector('[data-view-status]');

    buttons.forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.storyView === view));
    });

    panels.forEach((panel) => {
      const active = panel.dataset.storyPanel === view;
      panel.hidden = !active;
      panel.classList.toggle('is-current', active);
    });

    if (announce && status) {
      const label = compare.dataset.label || 'comparison';
      status.textContent = `Showing ${view === 'before' ? 'then' : 'now'} for ${label}.`;
    }
  }

  function setArcadeReveal(compare, value, announce = false) {
    const reveal = Math.max(0, Math.min(100, Math.round(Number(value))));
    const range = compare.querySelector('[data-arcade-range]');
    const status = compare.querySelector('[data-view-status]');
    const caption = compare.querySelector('[data-arcade-caption]');
    const beforePanel = compare.querySelector('[data-story-panel="before"]');
    const nowPanel = compare.querySelector('[data-story-panel="now"]');
    const beam = compare.querySelector('.arcade-wipe__beam');
    const buttons = Array.from(compare.querySelectorAll('[data-story-view]'));

    nowPanel?.style.setProperty('--reveal', `${reveal}%`);
    beam?.style.setProperty('--reveal', `${reveal}%`);
    if (beforePanel) beforePanel.hidden = reveal === 100;
    if (nowPanel) nowPanel.hidden = reveal === 0;
    if (range) {
      const nextValue = String(reveal);
      const nextValueText = reveal === 0
        ? 'Then picture'
        : (reveal === 100 ? 'Now picture' : `${100 - reveal} percent then, ${reveal} percent now`);
      if (range.value !== nextValue) range.value = nextValue;
      if (range.getAttribute('aria-valuetext') !== nextValueText) {
        range.setAttribute('aria-valuetext', nextValueText);
      }
    }

    buttons.forEach((button) => {
      const pressed = (button.dataset.storyView === 'before' && reveal === 0)
        || (button.dataset.storyView === 'now' && reveal === 100);
      const nextPressed = String(pressed);
      if (button.getAttribute('aria-pressed') !== nextPressed) {
        button.setAttribute('aria-pressed', nextPressed);
      }
    });

    if (caption) {
      const nextCaption = reveal === 0
        ? compare.dataset.beforeCaption
        : (reveal === 100
          ? compare.dataset.nowCaption
          : `SPLIT VIEW — ${compare.dataset.beforeCaption} ${compare.dataset.nowCaption}`);
      if (caption.textContent !== nextCaption) caption.textContent = nextCaption;
    }

    if (announce && status) {
      const label = compare.dataset.label || 'comparison';
      status.textContent = reveal === 0
        ? `Showing then for ${label}.`
        : (reveal === 100
          ? `Showing now for ${label}.`
          : `Comparison split: ${100 - reveal} percent then and ${reveal} percent now.`);
    }
  }

  function initArcadeSlider(compare, initial) {
    const panels = Array.from(compare.querySelectorAll('[data-story-panel]'));
    const before = compare.querySelector('[data-story-panel="before"]');
    const now = compare.querySelector('[data-story-panel="now"]');
    const beforeImage = before?.querySelector('img');
    const nowImage = now?.querySelector('img');
    const buttons = Array.from(compare.querySelectorAll('[data-story-view]'));
    const toggle = compare.querySelector('.story-toggle');
    const stage = compare.querySelector('.story-panels');

    if (!before || !now || !beforeImage || !nowImage || buttons.length !== 2 || !toggle || !stage) {
      setCompareView(compare, initial, false);
      return;
    }

    panels.forEach((panel) => {
      panel.hidden = false;
      panel.classList.remove('is-current');
    });

    const beforeCaption = before.querySelector('figcaption');
    const nowCaption = now.querySelector('figcaption');
    compare.dataset.beforeCaption = beforeCaption?.textContent.trim() || 'Then';
    compare.dataset.nowCaption = nowCaption?.textContent.trim() || 'Now';
    compare.classList.add('is-photo-slider');

    const width = Number(beforeImage.getAttribute('width')) || 16;
    const height = Number(beforeImage.getAttribute('height')) || 9;
    compare.classList.toggle('is-photo-slider--portrait', height > width);
    stage.style.aspectRatio = `${width} / ${height}`;

    comparisonId += 1;
    const rangeId = `arcade-picture-slider-${comparisonId}`;
    const captionId = `${rangeId}-caption`;
    const rail = document.createElement('span');
    rail.className = 'arcade-slider__rail';

    const range = document.createElement('input');
    range.id = rangeId;
    range.className = 'arcade-slider__input';
    range.type = 'range';
    range.min = '0';
    range.max = '100';
    range.step = '1';
    range.dataset.arcadeRange = '';
    range.setAttribute('aria-label', `Reveal then and now for ${compare.dataset.label || 'this picture'}`);
    rail.append(range);
    toggle.insertBefore(rail, buttons[1]);
    toggle.classList.add('arcade-slider');

    const beam = document.createElement('span');
    beam.className = 'arcade-wipe__beam';
    beam.setAttribute('aria-hidden', 'true');
    stage.append(beam);

    const caption = document.createElement('p');
    caption.id = captionId;
    caption.className = 'arcade-slider__caption';
    caption.dataset.arcadeCaption = '';
    caption.setAttribute('aria-hidden', 'true');
    stage.insertAdjacentElement('afterend', caption);

    let frame = 0;
    let crtMagicPlayed = false;

    // A cabinet wipe must never outrun its picture. Photo pairs are small and
    // reused elsewhere on the page, so start both requests here and keep the
    // controls honestly unavailable until both endpoints can be painted. This
    // also covers a fast range drag on a deliberately slow mobile connection.
    const sliderImages = [beforeImage, nowImage];
    compare.setAttribute('aria-busy', 'true');
    range.disabled = true;
    buttons.forEach((button) => { button.disabled = true; });
    const imageReady = (image) => {
      image.loading = 'eager';
      if (image.complete) return Promise.resolve();
      return new Promise((resolve) => {
        image.addEventListener('load', resolve, { once: true });
        image.addEventListener('error', resolve, { once: true });
      });
    };
    let preparingImages = false;
    const prepareImages = () => {
      if (preparingImages) return;
      preparingImages = true;
      Promise.all(sliderImages.map(imageReady)).then(() => {
        range.disabled = false;
        buttons.forEach((button) => { button.disabled = false; });
        compare.removeAttribute('aria-busy');
      });
    };
    const story = compare.closest('.table-story');
    if (!story || story.open) {
      prepareImages();
    } else {
      story.addEventListener('toggle', () => {
        if (story.open) prepareImages();
      });
    }

    const stopGlide = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
    };

    const playCrtSettle = () => {
      if (crtMagicPlayed || prefersReducedMotion.matches) return;
      crtMagicPlayed = true;
      stage.classList.add('is-crt-settling');
      window.setTimeout(() => {
        stage.classList.remove('is-crt-settling');
      }, 220);
    };

    const glideTo = (target) => {
      stopGlide();
      const startValue = Number(range.value);
      if (prefersReducedMotion.matches || startValue === target) {
        setArcadeReveal(compare, target, true);
        playCrtSettle();
        return;
      }

      const startedAt = window.performance.now();
      const duration = 280;
      const tick = (nowTime) => {
        const progress = Math.min(1, (nowTime - startedAt) / duration);
        const eased = 1 - Math.pow(1 - progress, 3);
        const raw = startValue + ((target - startValue) * eased);
        const stepped = Math.round(raw / 4) * 4;
        setArcadeReveal(compare, progress === 1 ? target : stepped, false);
        if (progress < 1) {
          frame = window.requestAnimationFrame(tick);
        } else {
          frame = 0;
          setArcadeReveal(compare, target, true);
          playCrtSettle();
        }
      };
      frame = window.requestAnimationFrame(tick);
    };

    range.addEventListener('input', () => {
      stopGlide();
      setArcadeReveal(compare, range.value, false);
    });
    range.addEventListener('change', () => {
      setArcadeReveal(compare, range.value, true);
      playCrtSettle();
    });
    buttons.forEach((button) => {
      const target = button.dataset.storyView === 'before' ? 0 : 100;
      button.addEventListener('click', () => glideTo(target));
    });

    setArcadeReveal(compare, initial === 'before' ? 0 : 100, false);
  }

  document.querySelectorAll('[data-compare]').forEach((compare) => {
    compare.classList.add('is-enhanced');
    const initial = compare.dataset.defaultView === 'before' ? 'before' : 'now';
    if (compare.hasAttribute('data-photo-slider')) {
      initArcadeSlider(compare, initial);
    } else {
      setCompareView(compare, initial, false);
      compare.querySelectorAll('[data-story-view]').forEach((button) => {
        button.addEventListener('click', () => setCompareView(compare, button.dataset.storyView));
      });
    }
  });

  document.querySelectorAll('[data-za-demo]').forEach((demo) => {
    const call = demo.querySelector('[data-za-call]');
    const reset = demo.querySelector('[data-za-reset]');
    const status = demo.querySelector('[data-za-status]');

    if (!call || !reset || !status) {
      demo.hidden = true;
      return;
    }

    call.addEventListener('click', () => {
      demo.classList.add('is-called');
      call.hidden = true;
      reset.hidden = false;
      status.textContent = 'ZA called. The hand is safe and play can continue.';
      reset.focus();
    });

    reset.addEventListener('click', () => {
      demo.classList.remove('is-called');
      reset.hidden = true;
      call.hidden = false;
      status.textContent = 'ZA is ready. Call it before playing again.';
      call.focus();
    });
  });

  document.querySelectorAll('[data-bot-demo]').forEach((demo) => {
    const message = demo.querySelector('[data-bot-message]');
    const shout = demo.querySelector('[data-bot-shout]');
    const wait = demo.querySelector('[data-bot-wait]');
    const reset = demo.querySelector('[data-bot-reset]');
    let timer = 0;

    if (!message || !shout || !wait || !reset) {
      demo.hidden = true;
      return;
    }

    const finish = (text, className, moveFocus = true) => {
      window.clearTimeout(timer);
      demo.classList.remove('is-safe', 'is-caught');
      demo.classList.add(className);
      message.textContent = text;
      shout.hidden = true;
      wait.hidden = true;
      reset.hidden = false;
      if (moveFocus) reset.focus();
    };

    shout.addEventListener('click', () => {
      finish('SAFE — your shout cancelled the observer before the catch.', 'is-safe');
    });

    wait.addEventListener('click', () => {
      shout.disabled = true;
      wait.disabled = true;
      message.textContent = 'Carmela is taking a believable beat…';
      message.tabIndex = -1;
      message.focus();
      timer = window.setTimeout(() => {
        finish('GOTCHA — Carmela noticed after 1.2 seconds. One observer, not seven.', 'is-caught', false);
      }, prefersReducedMotion.matches ? 120 : 1200);
    });

    reset.addEventListener('click', () => {
      window.clearTimeout(timer);
      demo.classList.remove('is-safe', 'is-caught');
      message.textContent = 'Carmela might notice. You have a human-sized moment.';
      shout.hidden = false;
      wait.hidden = false;
      shout.disabled = false;
      wait.disabled = false;
      reset.hidden = true;
      message.removeAttribute('tabindex');
      shout.focus();
    });
  });

  document.querySelectorAll('[data-focus-tour]').forEach((tour) => {
    const stops = Array.from(tour.querySelectorAll('[data-focus-stop]'));
    const move = tour.querySelector('[data-focus-move]');
    const status = tour.querySelector('[data-focus-status]');
    let index = -1;

    if (!stops.length || !move || !status) {
      tour.hidden = true;
      return;
    }

    const placeChair = (nextIndex) => {
      index = nextIndex % stops.length;
      stops[index].focus();
      status.textContent = `Step ${index + 1} of ${stops.length}: ${stops[index].textContent.toLowerCase()} has the chair.`;
    };

    stops.forEach((stop, stopIndex) => {
      stop.addEventListener('focus', () => {
        index = stopIndex;
        status.textContent = `Step ${index + 1} of ${stops.length}: ${stop.textContent.toLowerCase()} has the chair.`;
      });
    });

    move.addEventListener('click', () => placeChair(index + 1));
  });

  const stories = Array.from(document.querySelectorAll('.table-story'));

  stories.forEach((story) => {
    story.addEventListener('toggle', () => {
      if (!story.open) return;
      stories.forEach((other) => {
        if (other !== story) other.open = false;
      });
    });
  });

  function openHashStory(hash = window.location.hash) {
    let target = null;
    if (hash.length <= 1) return;
    try {
      target = document.getElementById(decodeURIComponent(hash.slice(1)));
    } catch {
      target = null;
    }

    if (target instanceof HTMLDetailsElement) {
      stories.forEach((story) => { story.open = story === target; });
    }
  }

  document.querySelectorAll('.story-jumps a[href^="#"]').forEach((link) => {
    link.addEventListener('click', () => openHashStory(link.hash));
  });
  window.addEventListener('hashchange', () => openHashStory());
  openHashStory();

})();

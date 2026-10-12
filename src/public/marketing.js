(() => {
  const root = document.documentElement;
  const storageKey = "lebrands-theme";
  const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
  let savedTheme = null;
  try {
    savedTheme = window.localStorage.getItem(storageKey);
  } catch (_) {
    savedTheme = null;
  }
  const initialTheme = savedTheme === "light" || savedTheme === "dark"
    ? savedTheme
    : systemTheme.matches ? "dark" : "light";
  if (typeof root.setAttribute === "function") root.setAttribute("data-theme", initialTheme);
  const colorMeta = document.querySelector("[data-m-theme-color]");
  if (colorMeta) colorMeta.setAttribute("content", initialTheme === "dark" ? "#21191b" : "#ffffff");

  function installThemeToggle() {
    const buttons = [...document.querySelectorAll("[data-theme-toggle]")];
    const label = document.querySelector("[data-theme-label]");
    if (!buttons.length) return;
    let activeTheme = initialTheme;
    function paintTheme(theme) {
      activeTheme = theme;
      if (typeof root.setAttribute === "function") root.setAttribute("data-theme", theme);
      if (colorMeta) colorMeta.setAttribute("content", theme === "dark" ? "#21191b" : "#ffffff");
      const nextTheme = theme === "dark" ? "light" : "dark";
      for (const button of buttons) {
        button.setAttribute("aria-label", `Switch to ${nextTheme} mode`);
        button.setAttribute("aria-pressed", String(theme === "dark"));
      }
      if (label) label.textContent = nextTheme === "dark" ? "Dark" : "Light";
    }
    paintTheme(initialTheme);
    for (const button of buttons) {
      button.addEventListener("click", () => {
        const theme = activeTheme === "dark" ? "light" : "dark";
        paintTheme(theme);
        savedTheme = theme;
        try {
          window.localStorage.setItem(storageKey, theme);
        } catch (_) {
          // The current selection still applies when storage is unavailable.
        }
      });
    }
    const onSystemTheme = (event) => {
      if (savedTheme === "light" || savedTheme === "dark") return;
      paintTheme(event.matches ? "dark" : "light");
    };
    if (systemTheme.addEventListener) systemTheme.addEventListener("change", onSystemTheme);
    else if (systemTheme.addListener) systemTheme.addListener(onSystemTheme);
  }

  function initializeMarketing() {
    installThemeToggle();
  const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
  // Static exports and anyone preferring a motion-free page can opt out by URL.
  const motionDisabled = new URLSearchParams(window.location.search).get("motion") === "off";
  const revealItems = [...document.querySelectorAll(".m-reveal")];
  const sections = [...document.querySelectorAll("#top > section")];
  const videos = [...document.querySelectorAll(".m-wizard-media video")];
  const carousel = document.querySelector("[data-craft-carousel]");
  const carouselSlides = carousel ? [...carousel.querySelectorAll("[data-craft-slide]")] : [];
  const carouselSelectors = carousel ? [...carousel.querySelectorAll("[data-craft-select]")] : [];
  const carouselToggle = carousel ? carousel.querySelector("[data-craft-toggle]") : null;
  const carouselLive = carousel ? carousel.querySelector("[data-craft-live]") : null;
  const hero = document.querySelector(".m-hero");
  const laptop = document.querySelector(".m-device-laptop");
  const navBar = document.querySelector(".m-nav");
  let revealObserver;
  let videoObserver;
  let scrollQueued = false;
  let fallbackVideoMode = false;
  let carouselIndex = 0;
  let carouselInView = false;
  let carouselPausedByUser = false;
  let carouselTimer = null;
  let carouselHover = false;
  let carouselFocus = false;
  const carouselInterval = 5200;

  function paintCarousel(index, announce = true) {
    if (!carouselSlides.length) return;
    carouselIndex = (index + carouselSlides.length) % carouselSlides.length;
    carouselSlides.forEach((slide, position) => {
      const active = position === carouselIndex;
      slide.hidden = !active;
      slide.setAttribute("aria-hidden", String(!active));
      slide.classList.toggle("is-active", active);
    });
    carouselSelectors.forEach((button, position) => {
      const active = position === carouselIndex;
      button.setAttribute("aria-current", String(active));
      if (active) button.setAttribute("aria-pressed", "true");
      else button.setAttribute("aria-pressed", "false");
    });
    if (announce && carouselLive) {
      const slideName = carouselSlides[carouselIndex].getAttribute("aria-label") || "";
      carouselLive.textContent = slideName.replace(/^\d+ of \d+:\s*/, "") + `, ${carouselIndex + 1} of ${carouselSlides.length}`;
    }
  }

  function canAutoplayCarousel() {
    return Boolean(carouselSlides.length) && !motionPreference.matches && !motionDisabled &&
      !carouselPausedByUser && carouselInView && !document.hidden && !carouselHover && !carouselFocus;
  }

  function stopCarouselTimer() {
    if (carouselTimer !== null) window.clearTimeout(carouselTimer);
    carouselTimer = null;
  }

  function scheduleCarousel() {
    stopCarouselTimer();
    if (!canAutoplayCarousel()) return;
    carouselTimer = window.setTimeout(() => {
      carouselTimer = null;
      if (!canAutoplayCarousel()) return;
      paintCarousel(carouselIndex + 1);
      scheduleCarousel();
    }, carouselInterval);
  }

  function initializeCarousel() {
    if (!carousel || !carouselSlides.length || !carousel.querySelector) return;
    carousel.classList.add("is-enhanced");
    paintCarousel(0, false);
    const move = (index) => {
      paintCarousel(index);
      scheduleCarousel();
    };
    const previous = carousel.querySelector("[data-craft-prev]");
    const next = carousel.querySelector("[data-craft-next]");
    if (previous) previous.addEventListener("click", () => move(carouselIndex - 1));
    if (next) next.addEventListener("click", () => move(carouselIndex + 1));
    carouselSelectors.forEach((button) => {
      button.addEventListener("click", () => move(Number(button.dataset.craftSelect)));
    });
    if (carouselToggle) {
      carouselToggle.addEventListener("click", () => {
        carouselPausedByUser = !carouselPausedByUser;
        carouselToggle.setAttribute("aria-pressed", String(carouselPausedByUser));
        carouselToggle.textContent = carouselPausedByUser ? "Play" : "Pause";
        carouselToggle.setAttribute("aria-label", carouselPausedByUser ? "Play slideshow" : "Pause slideshow");
        scheduleCarousel();
      });
    }
    carousel.addEventListener("mouseenter", () => { carouselHover = true; scheduleCarousel(); });
    carousel.addEventListener("mouseleave", () => { carouselHover = false; scheduleCarousel(); });
    carousel.addEventListener("focusin", () => { carouselFocus = true; scheduleCarousel(); });
    carousel.addEventListener("focusout", (event) => {
      if (!carousel.contains(event.relatedTarget)) {
        carouselFocus = false;
        scheduleCarousel();
      }
    });
    carousel.addEventListener("keydown", (event) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === "ArrowLeft") { event.preventDefault(); move(carouselIndex - 1); }
      if (event.key === "ArrowRight") { event.preventDefault(); move(carouselIndex + 1); }
      if (event.key === "Home") { event.preventDefault(); move(0); }
      if (event.key === "End") { event.preventDefault(); move(carouselSlides.length - 1); }
    });
  }

  function initializeHeroStory() {
    const story = document.querySelector("[data-hero-story]");
    if (!story || !story.querySelectorAll) return;
    const slides = [...story.querySelectorAll("[data-hs-slide]")];
    const tabs = [...story.querySelectorAll("[data-hs-tab]")];
    const toggle = story.querySelector("[data-hs-toggle]");
    const live = story.querySelector("[data-hs-live]");
    const line = document.querySelector("[data-hero-line]");
    const heroEl = story.closest ? story.closest(".m-hero") || story : story;
    if (!slides.length) return;
    let current = 0;
    let paused = false;
    function show(i, announce = true) {
      current = (i + slides.length) % slides.length;
      slides.forEach((slide, n) => {
        slide.hidden = n !== current;
        slide.classList.toggle("is-active", n === current);
      });
      tabs.forEach((tab, n) => tab.setAttribute("aria-current", String(n === current)));
      const sentence = slides[current].getAttribute("data-hs-line");
      if (line && sentence && line.textContent !== sentence) line.textContent = sentence;
      if (announce && live) live.textContent = (slides[current].getAttribute("aria-label") || "").replace(/^\d+ of \d+:\s*/, "") + `, ${current + 1} of ${slides.length}`;
    }
    // Transition phases: rest, exit (current content flies out), then swap slide and headline, then enter (next content flies in).
    // Exit and enter are gated by animationend on the scene root. animationcancel (class removed, hero offscreen, motion off) resolves to rest.
    const scene = story.parentElement || null;
    let phase = "rest";
    let target = 0;
    let announceTarget = false;
    function canFly() {
      return Boolean(scene) && !paused && !motionPreference.matches && !motionDisabled && !document.hidden &&
        heroEl.classList.contains("m-section-active");
    }
    function clearFlight() {
      phase = "rest";
      heroEl.classList.remove("is-exit");
      heroEl.classList.remove("is-enter");
      heroEl.removeAttribute("data-hs-out");
      heroEl.removeAttribute("data-hs-in");
    }
    function showNow(i, announce) {
      clearFlight();
      show(i, announce);
    }
    function beginEnter() {
      heroEl.classList.remove("is-exit");
      heroEl.removeAttribute("data-hs-out");
      show(target, announceTarget);
      phase = "enter";
      heroEl.setAttribute("data-hs-in", String(current));
      heroEl.classList.add("is-enter");
    }
    function go(i, announce = true) {
      const index = (i + slides.length) % slides.length;
      if (phase === "rest" && index !== current && canFly()) {
        target = index;
        announceTarget = announce;
        phase = "exit";
        heroEl.setAttribute("data-hs-out", String(current));
        heroEl.classList.add("is-exit");
      } else {
        showNow(index, announce);
      }
    }
    function onSceneEnd(event) {
      if (event.target !== scene) return;
      if (event.animationName === "m-hs-out" && phase === "exit") beginEnter();
      else if (event.animationName === "m-hs-in" && phase === "enter") clearFlight();
    }
    function onSceneCancel(event) {
      if (event.target !== scene) return;
      if (event.animationName === "m-hs-out" && phase === "exit") showNow(target, announceTarget);
      else if (event.animationName === "m-hs-in" && phase === "enter") clearFlight();
    }
    // Resolve interruptions independently of animationcancel, which browsers
    // may not deliver when the page or its motion settings change.
    function settleInterruptedFlight() {
      if (phase !== "rest" && !canFly()) {
        showNow(phase === "exit" ? target : current, phase === "exit" && announceTarget);
      }
    }
    story.classList.add("is-enhanced");
    show(0, false);
    if (scene) {
      scene.addEventListener("animationend", onSceneEnd);
      scene.addEventListener("animationcancel", onSceneCancel);
    }
    document.addEventListener?.("visibilitychange", settleInterruptedFlight);
    motionPreference.addEventListener?.("change", settleInterruptedFlight);
    if (typeof MutationObserver !== "undefined") {
      new MutationObserver(settleInterruptedFlight).observe(heroEl, {
        attributes: true,
        attributeFilter: ["class"],
      });
    }
    const prev = story.querySelector("[data-hs-prev]");
    const next = story.querySelector("[data-hs-next]");
    if (prev) prev.addEventListener("click", () => go(current - 1));
    if (next) next.addEventListener("click", () => go(current + 1));
    tabs.forEach((tab, n) => tab.addEventListener("click", () => go(n)));
    if (toggle) toggle.addEventListener("click", () => {
      paused = !paused;
      heroEl.classList.toggle("is-paused", paused);
      toggle.setAttribute("aria-pressed", String(paused));
      toggle.setAttribute("aria-label", paused ? "Play hero animation" : "Pause hero animation");
      toggle.textContent = paused ? "Play" : "Pause";
      if (root.classList) root.classList.toggle("m-fx-paused", paused);
      if (paused && phase !== "rest") showNow(phase === "exit" ? target : current, announceTarget);
    });
    // The progress bar animation drives the story: it only runs while the hero is onscreen, the tab is visible and the user has not paused.
    story.addEventListener("animationend", (event) => {
      if (event.animationName === "m-hs-progress" && phase === "rest" && !paused && !motionPreference.matches &&
          !motionDisabled && !document.hidden && heroEl.classList.contains("m-section-active")) go(current + 1, false);
    });
  }

  let promiseSync = null;
  // Promise carousel: whole-plane slides stacked in one grid cell. Advance is driven by the active dot's CSS progress animation
  // (m-pr-progress), so it only runs while the section is onscreen, the tab is visible and motion is allowed.
  function initializePromises() {
    const car = document.querySelector("[data-promise-carousel]");
    if (!car || !car.querySelectorAll) return;
    const slides = [...car.querySelectorAll("[data-promise-slide]")];
    const dots = [...car.querySelectorAll("[data-promise-select]")];
    const toggle = car.querySelector("[data-promise-toggle]");
    const live = car.querySelector("[data-promise-live]");
    const section = car.closest ? car.closest("section") : null;
    if (!slides.length) return;
    let index = 0;
    let userPaused = false;
    const motionOff = () => motionPreference.matches || motionDisabled;
    const fxPaused = () => Boolean(root.classList && root.classList.contains("m-fx-paused"));
    const sectionVisible = () => !section || section.classList.contains("m-section-active");
    const canFly = () => !motionOff() && !document.hidden && !fxPaused() && sectionVisible();
    function settle() {
      slides.forEach((slide) => slide.classList.remove("is-out"));
      car.classList.remove("is-flying");
    }
    function show(i, announce, fly, step) {
      const from = index;
      index = (i + slides.length) % slides.length;
      settle();
      const flying = fly && from !== index && canFly();
      car.classList.toggle("is-reverse", step < 0);
      if (flying) car.classList.add("is-flying");
      slides.forEach((slide, n) => {
        const active = n === index;
        slide.classList.toggle("is-active", active);
        slide.setAttribute("aria-hidden", String(!active));
        if (flying && n === from) slide.classList.add("is-out");
      });
      dots.forEach((dot, n) => dot.setAttribute("aria-current", String(n === index)));
      if (announce && live) live.textContent = `Promise ${index + 1} of ${slides.length}: ${slides[index].textContent.replace(/^\s*\d+\s*\/\s*\d+\s*/, "").trim()}`;
    }
    promiseSync = () => {
      const off = motionOff();
      if (off) settle();
      if (!toggle) return;
      toggle.disabled = off;
      toggle.textContent = off ? "Autoplay off" : userPaused ? "Play" : "Pause";
      toggle.setAttribute("aria-label", off ? "Autoplay is off because automatic motion is disabled" : userPaused ? "Play promises" : "Pause promises");
    };
    car.classList.add("is-enhanced");
    show(0, false, false, 1);
    promiseSync();
    const prev = car.querySelector("[data-promise-prev]");
    const next = car.querySelector("[data-promise-next]");
    if (prev) prev.addEventListener("click", () => show(index - 1, true, true, -1));
    if (next) next.addEventListener("click", () => show(index + 1, true, true, 1));
    dots.forEach((dot, n) => dot.addEventListener("click", () => show(n, true, true, n > index ? 1 : -1)));
    if (toggle) toggle.addEventListener("click", () => {
      userPaused = !userPaused;
      car.classList.toggle("is-paused", userPaused);
      toggle.setAttribute("aria-pressed", String(userPaused));
      promiseSync();
    });
    car.addEventListener("animationend", (event) => {
      if (event.animationName === "m-pr-progress") {
        if (!userPaused && canFly()) show(index + 1, false, true, 1);
      } else if (event.animationName === "m-pr-out" && event.target && event.target.classList) {
        event.target.classList.remove("is-out");
      }
    });
    car.addEventListener("animationcancel", (event) => {
      if (event.animationName === "m-pr-out" && event.target && event.target.classList) event.target.classList.remove("is-out");
    });
    // Resolve interrupted flights explicitly, including a hero pause or leaving
    // the viewport. Do not wait for animationcancel to clean up an old slide.
    if (typeof MutationObserver !== "undefined") {
      const stateObserver = new MutationObserver(() => {
        if (!canFly()) settle();
      });
      stateObserver.observe(root, { attributes: true, attributeFilter: ["class"] });
      if (section) stateObserver.observe(section, { attributes: true, attributeFilter: ["class"] });
    }
    car.addEventListener("keydown", (event) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === "ArrowLeft") { event.preventDefault(); show(index - 1, true, true, -1); }
      if (event.key === "ArrowRight") { event.preventDefault(); show(index + 1, true, true, 1); }
      if (event.key === "Home") { event.preventDefault(); show(0, true, true, -1); }
      if (event.key === "End") { event.preventDefault(); show(slides.length - 1, true, true, 1); }
    });
  }

  function setNavTone() {
    if (!navBar) return;
    navBar.classList.toggle("is-solid", window.scrollY > 32);
  }

  function setParallax() {
    scrollQueued = false;
    if (!hero || !laptop || motionPreference.matches || motionDisabled) return;
    const bounds = hero.getBoundingClientRect();
    if (bounds.bottom < 0 || bounds.top > window.innerHeight) return;
    const progress = Math.min(1, Math.max(0, -bounds.top / Math.max(bounds.height, 1)));
    laptop.style.setProperty("--hero-shift", `${(progress - .25) * 7}px`);
  }

  function onScroll() {
    setNavTone();
    updateFallbackVideos();
    if (fallbackVideoMode) updateFallbackSections();
    if (scrollQueued) return;
    scrollQueued = true;
    window.requestAnimationFrame(setParallax);
  }

  function isInViewport(element, margin = 0) {
    if (!element) return false;
    const bounds = element.getBoundingClientRect();
    return bounds.bottom > margin && bounds.top < window.innerHeight - margin;
  }

  function updateFallbackSections() {
    for (const section of sections) section.classList.toggle("m-section-active", isInViewport(section, 80));
    if (carousel) {
      carouselInView = isInViewport(carousel, 80);
      scheduleCarousel();
    }
  }

  function stopVideos() {
    for (const video of videos) video.pause();
  }

  function showPoster(video) {
    const poster = video.parentElement.querySelector("[data-wizard-poster]");
    video.classList.remove("is-playing");
    video.setAttribute("aria-hidden", "true");
    if (poster) {
      poster.classList.remove("is-hidden");
      poster.removeAttribute("aria-hidden");
    }
  }

  function showVideo(video) {
    const poster = video.parentElement.querySelector("[data-wizard-poster]");
    video.classList.add("is-playing");
    video.removeAttribute("aria-hidden");
    if (poster) {
      poster.classList.add("is-hidden");
      poster.setAttribute("aria-hidden", "true");
    }
  }

  function loadVideoSource(video) {
    let changed = false;
    for (const source of video.querySelectorAll("source[data-src]")) {
      source.src = source.dataset.src;
      delete source.dataset.src;
      changed = true;
    }
    if (changed) video.load();
  }

  function updateFallbackVideos() {
    if (!fallbackVideoMode || motionPreference.matches || motionDisabled) return;
    for (const video of videos) {
      if (!document.hidden && isInViewport(video)) {
        loadVideoSource(video);
        video.play().catch(() => {});
      } else {
        video.pause();
        showPoster(video);
      }
    }
  }

  function configureMotion() {
    revealObserver?.disconnect();
    videoObserver?.disconnect();
    stopCarouselTimer();
    if (promiseSync) promiseSync();
    document.documentElement.classList.toggle("m-page-hidden", document.hidden);
    if (carouselToggle) {
      const disabled = motionPreference.matches || motionDisabled;
      carouselToggle.disabled = disabled;
      carouselToggle.textContent = disabled ? "Autoplay off" : carouselPausedByUser ? "Play" : "Pause";
      carouselToggle.setAttribute("aria-label", disabled ? "Autoplay is off because automatic motion is disabled" : carouselPausedByUser ? "Play slideshow" : "Pause slideshow");
    }
    fallbackVideoMode = false;
    if (motionPreference.matches || motionDisabled) {
      document.documentElement.classList.remove("m-motion");
      document.documentElement.classList.remove("m-flight-ready");
      for (const section of sections) section.classList.remove("m-section-active");
      for (const item of revealItems) item.classList.add("is-visible");
      stopVideos();
      for (const video of videos) showPoster(video);
      if (laptop) laptop.style.removeProperty("--hero-shift");
      return;
    }

    document.documentElement.classList.add("m-motion");
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => document.documentElement.classList.add("m-flight-ready")));
    if (!("IntersectionObserver" in window)) {
      for (const item of revealItems) item.classList.add("is-visible");
      fallbackVideoMode = true;
      updateFallbackSections();
      updateFallbackVideos();
      return;
    }

    try {
      revealObserver = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (entry.target.matches("#top > section")) {
            entry.target.classList.toggle("m-section-active", entry.isIntersecting);
            continue;
          }
          if (entry.target === carousel) {
            carouselInView = entry.isIntersecting;
            scheduleCarousel();
            continue;
          }
          entry.target.classList.toggle("is-visible", entry.isIntersecting);
          entry.target.classList.toggle("is-past", !entry.isIntersecting && Boolean(entry.boundingClientRect) && entry.boundingClientRect.top < 0);
        }
      }, { threshold: 0.12, rootMargin: "0px 0px -36px 0px" });
      for (const item of revealItems) revealObserver.observe(item);
      for (const section of sections) revealObserver.observe(section);
      if (carousel && carousel.querySelector) revealObserver.observe(carousel);

      videoObserver = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          const video = entry.target;
          if (entry.isIntersecting && !document.hidden && !motionPreference.matches && !motionDisabled) {
            loadVideoSource(video);
            video.play().catch(() => {});
          } else {
            video.pause();
            showPoster(video);
          }
        }
      }, { threshold: 0.25 });
      for (const video of videos) videoObserver.observe(video);
    } catch (_) {
      revealObserver?.disconnect();
      videoObserver?.disconnect();
      document.documentElement.classList.remove("m-motion");
      document.documentElement.classList.remove("m-flight-ready");
      for (const item of revealItems) item.classList.add("is-visible");
      for (const section of sections) section.classList.remove("m-section-active");
      stopVideos();
      for (const video of videos) showPoster(video);
      fallbackVideoMode = true;
      updateFallbackSections();
      updateFallbackVideos();
    }
  }

  function handleVisibilityChange() {
    document.documentElement.classList.toggle("m-page-hidden", document.hidden);
    if (document.hidden) {
      stopVideos();
    } else if (fallbackVideoMode) {
      updateFallbackVideos();
    } else if (!motionPreference.matches && !motionDisabled) {
      for (const video of videos) {
        if (isInViewport(video)) {
          loadVideoSource(video);
          video.play().catch(() => {});
        }
      }
    }
    scheduleCarousel();
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });
  document.addEventListener("visibilitychange", handleVisibilityChange);
  for (const video of videos) {
    video.addEventListener("playing", () => showVideo(video));
    video.addEventListener("pause", () => showPoster(video));
  }
  if (motionPreference.addEventListener) motionPreference.addEventListener("change", configureMotion);
  else motionPreference.addListener(configureMotion);
  initializeCarousel();
  initializeHeroStory();
  initializePromises();
  configureMotion();
  setNavTone();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initializeMarketing, { once: true });
  else initializeMarketing();
})();

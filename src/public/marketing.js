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
  if (colorMeta) colorMeta.setAttribute("content", initialTheme === "dark" ? "#21191b" : "#f4efe7");

  function installThemeToggle() {
    const buttons = [...document.querySelectorAll("[data-theme-toggle]")];
    const label = document.querySelector("[data-theme-label]");
    if (!buttons.length) return;
    let activeTheme = initialTheme;
    function paintTheme(theme) {
      activeTheme = theme;
      if (typeof root.setAttribute === "function") root.setAttribute("data-theme", theme);
      if (colorMeta) colorMeta.setAttribute("content", theme === "dark" ? "#21191b" : "#f4efe7");
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
  configureMotion();
  setNavTone();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initializeMarketing, { once: true });
  else initializeMarketing();
})();

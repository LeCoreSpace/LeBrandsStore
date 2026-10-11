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
  const videos = [...document.querySelectorAll(".m-wizard-media video")];
  const hero = document.querySelector(".m-hero");
  const laptop = document.querySelector(".m-device-laptop");
  const navBar = document.querySelector(".m-nav");
  let revealObserver;
  let videoObserver;
  let scrollQueued = false;
  let fallbackVideoMode = false;

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
    if (scrollQueued) return;
    scrollQueued = true;
    window.requestAnimationFrame(setParallax);
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
      const bounds = video.getBoundingClientRect();
      if (bounds.top < window.innerHeight && bounds.bottom > 0) {
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
    fallbackVideoMode = false;
    if (motionPreference.matches || motionDisabled) {
      document.documentElement.classList.remove("m-motion");
      document.documentElement.classList.remove("m-flight-ready");
      for (const item of revealItems) item.classList.add("is-visible");
      stopVideos();
      for (const video of videos) showPoster(video);
      if (laptop) laptop.style.removeProperty("--hero-shift");
      return;
    }

    document.documentElement.classList.add("m-motion");
    window.requestAnimationFrame(() => document.documentElement.classList.add("m-flight-ready"));
    if (!("IntersectionObserver" in window)) {
      for (const item of revealItems) item.classList.add("is-visible");
      fallbackVideoMode = true;
      updateFallbackVideos();
      return;
    }

    try {
      revealObserver = new IntersectionObserver((entries, observer) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      }, { threshold: 0.12, rootMargin: "0px 0px -36px 0px" });
      for (const item of revealItems) revealObserver.observe(item);

      videoObserver = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          const video = entry.target;
          if (entry.isIntersecting && !motionPreference.matches && !motionDisabled) {
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
      for (const item of revealItems) item.classList.add("is-visible");
      fallbackVideoMode = true;
      updateFallbackVideos();
    }
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });
  for (const video of videos) {
    video.addEventListener("playing", () => showVideo(video));
    video.addEventListener("pause", () => showPoster(video));
  }
  if (motionPreference.addEventListener) motionPreference.addEventListener("change", configureMotion);
  else motionPreference.addListener(configureMotion);
  configureMotion();
  setNavTone();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initializeMarketing, { once: true });
  else initializeMarketing();
})();

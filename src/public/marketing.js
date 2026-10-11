(() => {
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
    if (scrollQueued) return;
    scrollQueued = true;
    window.requestAnimationFrame(setParallax);
  }

  function stopVideos() {
    for (const video of videos) video.pause();
  }

  function configureMotion() {
    revealObserver?.disconnect();
    videoObserver?.disconnect();
    if (motionPreference.matches || motionDisabled) {
      document.documentElement.classList.remove("m-motion");
      for (const item of revealItems) item.classList.add("is-visible");
      stopVideos();
      if (laptop) laptop.style.removeProperty("--hero-shift");
      return;
    }

    document.documentElement.classList.add("m-motion");
    if (!("IntersectionObserver" in window)) {
      for (const item of revealItems) item.classList.add("is-visible");
      for (const video of videos) video.play().catch(() => {});
      return;
    }

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
        if (entry.isIntersecting && !motionPreference.matches && !motionDisabled) video.play().catch(() => {});
        else video.pause();
      }
    }, { threshold: 0.25 });
    for (const video of videos) videoObserver.observe(video);
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });
  if (motionPreference.addEventListener) motionPreference.addEventListener("change", configureMotion);
  else motionPreference.addListener(configureMotion);
  configureMotion();
  setNavTone();
})();

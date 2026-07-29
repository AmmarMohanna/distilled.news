(() => {
  const root = document.documentElement;
  root.classList.add("app-pending");

  try {
    const theme = localStorage.getItem("dn_theme");
    root.dataset.theme = theme === "dark" ? "dark" : "light";
  } catch {}

  const reveal = () => root.classList.remove("app-pending");

  document.addEventListener(
    "DOMContentLoaded",
    () => {
      const stylesheets = Array.from(document.querySelectorAll('link[rel="stylesheet"]'));
      if (stylesheets.length === 0) {
        requestAnimationFrame(reveal);
        return;
      }

      let pending = 0;
      let finished = false;
      const complete = () => {
        pending -= 1;
        if (pending <= 0 && !finished) {
          finished = true;
          requestAnimationFrame(reveal);
        }
      };

      for (const sheet of stylesheets) {
        if (sheet.sheet) continue;
        pending += 1;
        sheet.addEventListener("load", complete, { once: true });
        sheet.addEventListener("error", complete, { once: true });
      }

      if (pending === 0 && !finished) {
        finished = true;
        requestAnimationFrame(reveal);
      } else {
        window.setTimeout(() => {
          if (!finished) {
            finished = true;
            reveal();
          }
        }, 2000);
      }
    },
    { once: true }
  );
})();

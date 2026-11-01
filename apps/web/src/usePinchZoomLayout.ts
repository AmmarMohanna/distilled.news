import { useLayoutEffect } from 'react';

/** Let pinch zoom magnify the existing page instead of moving its fixed rail. */
export function usePinchZoomLayout(enabled = true) {
  useLayoutEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport || !enabled) return;
    const root = document.documentElement;
    const measure = () => {
      if (viewport.scale > 1.01) {
        root.setAttribute('data-pinch-zoom', '');
        return;
      }
      root.removeAttribute('data-pinch-zoom');
      document.querySelectorAll<HTMLElement>('.app-pages .bottom-navigation').forEach(navigation => {
        const parent = navigation.closest('main');
        if (!parent) return;
        resizeObserver.observe(navigation);
        resizeObserver.observe(parent);
        const rail = navigation.getBoundingClientRect(), container = parent.getBoundingClientRect();
        navigation.style.setProperty('--pinch-nav-top', `${rail.top - container.top - parent.clientTop}px`);
        navigation.style.setProperty('--pinch-nav-left', `${rail.left - container.left - parent.clientLeft}px`);
        navigation.style.setProperty('--pinch-nav-width', `${rail.width}px`);
        navigation.style.setProperty('--pinch-nav-height', `${rail.height}px`);
      });
    };
    const resizeObserver = new ResizeObserver(measure);
    measure();
    const observer = new MutationObserver(measure);
    observer.observe(document.getElementById('root') ?? document.body, {childList: true, subtree: true});
    viewport.addEventListener('resize', measure);
    window.addEventListener('resize', measure);
    document.addEventListener('scroll', measure, true);
    return () => {
      observer.disconnect();
      resizeObserver.disconnect();
      viewport.removeEventListener('resize', measure);
      window.removeEventListener('resize', measure);
      document.removeEventListener('scroll', measure, true);
      root.removeAttribute('data-pinch-zoom');
    };
  }, [enabled]);
}

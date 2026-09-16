import type { ShieldBadge } from './shield-badge';

/**
 * Upgrades the static medallion on the front page to the WebGL badge.
 *
 * three.js is 131 KB gzipped for a decoration, so the page renders the `<img>` and
 * this fetches the module only for a visitor who will both see it move and be able
 * to. Nothing here is required for the page to work.
 */

function canEnhance(): boolean {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  if ((navigator as { connection?: { saveData?: boolean } }).connection?.saveData) return false;

  try {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2') ?? probe.getContext('webgl');
    // Probing costs a real context, and browsers only allow a handful at once.
    gl?.getExtension('WEBGL_lose_context')?.loseContext();

    return Boolean(gl);
  } catch {
    return false;
  }
}

function whenIdle(run: () => void): void {
  if ('requestIdleCallback' in window) {
    requestIdleCallback(run, { timeout: 2000 });
  } else {
    setTimeout(run, 1200);
  }
}

function bindBadgeControls(root: HTMLElement, badge: ShieldBadge): void {
  badge.ready.then(
    () => {
      root.dataset.ready = '';
      root.tabIndex = 0;
      root.ariaLabel =
        'kleos shield. Drag or press the arrow keys to spin it, click or press Enter to stop or resume it.';
    },
    (error: unknown) => {
      console.warn(error);
      badge.dispose();
    },
  );

  root.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      badge.toggleSpin();
    }
    if (event.key === 'ArrowLeft') badge.nudge(-3);
    if (event.key === 'ArrowRight') badge.nudge(3);
  });
}

function shadowPainter(shadow: HTMLElement | null) {
  return ({ angle, bob }: { angle: number; bob: number }) => {
    if (!shadow) return;

    // The shadow narrows when the shield is edge-on and fades as it rises. Scaling
    // it rather than resizing it keeps that off the layout path.
    const narrow = 0.46 + 0.54 * Math.abs(Math.cos(angle));

    shadow.style.transform = `scaleX(${narrow.toFixed(3)})`;
    shadow.style.opacity = (0.75 - bob * 4).toFixed(3);
  };
}

function upgrade(root: HTMLElement, shadow: HTMLElement | null): void {
  // Without WebGL the static medallion stays, so a failure here is not an error for
  // the page.
  import('./shield-badge')
    .then(({ createShieldBadge }) => {
      const badge = createShieldBadge(root, {
        front: '/favicon-512.png',
        back: '/shield-back.png',
        thickness: 0.047,
        dome: 0.067,
        concave: 0.057,
        onFrame: shadowPainter(shadow),
      });

      bindBadgeControls(root, badge);
    })
    .catch((error: unknown) => console.warn(error));
}

export function enhanceMark(root: HTMLElement, shadow: HTMLElement | null): void {
  if (!canEnhance()) return;

  whenIdle(() => {
    // Scrolled past before the page went idle means it is never fetched at all.
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;

      io.disconnect();
      upgrade(root, shadow);
    });

    io.observe(root);
  });
}

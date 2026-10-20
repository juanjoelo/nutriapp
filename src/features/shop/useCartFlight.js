import { useEffect, useRef } from 'react';

// Keep animation outside cart persistence: it never delays or duplicates an item update.
export function useCartFlight() {
  const active = useRef(new Set());
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const cancelAll = () => {
      for (const cleanup of [...active.current]) cleanup();
    };
    const changed = () => {
      if (preference.matches) cancelAll();
    };
    preference.addEventListener('change', changed);
    return () => {
      preference.removeEventListener('change', changed);
      cancelAll();
    };
  }, []);

  return (product, button) => {
    const target = document.querySelector('[data-cart-target]');
    if (
      !button ||
      !target ||
      !Element.prototype.animate ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    )
      return;
    const from = button.getBoundingClientRect();
    const to = target.getBoundingClientRect();
    const size = 48;
    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);
    const picture = document.createElement('img');
    picture.src = product.image;
    picture.alt = '';
    picture.setAttribute('aria-hidden', 'true');
    picture.className = 'cart-flight';
    picture.style.left = from.left + from.width / 2 - size / 2 + 'px';
    picture.style.top = from.top + from.height / 2 - size / 2 + 'px';
    document.body.append(picture);
    const animation = picture.animate(
      [
        { transform: 'translate(0, 0) scale(1)', opacity: 1, offset: 0 },
        {
          transform: `translate(${dx * 0.45}px, ${dy * 0.55 - 70}px) scale(.8)`,
          opacity: 1,
          offset: 0.5,
        },
        { transform: `translate(${dx}px, ${dy}px) scale(.18)`, opacity: 0, offset: 1 },
      ],
      { duration: 700, easing: 'cubic-bezier(.3,.05,.35,1)', fill: 'forwards' },
    );
    const cleanup = () => {
      animation.cancel();
      picture.remove();
      active.current.delete(cleanup);
    };
    active.current.add(cleanup);
    animation.finished.then(() => {
      cleanup();
      if (!target.isConnected || window.matchMedia('(prefers-reduced-motion: reduce)').matches)
        return;
      const pulse = target.animate(
        [{ transform: 'scale(1)' }, { transform: 'scale(1.2)' }, { transform: 'scale(1)' }],
        { duration: 280, easing: 'ease-out' },
      );
      const stopPulse = () => {
        pulse.cancel();
        active.current.delete(stopPulse);
      };
      active.current.add(stopPulse);
      pulse.finished.then(stopPulse, stopPulse);
    }, cleanup);
  };
}

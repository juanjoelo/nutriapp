import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { useCartFlight } from './useCartFlight.js';
const Context = createContext(null);
const key = 'vanina-cart-v1';
function initialCart() {
  try {
    const stored = JSON.parse(localStorage.getItem(key));
    return Array.isArray(stored)
      ? stored
          .filter(
            (p) =>
              typeof p.id === 'string' &&
              typeof p.name === 'string' &&
              Number.isInteger(p.quantity) &&
              p.quantity > 0 &&
              p.quantity <= 10 &&
              Number.isInteger(p.priceCents),
          )
          .slice(0, 20)
      : [];
  } catch {
    return [];
  }
}
export function CartProvider({ children }) {
  const [items, setItems] = useState(initialCart);
  const currentItems = useRef(items);
  const flyToCart = useCartFlight();
  function updateItems(update) {
    const next = update(currentItems.current);
    currentItems.current = next;
    setItems(next);
  }
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(items));
    } catch {
      /* Private browsing or full storage. */
    }
  }, [items]);
  const count = items.reduce((n, p) => n + p.quantity, 0);
  function add(product, button) {
    const current = currentItems.current;
    if (
      current.reduce((n, p) => n + p.quantity, 0) >= 20 ||
      (current.find((p) => p.id === product.id)?.quantity || 0) >= 10
    )
      return false;
    flyToCart(product, button);
    updateItems((current) => {
      if (current.reduce((n, p) => n + p.quantity, 0) >= 20) return current;
      const found = current.find((p) => p.id === product.id);
      if (found)
        return current.map((p) =>
          p.id === product.id ? { ...p, quantity: Math.min(10, p.quantity + 1) } : p,
        );
      return [
        ...current,
        {
          id: product.id,
          name: product.name,
          priceCents: product.priceCents,
          image: product.image,
          quantity: 1,
        },
      ];
    });
    return true;
  }
  function quantity(id, value) {
    updateItems((current) =>
      current.map((p) => (p.id === id ? { ...p, quantity: Math.min(10, Math.max(1, value)) } : p)),
    );
  }
  return (
    <Context.Provider
      value={{
        items,
        count,
        add,
        quantity,
        remove: (id) => updateItems((v) => v.filter((p) => p.id !== id)),
        clear: () => updateItems(() => []),
      }}
    >
      {children}
    </Context.Provider>
  );
}
export const useCart = () => useContext(Context);

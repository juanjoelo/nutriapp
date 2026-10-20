import { money } from '../../lib/api.js';
export function ProductPrice({ product }) {
  return (
    <span className="product-price">
      {product.discountPercent > 0 && (
        <>
          <del>{money(product.basePriceCents)}</del>
          <small className="offer-badge">−{product.discountPercent}%</small>
        </>
      )}
      <strong>{money(product.priceCents)}</strong>
    </span>
  );
}

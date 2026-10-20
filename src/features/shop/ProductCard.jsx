import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { ProductPrice } from './ProductPrice.jsx';

export function shortDescription(description) {
  const text = description.replace(/\s+/g, ' ').trim();
  if (text.length <= 140) return text;
  const cut = text.slice(0, 137);
  const space = cut.lastIndexOf(' ');
  return cut.slice(0, space > 90 ? space : cut.length).trimEnd() + '…';
}

export function ProductCard({ product, full, onAdd }) {
  const [photo, setPhoto] = useState(product.image);
  return (
    <article className="product-card">
      <Link className="product-card-link" to={'/tienda/' + product.id}>
        <div className="product-photo">
          <img src={photo} alt={product.name} loading="lazy" />
          <span>{product.category}</span>
        </div>
        <div className="product-info">
          <h2>{product.name}</h2>
          <p className="product-summary">{shortDescription(product.description)}</p>
          <span className="product-detail-hint">Ver detalles →</span>
        </div>
      </Link>
      {product.images?.length > 1 && (
        <div className="product-thumbnails" aria-label={'Fotos de ' + product.name}>
          {product.images.map((img, i) => (
            <button
              key={img}
              aria-label={'Ver foto ' + (i + 1) + ' de ' + product.name}
              aria-pressed={photo === img}
              onClick={() => setPhoto(img)}
            >
              <img src={img} alt="" />
            </button>
          ))}
        </div>
      )}
      <div className="product-card-footer">
        <ProductPrice product={product} />
        <button
          className="icon-button add-product"
          disabled={full}
          aria-label={'Agregar ' + product.name}
          onClick={onAdd}
        >
          <Plus size={20} />
        </button>
      </div>
    </article>
  );
}

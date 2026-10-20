export function serializeProduct(p) {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    category: p.category,
    priceCents: p.price_cents,
    image: p.image,
    images: [p.image, ...JSON.parse(p.gallery || '[]')],
    weight: p.weight,
    height: p.height,
    width: p.width,
    length: p.length,
    active: Boolean(p.active),
  };
}

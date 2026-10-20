import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
await mkdir('public/images', { recursive: true });
await Promise.all([
  sharp('src/imagenes/mesa-compartida.png')
    .resize({ width: 1200, withoutEnlargement: true })
    .webp({ quality: 85 })
    .toFile('public/images/mesa-compartida.webp'),
  sharp('src/imagenes/portada-plato.png')
    .resize({ width: 1600, withoutEnlargement: true })
    .webp({ quality: 85 })
    .toFile('public/images/portada-plato.webp'),
  sharp('src/imagenes/FondoPagina2.jpg')
    .resize(1600)
    .webp({ quality: 82 })
    .toFile('public/images/mesa-natural.webp'),
  sharp('src/imagenes/fotovani.png')
    .resize(800)
    .webp({ quality: 82 })
    .toFile('public/images/vanina.webp'),
  sharp('src/imagenes/foto3.jpg')
    .resize({ width: 700, withoutEnlargement: true })
    .webp({ quality: 82 })
    .toFile('public/images/pausa.webp'),
]);

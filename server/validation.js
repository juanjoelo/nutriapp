import { z } from 'zod';
export const postalCode = z
  .string()
  .trim()
  .regex(/^\d{4}$/, 'Ingresá un código postal argentino de 4 dígitos.');
export const cartSchema = z
  .array(z.object({ id: z.string().uuid(), quantity: z.number().int().min(1).max(10) }).strict())
  .min(1)
  .max(20)
  .refine(
    (items) => new Set(items.map((item) => item.id)).size === items.length,
    'Hay productos repetidos.',
  )
  .refine(
    (items) => items.reduce((n, item) => n + item.quantity, 0) <= 20,
    'Máximo 20 unidades por envío.',
  );
export const productSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    description: z.string().trim().min(5).max(4000),
    category: z.string().trim().min(2).max(60),
    priceCents: z.number().int().min(100).max(100000000),
    image: z.string().regex(/^\/uploads\/[a-f0-9-]{36}\.webp$/),
    images: z
      .array(z.string().regex(/^\/uploads\/[a-f0-9-]{36}\.webp$/))
      .min(1)
      .max(6)
      .optional(),
    weight: z.number().int().min(1).max(25000),
    height: z.number().int().min(1).max(150),
    width: z.number().int().min(1).max(150),
    length: z.number().int().min(1).max(150),
    active: z.boolean(),
  })
  .strict();
export const customerSchema = z
  .object({
    name: z.string().trim().min(3).max(100),
    email: z.email().max(200),
    phone: z
      .string()
      .trim()
      .regex(/^[+\d ()-]{8,25}$/),
    street: z.string().trim().min(2).max(120),
    number: z.string().trim().min(1).max(10),
    apartment: z.string().trim().max(60).default(''),
    city: z.string().trim().min(2).max(100),
    province: z.string().trim().min(2).max(60),
    postalCode,
  })
  .strict();
export const checkoutSchema = z
  .object({ quoteId: z.string().uuid(), customer: customerSchema })
  .strict();
export const credentialsSchema = z.object({
  email: z.email().max(200),
  password: z.string().min(12).max(128),
});

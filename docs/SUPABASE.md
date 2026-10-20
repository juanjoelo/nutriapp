# Supabase gratuito

El backend soporta PostgreSQL de Supabase y Supabase Storage para las fotos. El entorno local conserva SQLite y archivos locales. Preparar esta integración no crea una cuenta, no conecta un proyecto automáticamente ni migra los datos de inspección.

## Plan y límites

Consulta de fuentes oficiales: 7 de octubre de 2026. El [plan Free](https://supabase.com/pricing) incluye 500 MB de base de datos y 1 GB de archivos. Los proyectos gratuitos con poca actividad pueden [pausarse](https://supabase.com/docs/guides/platform/free-project-pausing); hay que contemplar ese límite para una tienda publicada. No se activó ningún plan pago. Base y almacenamiento gratuitos no implican que el hosting del servidor, email o dominio también lo sean.

## Preparar el proyecto

### Datos que faltan para conectar Nutriapp (19/10/2026)

La URL indicada por el owner es `https://bfjhrrldsrrzcijflrzq.supabase.co`. Abrir ese proyecto en el Dashboard y comprobar la referencia `bfjhrrldsrrzcijflrzq`. Si la cuenta no lo muestra, iniciar sesión con la cuenta propietaria antes de copiar datos. No usar el proyecto de Vesper.

Para esta aplicación hacen falta **dos valores privados**. Se guardan directamente en el `.env` de la raíz de Nutriapp, nunca en el chat, GitHub ni el `.env` de otro repositorio:

1. **DATABASE_URL:** abrir **Connect**, seleccionar la cadena **URI** y el método **Session pooler**. Copiar la cadena completa que entrega Supabase. Sustituir `[YOUR-PASSWORD]` por la contraseña de la base de ese proyecto (no la contraseña de inicio de sesión). El usuario debe corresponder a `postgres.bfjhrrldsrrzcijflrzq`; conservar el host y puerto que muestra el panel. Los caracteres reservados de la contraseña deben codificarse para URL, por ejemplo `@` como `%40` y `#` como `%23`. No usar conversores externos para contraseñas. Si no se conserva la contraseña, restablecerla desde la configuración de Database del proyecto correcto y actualizar cualquier conexión existente que la utilice.
2. **SUPABASE_SECRET_KEY:** abrir **Settings → API Keys**, ubicar **Secret keys**, revelar/copiar una clave secreta del proyecto. Si no existe, crear una para el backend de Nutriapp. Las claves nuevas empiezan por `sb_secret_`; no copiar la publishable ni un personal access token. El nombre de variable que usa este backend es singular: `SUPABASE_SECRET_KEY`.
3. Conservar `SUPABASE_URL=https://bfjhrrldsrrzcijflrzq.supabase.co` y `SUPABASE_STORAGE_BUCKET=nutriapp-products`. No hace falta un `SUPABASE_ACCESS_TOKEN` ni `SUPABASE_PROJECT_REF` para ejecutar la aplicación por este camino.
4. Guardar el archivo en VS Code con **Ctrl+S** y avisar que está guardado. Mantener los proveedores locales hasta verificar el acceso; el ejecutor cambiará `DATABASE_PROVIDER` y `STORAGE_PROVIDER` a `supabase` al completar la preparación y el cambio de almacenamiento.

Con esos datos el ejecutor puede comprobar TLS y permisos, preparar el esquema privado, crear/verificar el bucket, respaldar e importar los datos seleccionados y las fotos, cotejar cantidades/referencias y cambiar la aplicación a la nube. Las migraciones SQL incluidas crean estructura, **no realizan todavía la importación de SQLite**. La inspección local permanece separada y no se convierte en un panel público sin autenticación. Los registros de prueba no se presentarán como ventas reales ni se enviarán emails históricos durante la migración.

Fuentes: [conexión y contraseña en la URI](https://supabase.com/docs/guides/database/connecting-to-postgres), [claves secretas del servidor](https://supabase.com/docs/guides/getting-started/api-keys).

1. Crear un proyecto **Free** propio en Supabase. Elegir una contraseña de base de datos y conservarla en el gestor de secretos.
2. Desde **Connect**, copiar la URL PostgreSQL del **Session pooler** para un servidor con IPv4, o la conexión directa si dispone de IPv6. La [guía oficial de conexiones](https://supabase.com/docs/guides/database/connecting-to-postgres) explica ambas opciones. Codificar los caracteres especiales de la contraseña en esa URL.
3. Cargar las variables privadas del servidor tomando .env.example como referencia: DATABASE_PROVIDER=supabase, DATABASE_URL, STORAGE_PROVIDER=supabase, SUPABASE_URL, SUPABASE_SECRET_KEY y SUPABASE_STORAGE_BUCKET=nutriapp-products. DATABASE_CA_CERT es opcional: apunta al archivo del certificado CA si lo requiere la cadena TLS. La validación TLS permanece activada. SUPABASE_SECRET_KEY es la clave secreta del servidor (o la legacy service_role); no usar la clave pública ni variables VITE_*. Ninguna credencial se envía al navegador.
4. Ejecutar **npm run db:setup** contra ese proyecto. Aplica `supabase/migrations/001_store.sql` (tienda e historial), `002_bookings_payments.sql` (agenda, packs, avisos y conexión OAuth cifrada) y `003_consultation_payments.sql` (PayPal, configuración Prex y cobros de consultas) en el esquema privado nutriapp. No borra tablas existentes. Se puede repetir sin duplicar el registro inicial. El arranque exige las tres migraciones.
5. En Storage, crear el bucket público **nutriapp-products**, limitado a image/webp y 5 MB por archivo. El bucket es público para leer las imágenes comerciales; las escrituras se hacen únicamente desde el backend autenticado. No agregar políticas de escritura para usuarios anónimos. [Buckets](https://supabase.com/docs/guides/storage/buckets/creating-buckets).
6. Configurar también OWNER_EMAIL, HTTPS y los servicios de pagos, envíos y email según el README; ejecutar **npm run owner:invite** para crear el acceso de la dueña. No hay registro público.
7. Arrancar un único proceso del backend. Verificar subida de una foto, catálogo, crear/editar/reutilizar una campaña, un combo y la cotización antes de publicar. El pool tiene hasta cuatro conexiones y las transacciones usan una misma conexión.

## Datos y seguridad

- Pedidos, clientes, sesiones, catálogo y configuraciones residen en el esquema nutriapp, fuera de public. No agregar ese esquema a los expuestos por la Data API.
- Se revocan accesos de PUBLIC, anon y authenticated al esquema; las tablas tienen RLS activado sin políticas públicas. El backend conserva su autenticación privada de dueña.
- Las fotos mantienen rutas /uploads/UUID.webp; el servidor las redirige a la URL pública del bucket. La clave secreta nunca forma parte de esa URL.
- No hay fallback silencioso a SQLite si falla Supabase: se informa un error de conexión. El script de inspección siempre usa SQLite, proveedores simulados y acceso exclusivamente local.
- La migración prepara el esquema: **no copia datos locales**. Para publicar con datos previos, primero respaldar la base SQLite y la carpeta de fotos, separar productos reales de los ejemplos “Prueba”, importar los registros y subir las imágenes manteniendo sus nombres, verificar cantidades y referencias, y recién entonces cambiar los proveedores del servidor. Los pedidos deben conservar sus IDs, estados e importes. No trasladar sesiones ni enlaces de recuperación.
- Los registros existentes al incorporar el historial se guardan como “Registro inicial”; no se inventan fechas ni versiones anteriores.

## Verificación

**npm test** prueba SQLite, historial, transacciones y el adaptador de Storage con HTTP simulado. **npm run test:postgres** levanta un PostgreSQL local descartable en el puerto 55439 y ejecuta las pruebas de API sobre esquemas aislados; requiere PostgreSQL instalado (PG_BIN permite indicar su carpeta de binarios). Detiene ese servidor al finalizar. Esto valida compatibilidad PostgreSQL, no la conectividad, las credenciales ni los permisos de un proyecto remoto.

# Vanina Alaniz · Nutrición integral y tienda

Rediseño del sitio original con React + Vite, API Express y centro de comando privado. El monolito `src/paginas/home.js` y el sistema de turnos anterior fueron retirados. La nueva agenda propia permite reservar sin crear una cuenta. La identidad, la foto de Vanina y los contactos provienen del sitio original.

## Desarrollo local

Requiere Node.js 24 y npm. Desde este repositorio:

```sh
nvm use
npm ci
cp .env.example .env
npm run dev
```

Abrir **http://localhost:5173**. La API escucha en 127.0.0.1:4100; Vite sirve el sitio y redirige /api y /uploads. `APP_URL` debe coincidir exactamente con el origen usado en el navegador: localhost y 127.0.0.1 son orígenes diferentes. Las operaciones de escritura rechazan otros orígenes.

El sitio se puede ver sin credenciales. El catálogo real comienza vacío; no se crean productos, ventas, usuarios ni conexiones ficticias. Sin credenciales de los proveedores, no se permiten cobros ni se inventan tarifas.

## Estructura

- `src/pages/`: portada y contenido institucional.
- `src/components/`: navegación, marca y pie.
- `src/features/shop/`: catálogo, galería de fotos, carrito, dirección, cotización y resultado de compra.
- Cada tarjeta resume la descripción a un máximo de 140 caracteres. Al abrirla, `/tienda/:id` muestra las fotos, el precio y la descripción completa. Los productos ocultos no tienen ficha pública.
- El botón de agregar muestra una miniatura que viaja al carrito. La compra se actualiza de inmediato, con límites de unidades, y la animación respeta la preferencia de reducir movimiento.
- `src/features/admin/`: acceso privado, resumen, gráfico, productos y pedidos.
- `src/styles/`: estilos base, sitio, tienda y administración.
- `server/`: configuración, autenticación, catálogo, pedidos, estadísticas y persistencia.
- `server/integrations/`: adaptadores de Mercado Pago, Correo Argentino y SMTP.
- `scripts/`: desarrollo, optimización de fotos originales e invitación privada.
- `tests/`: pruebas de API y navegador con base temporal y proveedores simulados.
- `docs/architecture-map.json`: mapa de responsabilidades.

En desarrollo, SQLite y fotos cargadas se guardan en `DATA_DIR`, fuera de Git. SQLite es gratuita y requiere disco persistente. Para la nube se preparó **Supabase Free**: PostgreSQL y Storage, seleccionables mediante variables privadas del servidor. Ver [configuración y límites](docs/SUPABASE.md). Mantener una única instancia de la API; no hay dependencia del almacenamiento del navegador para productos, ventas, configuraciones ni sesiones.

Las fotos originales permanecen en `src/imagenes/`. `predev` y `prebuild` generan versiones WebP en `public/images/`, ignoradas por Git. Las fuentes tipográficas se sirven desde el mismo sitio.

## Centro de comando

### Inspección local sin contraseña

Ejecutar `npm run inspect` y abrir **http://localhost:4174/admin**. Permite revisar y editar un catálogo y pedidos de demostración sin configurar la cuenta de Vanina.

Este proceso usa una base independiente en `data/inspection-review/`, escucha solo en 127.0.0.1 y admite el host localhost:4174. No carga .env ni credenciales, no envía emails reales y no permite pagos. El panel indica “Modo inspección”. Los cambios y fotos se conservan al cerrar y volver a abrir el proceso; ese directorio está excluido de Git. No modifica la autenticación del sitio normal (/admin en el puerto 5173) y el script rechaza NODE_ENV=production. Las pruebas automatizadas siguen usando directorios temporales descartables.

Ruta **/admin**, de acceso exclusivo al email configurado en `OWNER_EMAIL`. No existe registro público ni opción para que un visitante se otorgue permisos.

La página pública no muestra enlaces ni botones de acceso administrativo. Vanina entra directamente por /admin o desde su marcador privado; la autenticación sigue siendo obligatoria.

Vanina puede:

- Crear, editar y quitar productos de la tienda. Quitarlos los oculta sin borrar el historial de ventas.
- Subir hasta 6 fotos, elegir la portada, escribir descripción y categoría, y cambiar precio.
- Definir peso y medidas por unidad, necesarios para cotizar envíos.
- La ayuda del formulario explica cómo medir frascos y pesar el producto con su envase y protección.
- Ver ventas cobradas pendientes de despacho, enviadas y todos los pedidos, con paginación.
- Consultar dirección, contacto, detalle de compra, paquete estimado, pago y estado del aviso por email.
- Registrar el número de seguimiento cuando haya entregado el paquete a Correo.
- Al confirmar el despacho, enviar un aviso al email que el comprador ingresó en el formulario de compra, con el número de pedido, transportista, seguimiento y enlace al estado del envío.
- Alternar gráficos de torta y barras por unidades o ingresos; seleccionar un producto para inspeccionar fechas, pedidos, cantidades, importes y participación. Incluye productos con cero ventas.
- Filtrar estadísticas por 30 días, 90 días o todo el historial.
- Recuperar su contraseña por email sin asistencia del desarrollador.

El total de ventas del gráfico excluye envío, comisiones, pagos pendientes, rechazados, disputados, contracargos y pedidos con reembolsos incluso parciales. El período se aplica a la fecha de creación del pedido; no representa un balance contable. Los pendientes de envío se cuentan sobre todo el historial.

El catálogo usa disponibilidad manual (publicado/oculto), no inventario de unidades. No hay facturación, reembolsos desde el panel ni importación automática del despacho a MiCorreo en este alcance.

### Ofertas, combos y campañas

La pestaña **Historial** conserva versiones al crear, editar y eliminar campañas o combos. Permite filtrar por tipo, buscar por nombre, inspeccionar toda la configuración, reutilizarla como una copia desactivada y eliminar una versión específica. Las versiones existentes al estrenar esta función se registran como “Registro inicial”; no se reconstruyen cambios anteriores.

Eliminar una campaña o un combo lo retira de la tienda y de la lista actual, pero conserva su configuración en el historial. Borrar una versión del historial no modifica la configuración vigente ni los pedidos. Reutilizar abre un formulario con textos, imagen, colores, fechas, productos, cantidades y descuento conservados; revisar fechas y precios actuales antes de activar y guardar. Los combos usan los precios y medidas actuales de sus componentes.

En el panel privado, **Ofertas y ocasiones** permite:

- Crear descuentos de 0 a 90%, para productos seleccionados o todo el catálogo, incluidos combos.
- Armar combos con al menos dos productos individuales diferentes (hasta 20 unidades). El precio de lista suma sus componentes y se actualiza cuando cambia el catálogo; la cotización suma sus pesos y medidas. Ocultar un componente retira el combo de la tienda. Para ocultar o modificar el combo, usar esta sección.
- Guardar campañas desactivadas, activarlas manualmente o programar inicio y fin en horario de Argentina. Un fin es exclusivo: al llegar esa hora, la campaña deja de aplicar.
- Elegir un estilo inicial: personalizado, Black Friday, Día de la Madre o Navidad y Año Nuevo. Son plantillas editables; no se activan solas ni suponen fechas.
- Personalizar anuncio superior, título, descripción, botón a la tienda, colores principal/fondo/texto e imagen del banner. La vista previa permite revisar antes de guardar.

Si hay varias promociones, se aplica el mayor porcentaje sobre el precio de lista; **no se acumulan** descuentos, tampoco sobre combos. Para la apariencia gana la campaña activa de mayor prioridad; en empate, el identificador ordenado de forma estable. La campaña visual y el descuento pueden configurarse por separado.

Los precios efectivos se calculan en el servidor para catálogo, cotización y checkout. Si una campaña vence o cambia el catálogo después de cotizar, el checkout pide recalcular. Los pedidos existentes conservan sus importes. Las páginas abiertas se actualizan al próximo límite de campaña conocido o al volver a la pestaña; no hay polling periódico.

La tienda empieza por “Bienestar que te acompaña”, seguido de las campañas activas, filtros y grilla de productos. Debajo del catálogo aparece el carrusel de los más comprados en los últimos **30 días móviles**, usando solo pedidos con estado pagado y fecha de creación en ese período. Solo muestra productos actualmente disponibles; sin ventas informa que todavía no hay favoritos. El gráfico cuenta cada combo como un producto, sin duplicar sus componentes. Los datos personales y el detalle de pedidos están restringidos al panel.

## Alta de la dueña

1. Configurar `OWNER_EMAIL`, `MAIL_FROM` y el servidor SMTP en el archivo privado `.env`.
2. Ejecutar `npm run owner:invite`. Envía el enlace al email autorizado; no imprime contraseñas ni enlaces de recuperación.
3. La dueña abre el enlace y crea una contraseña de al menos 12 caracteres.
4. Para recuperarla, usa “Crear o recuperar mi contraseña” en /admin.

Los enlaces vencen a los 30 minutos y son de un solo uso. Cambiar contraseña revoca todas las sesiones. Cambiar `OWNER_EMAIL` en la configuración revoca la cuenta anterior al reiniciar. En producción se requieren HTTPS y cookies Secure; las sesiones duran 8 horas. El email confirmado por Juan el 7 de octubre de 2026 es `nutrivaninaalaniz@gmail.com`, configurado localmente como `OWNER_EMAIL` para acceso y avisos de ventas. Falta configurar el remitente/SMTP y enviar la invitación; conocer el email no crea una contraseña ni habilita el envío de mensajes. La inspección mantiene su cuenta de prueba separada.

## Pagos

La sección privada **Pagos** ofrece **Conectar Mercado Pago**. Redirige a la autorización oficial y, únicamente después de validar la respuesta, muestra **MercadoPago conectado**, el logo oficial, la cuenta, el ambiente y la fecha de verificación. El parámetro de retorno en la URL no acredita una conexión: el estado se consulta en la base. La contraseña de Mercado Pago nunca pasa por esta aplicación.

Configuración inicial de la aplicación en el servidor:

- `MP_CLIENT_ID` y `MP_CLIENT_SECRET`: credenciales OAuth de la aplicación registrada en Mercado Pago, con autorización de lectura/escritura y `offline_access` para renovar tokens. Habilitar PKCE.
- `PAYMENT_ENCRYPTION_KEY`: 32 bytes aleatorios, codificados como 64 caracteres hexadecimales, generados y guardados en el gestor de secretos del servidor. Respaldar esta clave separadamente de la base; no cambiarla sin reconectar la cuenta. Nunca versionarla ni ponerla en `VITE_*`.
- `MP_WEBHOOK_SECRET`: firma del webhook.
- `MP_LIVE_MODE=false` para pruebas; habilitar modo real solo al verificar credenciales y flujo productivo.
- `APP_URL`: dominio HTTPS público del sitio.
- Registrar exactamente la URL de retorno `https://DOMINIO/api/payments/mercadopago/callback` en la aplicación de Mercado Pago.
- Webhook de tipo **payment** en `https://DOMINIO/api/webhooks/mercadopago`.
- Después de configurar, la dueña entra a `/admin?section=pagos` y autoriza su cuenta argentina. La opción **Verificar conexión** consulta al proveedor. Desconectar elimina las credenciales locales; la revocación del permiso en el proveedor se gestiona desde Mercado Pago.

Los tokens de acceso y renovación se guardan cifrados con AES-256-GCM, únicamente en la base del backend. La autorización usa PKCE S256, estado de un solo uso de diez minutos, cookie HttpOnly y vinculación a la sesión de la administradora. La renovación ocurre cuando se necesita usar un token próximo a vencer, sin nuevo polling. Un cambio de ambiente o una verificación fallida exige reconectar; no se admiten tokens de pruebas para cobros reales. El checkout toma las credenciales de la cuenta autorizada, sin que Vanina copie tokens.

Las variables anteriores `MP_ACCESS_TOKEN` / `MP_COLLECTOR_ID` siguen siendo compatibles para instalaciones previas. Dejarlas vacías al usar OAuth. Si existe un vendedor fijo configurado, debe coincidir con la cuenta autorizada. La desconexión se rechaza si hay credenciales heredadas o pedidos pendientes recientes. Se conserva el historial de pedidos, pero sin credenciales los avisos posteriores del proveedor no pueden verificarse: reconciliar los pendientes antes de desconectar.

Estado local: sin aplicación OAuth ni dominio configurados, el botón aparece deshabilitado con una explicación. No hay una cuenta real conectada y el modo inspección nunca carga credenciales. La conexión a la cuenta por sí sola tampoco configura SMTP ni Correo.

Se crea una preferencia Checkout Pro con precios consultados en la base, más el costo de envío. La cotización se guarda del lado del servidor; se rechazan cambios de código postal, productos modificados y cotizaciones vencidas. Una clave de idempotencia evita duplicar pedidos por reintentos del navegador.

Volver desde Mercado Pago no marca una venta como pagada. El servidor verifica la firma de la notificación y consulta el pago en la API oficial: ID, vendedor, moneda ARS, importe, ambiente y referencia deben coincidir. Las notificaciones repetidas no duplican venta ni aviso; actualizaciones antiguas no revierten un estado más reciente.

Un segundo pago aprobado distinto para el mismo pedido requiere conciliación manual en Mercado Pago y devuelve 409. Ante pérdida prolongada de notificaciones se deben revisar/reemitir desde Mercado Pago: no hay un reconciliador automático contra todo el historial del proveedor.

Los avisos por email se guardan en una cola en la base configurada antes de enviarse, se intentan al recibir la confirmación y se reintentan en segundo plano cada 5 minutos. Hay retroceso ante fallos y reintento manual desde el panel. Son 8.640 pasadas máximas del temporizador por 30 días; no hay polling periódico de la interfaz. SMTP no garantiza entrega exactamente una vez ante una caída entre aceptación del mensaje y persistencia del resultado; se usa un Message-ID estable para ayudar a deduplicar.

Los avisos de despacho al comprador tienen una cola separada, `shipment_notifications`, procesada por el mismo temporizador. Se registra el despacho y su aviso en una sola transacción: si no puede guardarse el aviso, tampoco se marca el despacho. El destinatario se toma del pedido guardado, nunca del formulario de administración. El panel distingue el aviso de venta a Vanina del aviso de despacho al comprador y permite reintentar ambos. Los pedidos despachados antes de esta función no generan emails retroactivos. La nueva tabla se crea sin modificar los registros existentes.

## Turnos sin registro

El público reserva desde `/turnos`: servicio, fecha, horario, nombre, email, teléfono y consentimiento para gestionar la reserva. Recibe un enlace privado para ver, cambiar o cancelar sus consultas, sin contraseña ni cuenta. El identificador secreto viaja en el fragmento del enlace y en cuerpos POST; la tabla de packs guarda su hash. No se solicitan datos clínicos. El enlace concede acceso a la reserva: compartirlo solo con su titular.

En **Turnos** del panel, Vanina puede:

- Consultar reservas por fecha, nombre, email, teléfono, servicio y estado; alternar lista o calendario e inspeccionar detalles.
- Configurar servicios, duración, precio total y cantidad de consultas. Se preparan borradores de tratamiento con **3 consultas iniciales**, control individual y seguimiento con cantidad pendiente. Todos comienzan desactivados; no se inventan precios ni horarios publicados.
- Configurar hasta tres franjas por día, modalidad/lugar, anticipación mínima, horizonte de reservas y plazo de cancelación. Pausar la agenda y bloquear excepciones sin eliminar turnos existentes.
- Marcar consultas atendidas, canceladas o ausentes y registrar manualmente si recibió el pago del pack. Esta acción **no cobra en Mercado Pago**.
- Copiar el enlace público, descargar su QR o imprimirlo. El QR se genera localmente, sin servicios externos. En inspección apunta a localhost y no sirve para pacientes en otros teléfonos: generar el definitivo en el dominio publicado.

El pack reserva inicialmente una consulta y permite agendar las restantes desde el mismo enlace. Cada reserva conserva el servicio, duración, precio y cantidad originales aunque luego se edite el catálogo. Cancelar devuelve una consulta disponible; atendidas e inasistencias consumen una. Las reprogramaciones y cancelaciones públicas respetan el plazo configurado; la administradora puede cancelar desde la agenda. No se pueden marcar consultas futuras como atendidas/ausentes.

Los horarios se interpretan en **America/Argentina/Buenos_Aires (UTC−3)**. La comprobación de disponibilidad y la escritura son transaccionales tanto en SQLite como PostgreSQL; reservas superpuestas se rechazan, incluso con distintas duraciones. Una clave de solicitud evita duplicados al reenviar un formulario. Cambios y avisos de email quedan guardados en la misma transacción; `booking_notifications` usa la cola existente cada cinco minutos, sin sumar otro temporizador. Sin SMTP, los avisos quedan pendientes; la reserva y su enlace se muestran en pantalla igualmente.

Desde el 19/10/2026, las nuevas solicitudes requieren un precio mayor a cero y quedan **pendientes de pago**: retienen el horario 30 minutos. El backend confirma al verificar el pago; un regreso del proveedor o una declaración del paciente nunca acredita dinero. Al vencer, el horario se libera en las consultas de disponibilidad, sin temporizadores nuevos. Si llega un pago tarde, se comprueba nuevamente la disponibilidad: si otra reserva o bloqueo ocupa el horario, queda **pago recibido / requiere otro horario** y el paciente elige uno nuevo desde su pack, sin otro cobro. Las reservas anteriores se conservan.

Argentina admite Mercado Pago con cuenta conectada, HTTPS y webhook firmado `/api/webhooks/mercadopago/consultations`; también hay verificación manual desde la reserva/panel. Para servicios **online**, se mantienen PayPal en USD desde otros países y Prex Uruguay hacia Prex Argentina en ARS. Prex confirma solo después de que Vanina comprueba la recepción. Sin conexión/precio no se puede completar un cobro. Las consultas restantes del pack requieren pago registrado. No hay recordatorios automáticos ni recurrencias; la agenda pública comienza pausada.

En inspección local existe **Simular pago aprobado · sin dinero real**, implementado solo mediante la inyección explícita del entorno de inspección y bloqueado en producción. Se registra como `inspection`, nunca como un pago Mercado Pago, no genera correo ni llama a proveedores. La configuración local solicitada es lunes a viernes 09–13 y 15–18; el pack de tres consultas cuesta $50.000 ARS, USD 32,15 y UYU 1.324,76 orientativos, editables en Servicios y packs. Las equivalencias iniciales se consultaron el 19/10/2026; no se actualizan automáticamente. Los precios de solicitudes ya iniciadas quedan congelados.

## Historial y pagos internacionales

**Pagos → Historial de pagos** consulta los movimientos de la cuenta Mercado Pago autorizada, con fechas, estado, paginación de 20 registros y detalles desplegables. Incluye cobros ajenos a esta web, muestra moneda e importes brutos y no convierte movimientos en ventas locales. Se actualiza al abrir, filtrar o presionar Actualizar; sin polling.

**Pagos → Pagos internacionales** configura PayPal y Prex para consultas/packs online. Las credenciales PayPal se verifican por OAuth de aplicación y se cifran en la base; la conexión requiere una aplicación de la cuenta y configuración inicial HTTPS/cifrado. PayPal exige cuenta Business para esta integración en producción. Prex Argentina se configura como transferencia con recepción manual, sin simular una API de cobros. El país se detecta desde un proxy autenticado; no hay selector. Argentina usa Mercado Pago/ARS; Uruguay Prex Argentina con ARS a recibir y referencia UYU; otros países PayPal/USD. Sin detección segura se pide contactar a Vanina. El Worker preparado está en `scripts/country-edge-worker.js`, pendiente de configurar al publicar. Cada proveedor incluye un tutorial colapsado con pasos, ayuda para errores, enlaces oficiales y fecha de revisión; su contenido vive en `src/features/admin/PaymentSetupGuides.jsx`.

En **Cobros de consultas y packs**, Vanina inspecciona los importes por moneda, verifica Mercado Pago/PayPal o confirma transferencias Prex recibidas. El botón de reservar abre directamente Mercado Pago o PayPal en la misma pestaña. Al regresar, el servidor verifica el pago (y captura PayPal aprobado), recupera el enlace privado mediante una cookie HttpOnly y muestra la reserva. También hay verificación manual desde la reserva o el panel; no hay webhook PayPal ni conciliación periódica. Uruguay muestra instrucciones Prex y espera confirmación de recepción. La inspección abre una pantalla explícita de pago simulado; no crea un checkout real. Cada verificación consulta también la captura para detectar devoluciones totales o parciales; revisar disputas directamente en PayPal. La confirmación guarda avisos al paciente y a la dueña en la cola SMTP existente, excepto simulaciones locales. Prex nunca se confirma por declaración del paciente o regreso desde un proveedor.

Configuración, límites, países y fuentes: [docs/PAGOS_INTERNACIONALES.md](docs/PAGOS_INTERNACIONALES.md). No hay cuentas reales conectadas ni cobros externos validados. La preparación de Supabase incluye la migración 003, pendiente de aplicar en el proyecto remoto.

## Correo Argentino

Origen definido por Juan: **5881**. Configurar `CORREO_API_USER`, `CORREO_API_PASSWORD`, `CORREO_CUSTOMER_ID` y `CORREO_ENV` (test/production).

Las credenciales de integración se solicitan a Correo para cada ambiente. La contraseña de la cuenta MiCorreo no sustituye automáticamente esas credenciales. El customerId identifica la cuenta de la dueña.

La dueña debe crear y validar su cuenta [MiCorreo](https://www.correoargentino.com.ar/MiCorreo/public/faqs), completar datos y domicilio de origen con CP 5881, y solicitar acceso a la API MiCorreo mediante el contacto comercial de Correo. Su documentación indica que la integración es gratuita y cada envío se paga por separado. El [manual de API MiCorreo](https://www.correoargentino.com.ar/MiCorreo/public/img/pag/apiMiCorreo.pdf) distingue las credenciales de integración del usuario final. No se crearon cuentas externas ni se solicitaron credenciales en nombre de Vanina.

La cotización real usa /token y /rates, código postal de destino de 4 dígitos, entrega a domicilio y dimensiones/peso. No hay tabla de precios estimada ni envío gratuito de respaldo. La cotización caduca a los 10 minutos o antes si vence la respuesta de Correo.

Para múltiples productos se calcula un paquete conservador apilado: suma de altos + 2 cm, máximo ancho/largo + 2 cm y peso de unidades + 100 g de embalaje (configurable). Vanina debe cargar medidas con protección por unidad y validar que ese embalaje representa sus productos. Se rechazan paquetes mayores a los límites documentados de la API (25 kg o cualquier dimensión de más de 150 cm), y carritos de más de 20 unidades. Esta regla no contempla cadena de frío ni formatos especiales.

El comprador paga producto + tarifa de envío en Mercado Pago. **La cotización y el cobro no generan una etiqueta ni pagan el servicio a Correo**: Vanina prepara y abona el envío en MiCorreo y registra el seguimiento desde el centro de comando.

## Compilación, pruebas y publicación pendiente

```sh
npm test
npm run build
npx playwright install chromium
npm run test:e2e
npm audit
git diff --check
```

Las pruebas de navegador levantan un servidor aislado en 127.0.0.1:4173 con fixtures identificados como pruebas. Usan directorio temporal y no envían emails, cobran ni cotizan externamente.

Para servir el build: `npm run build` y `npm start`. En un servidor real: `NODE_ENV=production`, `APP_URL=https://DOMINIO`, reverse proxy TLS y directorio de datos persistente con copias de seguridad. `TRUST_PROXY_HOPS` debe representar exclusivamente proxies confiables; por defecto es 0. Mantener la API accesible solo mediante el proxy si se configura esa confianza.

Respaldar SQLite con la API de backup o una copia consistente con el servicio detenido; copiar también uploads. No copiar solo el archivo .sqlite en caliente ignorando el WAL. Documentar retención y acceso a datos de clientes en el despliegue.

Pendiente para habilitar ventas reales: remitente/SMTP verificado, aplicación Mercado Pago, credenciales MiCorreo, dominio/hosting, conexión de Supabase y catálogo real. El email de la dueña ya fue informado. Validar una compra de sandbox y un envío con las cuentas correspondientes antes de habilitar producción. Las pruebas actuales usan proveedores simulados, no acreditan una compra ni cotización con cuentas reales. No se realizó deploy, commit, push ni modificación de producción en esta entrega.

## Fuentes de los adaptadores

Consultadas el 7 de octubre de 2026:

- [Mercado Pago: preferencias Checkout Pro](https://www.mercadopago.com.ar/developers/es/reference/online-payments/checkout-pro-preferences/create-preference/post)
- [Mercado Pago: notificaciones y firma](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro-preferences/payment-notifications)
- [Mercado Pago: autorización OAuth y PKCE](https://www.mercadopago.com.ar/developers/en/docs/security/oauth/creation)
- [Mercado Pago: renovación OAuth](https://www.mercadopago.com.ar/developers/en/docs/security/oauth/renewal)
- [Logo de Mercado Pago: recurso del ejemplo oficial](https://github.com/mercadopago/fastpayments_example/blob/main/assets/mp_logo.svg)
- [Correo Argentino: API MiCorreo](https://www.correoargentino.com.ar/MiCorreo/public/img/pag/apiMiCorreo.pdf)
- [Nodemailer: SMTP](https://nodemailer.com/smtp)

# Pagos de consultas online

Alcance confirmado por Juan el 7/10/2026: internacional solo para consultas/packs online; Prex receptora es **Argentina**, los pacientes pueden enviar desde Prex Uruguay. Vanina ya tiene PayPal, pero no se recibieron credenciales ni se verificó su habilitación comercial. No se crearon cuentas ni se realizaron cobros reales.

## Mercado Pago: historial

Actualización 19/10/2026: Mercado Pago también cobra consultas y packs en ARS desde Argentina. Las nuevas reservas se retienen 30 minutos y solo se confirman al acreditar el pago. El precio del pack de tres consultas en inspección es $50.000 ARS; se puede editar y cada solicitud conserva el precio original.

Se usa Checkout Pro Preferences, sin envío, con referencia al cobro de consulta. Configurar HTTPS, cuenta receptora y secreto del webhook `/api/webhooks/mercadopago/consultations`. Se valida firma, se consulta el pago al proveedor y se contrastan ID, referencia, receptor, moneda, importe y ambiente. También se permite verificar desde el enlace privado o el panel. El retorno `/turnos/pago?booking=<id>` verifica el pago con el proveedor. No confía en parámetros de éxito: recupera la capacidad privada desde una cookie HttpOnly/Secure/SameSite=Lax, limitada a `/api/bookings/payment-return` y dos horas. El token privado nunca viaja al proveedor. Sin cookie se pide abrir el enlace privado en el navegador original. Un pago tardío nunca pisa otra reserva: si el horario ya está ocupado, el pack queda pagado y permite elegir otro. Una solicitud vencida no crea nuevos intentos de pago. No se agregaron tablas ni migraciones.

Sección Pagos, tras autorización de la cuenta argentina: consulta `/v1/payments/search` con collector_id, rango de creación UTC−3, estado y offset/limit. Hasta 20 resultados por página y 500 páginas, período máximo de un año. Para un período con más de 10.000 resultados, reducir fechas. Se validan vendedor, ambiente, fechas e importes antes de devolver resultados. Nunca se entregan tokens o datos del pagador al navegador. Solo se vincula un pedido si coinciden referencia **y** payment_id confirmado.

La lista contiene los cobros recibidos por esa cuenta, incluso fuera de esta tienda. Es una consulta del proveedor, no un libro contable ni una importación de ventas. No se modifica el stock, estado de pedidos ni gráficos. Sin cuenta autorizada no se muestran movimientos ficticios.

## PayPal

1. Publicar el backend con HTTPS y `PAYMENT_ENCRYPTION_KEY` estable de 32 bytes aleatorios expresados en 64 caracteres hexadecimales. Resguardar la clave junto con los respaldos de base; no ponerla en variables VITE ni en el repositorio.
2. En PayPal Developer, crear una aplicación de la cuenta receptora. La guía REST oficial exige una cuenta Business para integraciones en producción y pruebas fuera de EE. UU.; disponer de una cuenta personal no alcanza. Para una tienda propia se usa integración directa; no se simula el OAuth de incorporación de vendedores de un partner aprobado.
3. En Pagos → PayPal → Conectar, cargar Client ID, Client Secret, ID de comercio receptor y ambiente. No se solicita contraseña ni se escriben claves en logs. La verificación OAuth valida la aplicación; no demuestra por sí sola que un cobro real haya llegado. El receptor se exige también en la orden y se contrasta al capturar.
4. En Turnos → Servicios y packs, marcar el servicio online y definir su precio total en USD. No se convierte ARS ni se inventa una tasa. Solo las reservas nuevas reciben esta configuración; cada pack conserva una copia de precios/monedas.
5. Prueba completa con cuentas sandbox de comprador/vendedor: reservar desde una conexión cuyo país detectado sea distinto de Argentina/Uruguay, verificar la redirección directa a PayPal, autorizar y regresar para la verificación/captura automática. Contrastar captura, receptor, USD, importe, estado y emails. Luego repetir control de habilitación con credenciales live antes de ofrecer cobros reales.

La aplicación crea órdenes v2 CAPTURE, con importe calculado en servidor, cuenta receptora y referencia única al cobro. Captura únicamente después de consultar la orden y contrastar todos esos datos. Cada creación/captura usa un PayPal-Request-Id estable; no se inicia otra orden automáticamente tras cinco horas si se perdió la respuesta inicial. El enlace privado del paciente nunca se envía a PayPal. La URL de retorno usa el ID opaco de reserva y verifica/captura desde servidor antes de mostrar su estado. Un parámetro de éxito no acredita un pago.

La verificación se hace al regresar del proveedor, o por acción del paciente o de Vanina. No hay webhooks PayPal, sincronización de toda la cuenta ni temporizadores nuevos. Si el paciente no regresa, Vanina puede completar un pago autorizado con Verificar en PayPal; una orden sin aprobación sigue pendiente. Devoluciones totales/parciales se detectan al verificar la captura y el pack se marca para revisión. Las disputas se revisan en PayPal; el listado local no sustituye su historial completo.

Para evitar perder conciliación, una conexión con cobros vinculados no puede eliminarse; con cobros reales tampoco se permite cambiar de comercio/ambiente desde el panel. Se pueden renovar credenciales del mismo comercio. Si solo hay pruebas, se permite pasar a live: sus registros sandbox se conservan identificados, pero ya no se verifican usando la cuenta live. En NODE_ENV=production no se ofrecen nuevos cobros sandbox al público. Un intento pendiente o vencido que requiera cambio de proveedor debe revisarse antes de crear otro cobro. No se borran intentos automáticamente ni se aceptan precios del cliente.

## Prex Argentina para pacientes de Uruguay

Configurar en Pagos el **nombre completo** y **número de cuenta Prex Argentina** de Vanina. No se necesita ni se solicita la clave de Prex. Habilitar la opción una vez comprobados esos datos. El paciente detectado en Uruguay verá directamente las instrucciones después de elegir horario y completar sus datos; no se publica la cuenta en la portada.

Se muestra una referencia UYU editable y, por separado, el importe exacto del pack en ARS que debe recibir Vanina, según los precios guardados al reservar. UYU no es una moneda de cobro en la cuenta argentina. El owner confirmó mantener esta conversión y la comprobación manual el 19/10/2026. El paciente revisa en la app Prex la disponibilidad, moneda de destino, cambio y comisiones vigentes; no se calcula una tasa ni se garantiza una comisión desde esta web. Si el corredor o la cuenta no admiten la operación/moneda, coordinar con Vanina antes de transferir. El sitio no hace una transferencia ni descuenta comisiones por sí mismo.

En Cobros de consultas y packs, Vanina despliega el cobro pendiente, comprueba importe/moneda en su app Prex, ingresa el número de operación recibida y confirma. Se registra el pago y se encolan emails para ambas partes en una transacción. Si la verificación llega tras vencer los 30 minutos de retención, puede ser necesario elegir otro horario. El paciente no puede marcar su pack pagado ni acreditar una transferencia subiendo una imagen. Los datos receptores quedan guardados en cada intento para que un cambio posterior de cuenta no altere instrucciones ya entregadas.

## País por IP

El país de conexión determina automáticamente el medio y moneda; no es prueba de domicilio ni nacionalidad. No se ofrece selector. Sin detección autenticada el checkout queda inhabilitado y se indica contactar a Vanina; no se supone Argentina. Solo la inspección local usa AR fijo y lo informa como prueba. La tienda física mantiene Correo Argentino y no agrega envíos internacionales.

`COUNTRY_EDGE_KEY` es opcional, secreto de servidor y de un proxy confiable, mínimo 32 caracteres aleatorios. El borde debe obtener el país de su propia geolocalización (por ejemplo `request.cf.country` en un Worker Cloudflare), **sobrescribir** `cf-ipcountry` y `x-nutriapp-edge-key`, y reenviar al origen con HTTPS. Nunca copiar el país o la clave de headers aportados por el visitante. Restringir el origen al proxy y no reflejar/loguear la clave. La API usa comparación de secreto en tiempo constante e ignora cabeceras sin autenticación. Activar solo CF-IPCountry no alcanza: la aplicación no lo acepta de cualquier cliente.

El Worker `scripts/country-edge-worker.js` está preparado para una ruta Cloudflare del dominio público `/api/*`, frente al origen existente. Configurar la misma clave como secreto del Worker y del backend, con APP_URL igual al dominio público HTTPS. Sobrescribe cabeceras, no almacena IP, devuelve no-store y evita seguir redirecciones que puedan filtrar la clave. Falta desplegar/configurar esa infraestructura: sin ella no hay geolocalización pública activa ni checkout automático habilitado. La clave no se entrega al navegador. No se almacena la IP, no se solicita GPS, no se llama a una API de geolocalización por visitante y no se agrega polling. Una VPN o viaje puede alterar el país detectado. Solo se muestran medios habilitados y con precio: Argentina usa Mercado Pago; Uruguay usa Prex Argentina para servicios online; otros países PayPal según disponibilidad del proveedor.

## Precios iniciales autorizados el 19/10/2026

Pack de tres consultas en la base local de inspección: ARS 50.000, USD 32,15 y UYU 1.324,76 orientativos. Base dólar blue vendedor ARS 1.555/USD; cruce BROU dólar billete vendedor UYU 41,20/USD. Fórmulas: 50.000 / 1.555 = 32,15434… USD; 50.000 / 1.555 × 41,20 = 1.324,75884… UYU; redondeo final a dos decimales. No incluyen comisiones ni fijan la cotización de Prex. Los campos quedan independientes y editables; no hay actualizaciones periódicas ni cambios en reservas anteriores.

Fuentes consultadas: [blue vendedor](https://dolarblue.ar/), [BROU](https://www.brou.com.uy/cotizaciones), [Prex Argentina: moneda de recepción desde Uruguay](https://www.prexcard.com.ar/centro-de-ayuda/ingresos-y-retiros/ingresar-dinero/ingresar-dinero-desde-otras-cuentas-prex/en-que-moneda-recibo-el-dinero-si-me-transfieren-desde-otra-cuenta-prex), [Cloudflare Request.cf](https://developers.cloudflare.com/workers/runtime-apis/request/). No se cotiza ni se opera en el mercado de cambios desde la web.

## Persistencia y validación

SQLite local agrega tres tablas sin borrar datos. Supabase aplica `003_consultation_payments.sql`, con RLS y dentro del esquema privado `nutriapp`; `npm run db:setup` incluye las tres migraciones. No se conectó Supabase remoto. Las credenciales PayPal se cifran AES-256-GCM con contexto propio; Prex almacena solo datos receptores/instrucciones. Todas las rutas de configuración/listados/confirmaciones requieren la sesión de la dueña. Las rutas de pacientes requieren su token privado.

Las pruebas usan datos y proveedores simulados, y PostgreSQL local descartable: no acreditan conexión a cuentas reales, geolocalización de una IP pública o recepción de emails externos. Inspección bloquea todas las llamadas externas de pagos y ofrece un botón explícito de simulación local que no mueve dinero ni genera emails. SMTP y configuración de la infraestructura siguen pendientes para publicación.

Fuentes Mercado Pago consultadas para consultas con pago el 19/10/2026: [crear una preferencia](https://www.mercadopago.com.ar/developers/en/reference/online-payments/checkout-pro-preferences/create-preference/post), [notificaciones](https://www.mercadopago.com.ar/developers/en/docs/checkout-pro-preferences/additional-content/notifications/introduction?scope=prod). Las pruebas de proveedor son simuladas; sigue pendiente validar un checkout sandbox completo con cuenta de Vanina y luego la habilitación live.

## Fuentes oficiales consultadas el 7/10/2026

Los tutoriales de `src/features/admin/PaymentSetupGuides.jsx` se mantienen cerrados inicialmente y cubren configuración, ensayo y comprobación de recepción. Los nombres de menús se presentan con alternativas de idioma/versiones, sin afirmar haber ingresado a cuentas privadas de Vanina. En Prex se diferencia número de cuenta de CVU/alias/tarjeta, receptor argentino de emisor uruguayo, y costos de recibir de costos de enviar. No se fija una comisión o cambio permanente: la página de promoción abierta el 7/10/2026 mostraba vencimiento 31/12/2026, mientras el resultado del buscador aún decía 30/09/2026. Se priorizó la página abierta y se enlazaron condiciones/cartilla para verificar al operar.

- [PayPal: requisitos Business y credenciales REST](https://developer.paypal.com/api/get-started/)
- [PayPal Argentina: pasar a Empresas](https://www.paypal.com/ar/cshelp/article/how-do-i-upgrade-or-downgrade-my-paypal-account-help339)
- [PayPal Argentina: encontrar ID del establecimiento](https://www.paypal.com/ar/cshelp/article/how-do-i-find-my-secure-merchant-id-on-my-paypal-account-help538)
- [PayPal: cuentas Sandbox comprador y vendedor](https://developer.paypal.com/sandbox-testing/accounts)
- [PayPal: errores por credenciales o ambientes mezclados](https://developer.paypal.com/checkout/troubleshooting)
- [Prex Argentina: ubicación del número de cuenta en la app](https://www.prexcard.com.ar/centro-de-ayuda/ingresos-y-retiros/ingresar-dinero/ingresar-dinero-desde-otras-cuentas-prex/donde-encuentro-mi-numero-de-cuenta-de-prex)
- [Prex Argentina: costos de recibir transferencias](https://www.prexcard.com.ar/centro-de-ayuda/ingresos-y-retiros/ingresar-dinero/ingresa-dinero-a-tu-prex/tiene-algun-costo-recibir-dinero-en-mi-cuenta)
- [Prex Uruguay: cartilla de cargos](https://www.prexcard.com/html/cartillaUso)
- [Prex Uruguay: condiciones de promoción para Argentina](https://www.prexcard.com/beneficiosprex?beneficio=696)

- [Mercado Pago: búsqueda de pagos](https://www.mercadopago.com.ar/developers/es/docs/subscriptions/additional-content/payment-management)
- [PayPal: integración de una tienda](https://developer.paypal.com/studio/checkout/standard/getstarted)
- [PayPal: API Orders v2](https://developer.paypal.com/api/orders/v2)
- [PayPal: monedas admitidas, sin ARS](https://developer.paypal.com/api/codes/currency/)
- [PayPal: incorporación de vendedores para partners](https://developer.paypal.com/docs/multiparty/seller-onboarding/build-onboarding/)
- [Prex Argentina: transferencias desde el exterior](https://www.prexcard.com.ar/centro-de-ayuda/transferencias/transferencias-internacionales/puedo-recibir-plata-desde-el-exterior)
- [Prex Argentina: datos para recibir de Uruguay](https://www.prexcard.com.ar/centro-de-ayuda/ingresos-y-retiros/ingresar-dinero/ingresar-dinero-desde-otras-cuentas-prex/que-datos-tengo-que-compartir-para-que-me-envien-dinero-desde-otra-cuenta-prex)
- [Cloudflare: país por IP](https://developers.cloudflare.com/network/ip-geolocation/)

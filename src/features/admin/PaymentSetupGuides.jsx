import { BookOpen } from 'lucide-react';

const sources = {
  paypalStart: 'https://developer.paypal.com/api/get-started/',
  paypalDashboard: 'https://developer.paypal.com/dashboard/applications/live',
  paypalBusiness:
    'https://www.paypal.com/ar/cshelp/article/how-do-i-upgrade-or-downgrade-my-paypal-account-help339',
  paypalMerchant:
    'https://www.paypal.com/ar/cshelp/article/how-do-i-find-my-secure-merchant-id-on-my-paypal-account-help538',
  paypalSandbox: 'https://developer.paypal.com/sandbox-testing/accounts',
  paypalCurrency: 'https://developer.paypal.com/api/codes/currency/',
  paypalTroubleshooting: 'https://developer.paypal.com/checkout/troubleshooting',
  prexAccount:
    'https://www.prexcard.com.ar/centro-de-ayuda/ingresos-y-retiros/ingresar-dinero/ingresar-dinero-desde-otras-cuentas-prex/donde-encuentro-mi-numero-de-cuenta-de-prex',
  prexRecipient:
    'https://www.prexcard.com.ar/centro-de-ayuda/ingresos-y-retiros/ingresar-dinero/ingresar-dinero-desde-otras-cuentas-prex/que-datos-tengo-que-compartir-para-que-me-envien-dinero-desde-otra-cuenta-prex',
  prexReceiving:
    'https://www.prexcard.com.ar/centro-de-ayuda/ingresos-y-retiros/ingresar-dinero/ingresa-dinero-a-tu-prex/tiene-algun-costo-recibir-dinero-en-mi-cuenta',
  prexSending: 'https://www.prexcard.com/html/cartillaUso',
  prexPromotion: 'https://www.prexcard.com/beneficiosprex?beneficio=696',
  prexHelp: 'https://www.prexcard.com.ar/centro-de-ayuda',
};

function OfficialLink({ source, children }) {
  return (
    <a href={sources[source]} target="_blank" rel="noopener noreferrer">
      {children}
      <span className="sr-only"> (abre una pestaña nueva)</span>
    </a>
  );
}

function Guide({ name, children }) {
  return (
    <details className="payment-setup-guide">
      <summary>
        <BookOpen size={20} aria-hidden="true" />
        <span>
          Tutorial: configurar {name}
          <small>Pasos, comprobaciones y ayuda</small>
        </span>
      </summary>
      <div className="payment-guide-content">
        <p className="muted">
          Guía revisada el <time dateTime="2026-10-07">7 de octubre de 2026</time> con fuentes
          oficiales. Los nombres de los menús pueden variar según la versión o el idioma. Los
          enlaces abren otra pestaña para que puedas conservar esta guía.
        </p>
        {children}
      </div>
    </details>
  );
}

export function PayPalSetupGuide() {
  return (
    <Guide name="PayPal">
      <p className="payment-guide-note">
        <strong>Antes de empezar.</strong> Si el panel muestra que falta HTTPS o cifrado, pedile a
        Juan que complete la preparación del sitio. Esa tarea corresponde al servidor. Podés leer la
        guía, pero el botón de conexión seguirá deshabilitado.
      </p>
      <ol className="payment-guide-steps">
        <li>
          <h4>Revisá el tipo de cuenta</h4>
          <p>
            Para usar esta integración con cobros reales, PayPal requiere una cuenta{' '}
            <strong>Business / Empresas</strong>. Iniciá sesión con la cuenta de Vanina. Si es
            Personal, revisá Configuración → Opciones de cuenta y la opción para pasar a Empresas.
            Completá los datos que PayPal solicite y revisá cualquier aviso de verificación o
            limitación.
          </p>
          <p>
            PayPal permite conservar una cuenta Personal y otra Empresas; la conversión a Empresas
            generalmente no se puede revertir desde el panel. Leé las condiciones antes de elegir.{' '}
            <OfficialLink source="paypalBusiness">
              Ayuda para cambiar el tipo de cuenta
            </OfficialLink>{' '}
            · <OfficialLink source="paypalStart">Requisitos de la integración</OfficialLink>.
          </p>
        </li>
        <li>
          <h4>Buscá el ID de tu comercio</h4>
          <p>
            Dentro de la cuenta PayPal que va a recibir los cobros, entrá a Configuración de la
            cuenta → Perfil de la empresa → Información de la empresa. Copiá el identificador
            llamado <strong>ID del establecimiento</strong>, ID de vendedor o Merchant ID. Pegalo en
            «ID de comercio PayPal» de este panel.
          </p>
          <p>
            Es el identificador del receptor; el email, el enlace PayPal.Me y el Client ID
            pertenecen a otros campos.{' '}
            <OfficialLink source="paypalMerchant">
              Dónde encontrar el ID en PayPal Argentina
            </OfficialLink>
            .
          </p>
        </li>
        <li>
          <h4>Obtené las dos credenciales de la aplicación</h4>
          <p>
            Abrí el{' '}
            <OfficialLink source="paypalDashboard">panel de desarrolladores de PayPal</OfficialLink>{' '}
            con esa misma cuenta. Entrá en <strong>Apps &amp; Credentials</strong> y elegí{' '}
            <strong>Live</strong> para la configuración real. Abrí una aplicación propia o elegí{' '}
            <strong>Create App</strong>; podés llamarla «Consultas Vanina». Si te pide el tipo,
            elegí Merchant para cobrar en tu propio comercio.
          </p>
          <p>
            Copiá el Client ID y revelá el Secret de esa misma aplicación. Pegalos en «Client ID» y
            «Client Secret». Conservá mayúsculas y minúsculas; evitá espacios al principio o al
            final. El Secret es una clave privada: ingresalo únicamente en este panel privado del
            sitio y no lo compartas por chat ni en capturas.{' '}
            <OfficialLink source="paypalStart">Guía oficial de credenciales</OfficialLink>.
          </p>
        </li>
        <li>
          <h4>Hacé coincidir el ambiente y conectá</h4>
          <p>
            Si copiaste credenciales de Live, seleccioná <strong>Producción · cobros reales</strong>{' '}
            en el formulario. El formulario comienza en Sandbox para evitar cobros accidentales.
            Revisá que ID de comercio, Client ID y Secret correspondan a la misma cuenta y ambiente.
            Presioná «Conectar y verificar PayPal».
          </p>
          <p>
            «PayPal conectado» confirma la validación de las credenciales. Comprobá también la
            cuenta receptora y el ambiente que aparecen al lado; todavía falta verificar un cobro
            completo. La opción de pruebas se explica más abajo.
          </p>
        </li>
        <li>
          <h4>Definí el precio del pack en dólares</h4>
          <p>
            En Turnos → Servicios y packs, marcá «Consulta o pack online», completá{' '}
            <strong>USD · cobro por PayPal</strong>, activá el servicio y guardalo. El precio es por
            todas las consultas incluidas. Este sitio usa USD para PayPal y no convierte
            automáticamente el precio en pesos.{' '}
            <OfficialLink source="paypalCurrency">Monedas admitidas por PayPal</OfficialLink>.
          </p>
          <p>
            Los cambios se aplican a reservas nuevas. Para comprobarlos, creá una reserva nueva. El
            país se detecta automáticamente por la conexión. PayPal se ofrece fuera de Argentina y
            Uruguay cuando está configurado y el pack tiene precio en USD.
          </p>
        </li>
        <li>
          <h4>Comprobá el recorrido del pago</h4>
          <p>
            Primero completá el ensayo Sandbox con Juan. Cuando se habilite Live, revisá el primer
            cobro legítimo: el botón de reservar abre PayPal; el paciente autoriza y vuelve al
            sitio, donde se verifica y completa el pago automáticamente. Si queda pendiente, puede
            usar «Ya pagué · verificar estado». Vanina también puede usar «Verificar en PayPal» en
            Cobros de consultas online; ese botón completa el cobro si ya fue autorizado.
          </p>
          <p>
            El resultado esperado es «Pagado» en el panel y una operación correspondiente en PayPal
            con receptor, importe y USD correctos. Las comisiones pueden hacer que el neto
            acreditado sea menor que el importe bruto. Si sigue pendiente, revisá la operación antes
            de pedir otro pago. Los emails requieren que esté configurado el envío de correo del
            sitio.
          </p>
        </li>
      </ol>
      <details className="payment-guide-extra">
        <summary>Cómo ensayar en Sandbox sin dinero real</summary>
        <p>
          Coordiná el ensayo con Juan en el entorno de pruebas del sitio. En PayPal Developer, elegí
          Sandbox. En Testing Tools → Sandbox Accounts vas a encontrar una cuenta Business de prueba
          para vender y una Personal de prueba para comprar.
        </p>
        <p>
          Usá una aplicación Sandbox asociada a esa cuenta Business. Sus Client ID y Secret van con
          el ID de ese vendedor de prueba, nunca con el de tu cuenta real. Para encontrar el ID,
          abrí{' '}
          <a
            href="https://www.sandbox.paypal.com/signin/"
            target="_blank"
            rel="noopener noreferrer"
          >
            PayPal Sandbox
          </a>{' '}
          con los datos de la cuenta Business de prueba y buscá su información de empresa. Podés
          consultar los accesos de prueba en View/Edit Account.
        </p>
        <p>
          Elegí «Sandbox · pruebas» en este panel y pagá con la cuenta Personal de prueba distinta
          del vendedor. Al pasar a Live, reemplazá los tres datos por los reales y cambiá el
          ambiente. El sitio publicado en producción no ofrece cobros Sandbox a pacientes.{' '}
          <OfficialLink source="paypalSandbox">Cuentas de prueba oficiales</OfficialLink>.
        </p>
      </details>
      <details className="payment-guide-extra">
        <summary>Si no conecta o no aparece al paciente</summary>
        <ul>
          <li>
            <strong>Credenciales rechazadas:</strong> volvé a copiar ambos valores desde la misma
            aplicación y comprobá Live/Sandbox.{' '}
            <OfficialLink source="paypalTroubleshooting">
              Ayuda de PayPal para errores de conexión
            </OfficialLink>
            .
          </li>
          <li>
            <strong>No encontrás el ID o la aplicación:</strong> comprobá la cuenta abierta y su
            tipo Empresas; consultá la ayuda oficial antes de reemplazar un dato por otro.
          </li>
          <li>
            <strong>Conecta pero no se ofrece:</strong> revisá servicio online, precio USD, país
            detectado y una reserva nueva. En producción también debe estar en Live.
          </li>
          <li>
            <strong>Dice que no coincide la cuenta o el importe:</strong> conservá la reserva y
            pedile a Juan que revise la conexión. No crees otro cobro para reemplazarlo sin
            comprobar el anterior.
          </li>
        </ul>
      </details>
    </Guide>
  );
}

export function PrexSetupGuide() {
  return (
    <Guide name="Prex Argentina">
      <p className="payment-guide-note">
        <strong>Así funciona.</strong> Vanina recibe en su cuenta Prex Argentina una transferencia
        enviada desde Prex Uruguay. Este panel guarda las instrucciones y permite registrar la
        recepción; la comprobación del dinero la hace Vanina en su app.
      </p>
      <ol className="payment-guide-steps">
        <li>
          <h4>Encontrá tu número de cuenta argentino</h4>
          <p>
            Abrí la app <strong>Prex Argentina</strong> de Vanina. Desde el inicio, tocá tu foto o
            el saludo con tu nombre. También podés entrar por el menú de tres rayas → tu nombre /
            Datos personales, o por Ingresar → transferencias desde otras cuentas Prex. Copiá el
            dato identificado como <strong>número de cuenta Prex</strong>.{' '}
            <OfficialLink source="prexAccount">Dónde encontrarlo, según Prex</OfficialLink>.
          </p>
          <p>
            Este formulario pide ese número de cuenta. Dejá el CVU, alias, DNI y los números de la
            tarjeta fuera de este campo. No hace falta cargar PIN, contraseña ni código de
            seguridad.
          </p>
        </li>
        <li>
          <h4>Completá los datos de quien recibe</h4>
          <p>
            En «Nombre completo del titular», escribí el nombre y apellido registrados en Prex. Pegá
            el número en «Número de cuenta Prex Argentina» y comparalo con la app, incluidos los
            ceros iniciales. Prex indica que para recibir desde Uruguay hay que compartir el nombre
            completo y el número de cuenta.{' '}
            <OfficialLink source="prexRecipient">Datos oficiales del destinatario</OfficialLink>.
          </p>
          <p>
            «Indicaciones adicionales» es opcional. Podés escribir: «Al transferir, comprobá el
            nombre de la destinataria y conservá el número de operación». Esas indicaciones las verá
            el paciente.
          </p>
        </li>
        <li>
          <h4>Habilitá el medio y el precio correcto</h4>
          <p>
            Después de revisar los datos, marcá «Ofrecer transferencia Prex para Uruguay» y presioná{' '}
            <strong>Guardar Prex</strong>. Esperá «Preferencias de Prex guardadas» y el estado
            «Transferencias habilitadas». Esto confirma que se guardó la configuración; todavía no
            verifica tu cuenta con Prex.
          </p>
          <p>
            En Turnos → Servicios y packs, marcá el servicio online y completá su precio total en{' '}
            <strong>pesos argentinos (ARS)</strong>. Guardá el servicio. Prex utiliza ese precio,
            mientras que PayPal utiliza el precio USD. Para revisar un precio nuevo, creá una
            reserva nueva.
          </p>
        </li>
        <li>
          <h4>Revisá lo que verá el paciente de Uruguay</h4>
          <p>
            Desde su reserva, el paciente elige Uruguay y luego «Prex Uruguay → Prex Argentina».
            Comprueba titular, cuenta e <strong>importe a recibir en ARS</strong>. En su app Prex
            debe buscar el envío internacional a una cuenta Prex Argentina e ingresar esos datos;
            los nombres de las opciones pueden variar.
          </p>
          <p>
            Antes de confirmar, debe revisar la destinataria, la moneda de llegada, el cambio y el
            importe final. Si la app no ofrece ese destino o no permite que llegue el monto indicado
            en ARS, debe consultar con Prex y coordinar con Vanina antes de enviar.
          </p>
          <p>
            Prex Argentina informa que recibir transferencias no tiene costo. El envío desde Uruguay
            tiene su propia <OfficialLink source="prexSending">cartilla de cargos</OfficialLink> y
            puede contar con{' '}
            <OfficialLink source="prexPromotion">promociones para Argentina</OfficialLink>. Revisá
            sus fechas y condiciones y el resumen final en la app antes de transferir.{' '}
            <OfficialLink source="prexReceiving">Costos de recepción en Argentina</OfficialLink>.
          </p>
        </li>
        <li>
          <h4>Registrá el pago solo después de recibirlo</h4>
          <p>
            Abrí tu app Prex Argentina y comprobá el movimiento recibido: remitente, fecha, moneda e
            importe. Luego volvé a Pagos → <strong>Cobros de consultas online</strong>, desplegá el
            cobro de ese paciente e ingresá el número de operación recibida.
          </p>
          <p>
            Si coincide el total en ARS, marcá la casilla de comprobación y presioná «Confirmar
            recepción de Prex». El cobro pasará a «Pagado» y se prepararán los avisos por email, que
            requieren el correo del sitio configurado. Una captura enviada por el paciente por sí
            sola no acredita la recepción.
          </p>
        </li>
      </ol>
      <details className="payment-guide-extra">
        <summary>Si no aparece Prex o el dinero no coincide</summary>
        <ul>
          <li>
            <strong>No aparece al paciente:</strong> revisá que guardaste la habilitación, el país
            detectado sea Uruguay y el pack sea online con precios ARS y UYU mayores que cero.
          </li>
          <li>
            <strong>Cambiaste el precio o la cuenta:</strong> cada reserva conserva su precio y cada
            pago iniciado conserva sus instrucciones. Revisá qué datos recibió ese paciente antes de
            indicarle una transferencia.
          </li>
          <li>
            <strong>Importe menor, otra moneda o movimiento ausente:</strong> mantené el cobro
            pendiente y coordiná la diferencia. No marques que recibiste el total hasta comprobarlo
            en Prex.
          </li>
          <li>
            <strong>Dudas sobre cuenta, límites o envío:</strong> consultá el chat de ayuda de la
            app correspondiente —Argentina para recibir, Uruguay para enviar— o el{' '}
            <OfficialLink source="prexHelp">Centro de ayuda Prex Argentina</OfficialLink>.
          </li>
        </ul>
      </details>
    </Guide>
  );
}

import { Link } from 'react-router-dom';
import { ArrowUpRight, ArrowRight, Sprout, Sun, Heart, MoveDown } from 'lucide-react';
import { WellbeingEmblem } from '../components/WellbeingEmblem.jsx';
const pillars = [
  {
    icon: Sprout,
    number: '01',
    title: 'Alimentación consciente',
    text: 'Volver a los alimentos, a sus colores y a disfrutar de lo que llevamos a nuestra mesa.',
  },
  {
    icon: Sun,
    number: '02',
    title: 'Una mirada integral',
    text: 'Tu alimentación forma parte de una historia más grande: tus hábitos, tus emociones y tu entorno.',
  },
  {
    icon: Heart,
    number: '03',
    title: 'Tu propio ritmo',
    text: 'Un camino personal, con pequeños cambios que encuentren lugar en tu vida cotidiana.',
  },
];
export function HomePage() {
  return (
    <>
      <section className="hero shell">
        <div className="hero-copy">
          <span className="eyebrow">
            <span className="tiny-line" /> NUTRICIÓN HOLÍSTICA & INTEGRAL
          </span>
          <h1>
            Volvé a lo simple.
            <br />
            Volvé <em>a vos.</em>
          </h1>
          <p>
            El bienestar empieza cuando te escuchás.
            <br className="desktop-only" /> Te acompaño a construir una relación más consciente con
            la alimentación y con tu cuerpo.
          </p>
          <div className="hero-actions">
            <Link className="button primary" to="/#enfoque">
              Descubrí mi enfoque <ArrowUpRight size={18} />
            </Link>
            <Link className="text-link" to="/tienda">
              Explorar la tienda <ArrowRight size={17} />
            </Link>
          </div>
          <div className="hero-signature">
            <img src="/images/vanina.webp" alt="" width="45" height="45" />
            <div>
              <strong>Lic. Vanina Alaniz</strong>
              <span>Nutrición · Máster en PNI</span>
            </div>
          </div>
        </div>
        <div className="hero-visual">
          <img
            className="hero-image"
            src="/images/portada-plato.webp"
            alt="Plato con quinoa, palta, porotos, maíz, tomate y lima"
            fetchPriority="high"
            width="1600"
            height="1600"
          />
          <div className="hero-note">
            <Sprout size={25} strokeWidth={1.3} />
            <span>
              Pequeños hábitos.
              <br />
              <strong>Una vida más plena.</strong>
            </span>
          </div>
          <div className="orbit-label">CUERPO · MENTE</div>
        </div>
        <a href="#enfoque" className="hero-scroll">
          <MoveDown size={15} /> Un camino hacia tu bienestar
        </a>
      </section>
      <div className="values-strip">
        <div className="shell">
          <span>Alimentos reales</span>
          <span>✦</span>
          <span>Conexión con vos</span>
          <span>✦</span>
          <span>Hábitos que acompañan</span>
          <span>✦</span>
          <span>Bienestar integral</span>
        </div>
      </div>
      <section id="enfoque" className="section shell">
        <div className="section-heading approach-heading">
          <div>
            <span className="eyebrow">MI FORMA DE ACOMPAÑARTE</span>
            <h2>
              Mucho más que
              <br />
              <em>lo que comemos.</em>
            </h2>
          </div>
          <WellbeingEmblem />
          <p>
            Somos cuerpo, emociones e historia.
            <br />
            Por eso, mi mirada de la nutrición parte de vos y de todo lo que te hace única.
          </p>
        </div>
        <div className="pillars">
          {pillars.map(({ icon: Icon, ...p }) => (
            <article className="pillar" key={p.number}>
              <div className="pillar-top">
                <Icon size={32} strokeWidth={1.2} />
                <span>{p.number}</span>
              </div>
              <h3>{p.title}</h3>
              <p>{p.text}</p>
            </article>
          ))}
        </div>
      </section>
      <section id="sobre-mi" className="about-section">
        <div className="shell about-grid">
          <div className="portrait-wrap">
            <img
              src="/images/vanina.webp"
              alt="Vanina Alaniz en su espacio de trabajo"
              loading="lazy"
              width="800"
              height="1200"
            />
            <span className="portrait-caption">Una mirada cercana. Un camino compartido.</span>
          </div>
          <div className="about-copy">
            <span className="eyebrow">HOLA, SOY VANINA</span>
            <h2>
              Creo en una nutrición
              <br />
              que abrace <em>tu vida.</em>
            </h2>
            <p>
              Soy Licenciada en Nutrición y Máster en PNI. Mi recorrido me llevó a mirar la salud de
              una manera integral y a entender que cada persona necesita un acompañamiento propio.
            </p>
            <p>
              Me formé en microbiota, neurodesarrollo y fitomedicina. La maternidad y el aprendizaje
              sobre el sistema nervioso también transformaron mi manera de acompañar.
            </p>
            <p>
              Este espacio nace de esa búsqueda: compartir herramientas para una alimentación
              consciente y una vida con más conexión.
            </p>
            <div className="about-sign">Vanina</div>
            <a
              className="text-link"
              href="https://wa.me/5492664588310"
              target="_blank"
              rel="noreferrer"
            >
              Me gustaría conversar <ArrowUpRight size={18} />
            </a>
            <details className="journey">
              <summary>Un poco más sobre mi formación</summary>
              <p>
                Me recibí en 2010 de Licenciada en Nutrición, con una tesis sobre enfermedad
                celíaca. Luego profundicé en neurodesarrollo junto a LINCA, Medicina Kallawaya con
                Omar Riachi y El Camino de las Plantas con Carlos Batrouni.
              </p>
              <p>
                Fui alumna de la Diplomatura en Nuevos Paradigmas en Crianza con Melina Bronfman,
                donde también facilité la clase de nutrición. Continué mi formación con Fisiofocus,
                Juan Rodríguez Leiva y Regenera PNI.
              </p>
            </details>
          </div>
        </div>
      </section>
      <section className="section shell shop-invitation">
        <div>
          <span className="eyebrow">UN POQUITO DE BIENESTAR, EN CASA</span>
          <h2>
            Elegí con intención.
            <br />
            <em>Disfrutá lo cotidiano.</em>
          </h2>
          <p>
            Un espacio de productos para acompañar tu día a día.
            <br />
            Conocé lo que hay en nuestra tienda.
          </p>
          <Link className="button primary" to="/tienda">
            Visitar la tienda <ShoppingArrow />
          </Link>
        </div>
        <div className="invitation-photo">
          <img
            src="/images/mesa-compartida.webp"
            alt="Personas compartiendo platos variados con verduras y legumbres alrededor de una mesa"
            loading="lazy"
            width="1200"
            height="800"
          />
          <span>lo simple hace bien</span>
        </div>
      </section>
      <section className="closing-note">
        <Sprout strokeWidth={1.2} size={32} />
        <p>
          No se trata de hacerlo perfecto.
          <br />
          Se trata de encontrar <em>tu equilibrio.</em>
        </p>
        <span>UN PASO A LA VEZ.</span>
      </section>
    </>
  );
}
function ShoppingArrow() {
  return <ArrowUpRight size={18} />;
}

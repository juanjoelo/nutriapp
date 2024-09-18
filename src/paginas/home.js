import React, { useEffect, useState } from "react";

//import TypingAnimation from "../../components/TypingAnimation";

import "../paginasCSS/Home.css";
import fotovani from "../imagenes/prueba1.png";
import fotovani2 from "../imagenes/fotovani.png";
import portadaBanner from "../imagenes/bannerPortada.png";
import FondoPagina2 from "../imagenes/FondoPagina2.jpg";
import FondoTarjeta from "../imagenes/fondoTarjetas.png";
import FondoTarjeta2 from "../imagenes/fondoTarjetas2.png";
import plato1 from "../imagenes/plato1.png";
import plato2 from "../imagenes/plato2.png";
import internBanner from "../imagenes/banner2vani.png";
import guiaturnostitulo from "../imagenes/tituloguia.png";
import guiaturnos1 from "../imagenes/guia1.png";
import guiaturnos2 from "../imagenes/guia2.png";
import guiaturnos2b from "../imagenes/guia2b.png";
import guiaturnos3 from "../imagenes/guia3.png";
import guiaturnos4 from "../imagenes/guia4.png";
import AOS from "aos";
import "aos/dist/aos.css";
import { motion } from "framer-motion";

function Home() {
  const [showModal, setShowModal] = useState(false); // Controla la visibilidad del modal
  const [modalType, setModalType] = useState(""); // Controla qué tipo de modal mostrar

  // Abre el modal y establece el tipo
  const openModal = (type) => {
    setModalType(type);
    setShowModal(true);
  };

  // Cierra el modal
  const closeModal = () => {
    setShowModal(false);
  };

  // Maneja la confirmación en el modal y redirige
  const handleConfirm = () => {
    window.location.href = "https://app.nimbo-x.com/c/lic-vanina-alaniz";
  };

  useEffect(() => {
    AOS.init({
      duration: 1000, // Duración de la animación en milisegundos
      offset: 200, // Offset antes de que comience la animación
    });
  }, []);

  return (
    <div className="container">
      {/* Fondo con gradiente */}
      <div className="fondo" data-aos="fade" data-aos-duration="1500">
        <img src={FondoPagina2} alt="fondopagina" className="fondoCover" />
      </div>
      <div className="banner" data-aos="fade-up" data-aos-once="true">
          <img src={portadaBanner} alt="Nutricionista" className="photoCover" />
        </div>
      <div className="cabecera">
        {/* Portada */}
        

        {/* Botón "Planes" */}
        <div className="buttonContainer">
          <motion.button
            className="planButton"
            whileHover={{
              scale: 1.1,
              boxShadow: "0 8px 15px rgba(0, 0, 0, 0.2)",
            }}
            whileTap={{ scale: 0.9 }}
            data-aos="fade-left"
            onClick={() => {
              document.getElementById("sobremi-card").scrollIntoView({
                behavior: "smooth",
              });
            }}
          >
            Sobre mí
          </motion.button>
          <motion.button
            className="planButton"
            whileHover={{
              scale: 1.1,
              boxShadow: "0 8px 15px rgba(0, 0, 0, 0.2)",
            }}
            whileTap={{ scale: 0.9 }}
            data-aos="fade-left"
            onClick={() => {
              document.getElementById("guiacontenedor").scrollIntoView({
                behavior: "smooth",
              });
            }}
          >
            Guía
          </motion.button>
        </div>

        {/* Sección Foto y Descripción */}
        <div className="content">
          <div class="description-card">
            <img src={fotovani} alt="Descripción de la imagen" />
            

            <div className="description" data-aos="fade-right">
              <h2>Vamos a reconquistar tu salud</h2>
              <p>
                Mi nombre es Vanina Alaniz, soy Licenciada en Nutrición.
                <br /> Acá vas a encontrar tu guía hacia una vida saludable y
                equilibrada. <br />
                Transformemos tu relación con la comida a través de planes
                nutricionales
                <br />
                personalizados, asesoramiento experto y dedicado. <br />
                Descubrí cómo una alimentación consciente puede mejorar tu
                bienestar y ayudarte a alcanzar tus objetivos.
              </p>

              <motion.button
                className="scheduleButton"
                whileHover={{
                  scale: 1.1,
                  boxShadow: "0 8px 15px rgba(0, 0, 0, 0.2)",
                }}
                whileTap={{ scale: 0.9 }}
                onClick={() => {
                  document.getElementById("agenda-turno").scrollIntoView({
                    behavior: "smooth",
                  });
                }}
              >
                Agendar turno
              </motion.button>
            </div>
          </div>
        </div>

        {/* <div className="banner" data-aos="fade-down">
        <img src={bannerVerdura} alt="Verduras" className="bannerVerdura" />
      </div> */}
        {/* Sección Agenda tu turno */}
      </div>
      <div
        className="internBanner"
        data-aos="fade-up"
        data-aos-duration="2000"
        data-aos-once="true"
      >
        <img src={internBanner} alt="internBanner" className="InternBanner" />
      </div>

      <div
        className="benefitsSection"
        data-aos="fade-up"
        data-aos-duration="2000"
        data-aos-once="true"
      >
        <div
          className="benefitCard animate__animated animate__fadeInUp"
          id="cartabeneficioid"
          data-aos="slide-right"
          data-aos-delay="100"
        >
          <h4>Mejorá tu salud</h4>
          <p>
            Un régimen nutricional equilibrado y bien diseñado es fundamental
            para mantener un estado óptimo de salud. Al adoptar hábitos
            alimenticios saludables, puedes fortalecer tu sistema inmunológico,
            mejorar tu bienestar general y prevenir diversas enfermedades. Este
            enfoque integral no solo promueve una vida más sana, sino que
            también te proporciona la energía y vitalidad necesarias para
            afrontar los desafíos diarios con mayor eficacia.
          </p>
          .
          <img src={plato1} alt="plato1" className="plato1" />
        </div>
        <div
          className="benefitCard animate__animated animate__fadeInUp"
          id="cartabeneficioid"
          data-aos="slide-right"
          data-aos-delay="200"
        >
          <h4>Incrementá tu energía</h4>
          <p>
            Una alimentación balanceada y rica en nutrientes es clave para
            elevar tus niveles de energía y optimizar tu rendimiento diario. Al
            incorporar una variedad de alimentos frescos y nutritivos, como
            frutas, verduras, proteínas magras y granos enteros, puedes mejorar
            la eficiencia de tu metabolismo y mantener un flujo constante de
            energía.
          </p>
          <img src={plato2} alt="plato1" className="plato1" />
        </div>
        <div
          className="benefitCard animate__animated animate__fadeInUp"
          id="cartabeneficioid"
          data-aos="slide-right"
          data-aos-delay="300"
        >
          <h4>Sentite bien</h4>
          <p>
            Una dieta equilibrada no solo contribuye a tu salud física, sino que
            también tiene un impacto profundo en tu bienestar emocional. Al
            consumir alimentos ricos en vitaminas, minerales y antioxidantes,
            puedes influir positivamente en tu estado de ánimo y reducir los
            niveles de estrés. Nutrientes como los ácidos grasos omega-3,
            encontrados en pescados grasos y nueces, y las vitaminas del
            complejo B, presentes en granos enteros y vegetales, son esenciales
            para mantener un equilibrio emocional estable.
          </p>
          <img src={plato1} alt="plato1" className="plato1" />
        </div>
      </div>
      <div className="tituloReserva">
        <h2>Hace tu reserva.</h2>
      </div>

      <div
        className="seccion-planes"
        id="agenda-turno"
        data-aos="slide-right"
        data-aos-duration="20000"
      >
        <div className="cardContainer">
          {/* Tarjeta 1 */}
          <div className="planCard">
            <img
              src={FondoTarjeta}
              alt="fondotarjeta"
              className="fototarjeta"
            />
            <h3>Primera consulta</h3>
            <p>
              1- Consulta, post consulta análisis del
              <br /> registro de comidas y sugerencias. <br />
              2- Plan nutricional individual. <br />
              3- Sugerencias extras dependiendo el caso. <br />
              4- Acceso a clases (con posibilidad de hacer preguntas) grabadas y
              nuevas mensuales en un classroom exclusivo para pacientes en
              tratamiento.
            </p>
            <motion.button
              className="reserveButton"
              whileHover={{
                scale: 1.1,
                boxShadow: "0 8px 15px rgba(0, 0, 0, 0.2)",
              }}
              whileTap={{ scale: 0.9 }}
              onClick={() => openModal("first")} // Abre el primer modal
            >
              Reservar
            </motion.button>
          </div>

          {/* Tarjeta 2 */}
          <div className="planCard">
            <img
              src={FondoTarjeta2}
              alt="fondotarjeta"
              className="fototarjeta"
            />
            <h3>Consulta seguimiento</h3>
            <p>
              La frecuencia depende de cada paciente:
              <br />
              1- Consulta + nuevo análisis de registro de comidas
              <br />
              2- Sugerencias extras según el caso
              <br />
              3- Continuidad en el classroom
            </p>
            <motion.button
              className="reserveButton"
              whileHover={{
                scale: 1.1,
                boxShadow: "0 8px 15px rgba(0, 0, 0, 0.2)",
              }}
              whileTap={{ scale: 0.9 }}
              onClick={() => openModal("second")} // Abre el segundo modal
            >
              Reservar
            </motion.button>
          </div>
        </div>

        {/* Modal */}
        {showModal && (
          <div className="modal">
            <div className="modal-content">
              <span className="close-button" onClick={closeModal}>
                &times;
              </span>
              {modalType === "first" ? (
                <>
                  <strong>Primera consulta</strong>
                  <p>
                    1. Consulta inicial con análisis del registro de comidas y
                    sugerencias.
                    <br />
                    2. Plan nutricional individualizado.
                    <br />
                    3. Sugerencias adicionales según el caso.
                    <br />
                    4. Acceso a clases grabadas y nuevas mensuales, con la
                    posibilidad de hacer preguntas en un classroom exclusivo
                    para pacientes en tratamiento.
                    <br />
                    <br />
                    El <strong>pago</strong> se realiza por adelantado y se debe
                    reprogramar el turno con al menos 24 horas de antelación.
                    Una vez realizado el pago, por favor envía el comprobante.
                    <br />
                    <br />
                    Para <strong>residentes en Argentina</strong>: <br />
                    <strong>50.000 pesos</strong>
                    <br />
                    Vanina Alejandra Alaniz <br />
                    CVU: 0000003100016292178501 <br />
                    Alias: <em>nutri.vanina.mp</em>
                    <br />
                    CUIT/CUIL: 27327131716 <br />
                    Pago vía Mercado Pago.
                    <br />
                    <br />
                    Para <strong>residentes fuera de Argentina</strong>: <br />
                    <strong>55 USD</strong>
                    <br />
                    Pago vía{" "}
                    <a
                      href="https://www.paypal.me/nutrivani"
                      target="_blank"
                      rel="noreferrer"
                    >
                      PayPal
                    </a>
                    <br />
                    <br />✨<em>Gracias</em>😌
                    <br />
                    Si el dinero es un limitante, no dudes en consultarme por
                    otras opciones de pago.
                  </p>
                </>
              ) : (
                <>
                  <strong>Consulta seguimiento</strong>
                  <p>
                    El pago es por adelantado y se debe reprogramar el turno con
                    al menos 24 horas de antelación. Una vez realizado el pago,
                    por favor envía el comprobante.
                    <br />
                    <br />
                    Para <strong>residentes en Argentina</strong>: <br />
                    <strong>50.000 pesos</strong>
                    <br />
                    Vanina Alejandra Alaniz <br />
                    CVU: 0000003100016292178501 <br />
                    Alias: <em>nutri.vanina.mp</em>
                    <br />
                    CUIT/CUIL: 27327131716 <br />
                    Pago vía Mercado Pago.
                    <br />
                    <br />
                    Para <strong>residentes fuera de Argentina</strong>: <br />
                    <strong>55 USD</strong>
                    <br />
                    Pago vía{" "}
                    <a
                      href="https://www.paypal.me/nutrivani"
                      target="_blank"
                      rel="noreferrer"
                    >
                      PayPal
                    </a>
                    <br />
                    <br />✨<em>Gracias</em>😌
                    <br />
                    Si el dinero es un limitante, no dudes en consultarme por
                    otras opciones de pago.
                  </p>
                </>
              )}
              <button className="confirm-button" onClick={handleConfirm}>
                Ya envié el comprobante
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="guia-container" id="guiacontenedor">
        <img src={guiaturnostitulo} alt="guiatitulo" className="guia-title" />

        <div className="row">
          <div className="guia-item">
            <img src={guiaturnos1} alt="guia1" />
          </div>
          <div className="guia-item">
            <img src={guiaturnos2} alt="guia2" />
          </div>
        </div>

        <div className="row">
          <div className="guia-item">
            <img src={guiaturnos2b} alt="guia2b" />
          </div>
          <div className="guia-item">
            <img src={guiaturnos3} alt="guia3" />
          </div>
          <div className="guia-item" id="itemfinal"> 
            <img src={guiaturnos4} alt="guia4" />
          </div>
        </div>
      </div>

      <motion.div
        className="sobreMiCard"
        id="sobremi-card"
        whileHover={{
          scale: 1.05,
          boxShadow: "0 10px 20px rgba(0, 0, 0, 0.2)",
        }}
        transition={{ duration: 0.4 }}
      >
        <div className="sobreMiContent">
          <div className="sobreMiText">
            <h2>Sobre mí</h2>
            <p>
              Te cuento un poco sobre mi recorrido personal y profesional.
              <br />
              <br />
              👩🏽‍🎓Me recibí en el 2010 de Lic. en Nutrición y mi tesis final fue
              sobre enfermedad celíaca.
              <br />
              <br />
              🔸<strong>Comencé a profundizar en neurodesarrollo</strong> con
              los congresos de{" "}
              <a
                href="https://www.instagram.com/lincaorg/"
                target="_blank"
                rel="noopener noreferrer"
              >
                @lincaorg
              </a>
              <br />
              <br />
              🔸Formaciones como Medicina Kallawaya con Omar Riachi y El Camino
              de las Plantas con Carlos Batrouni{" "}
              <i>me abrieron la cabeza (y el corazón) a la fitomedicina.</i>
              <br />
              <br />
              🔸Más adelante llegó a mi vida{" "}
              <a
                href="https://www.instagram.com/melinabronfman/"
                target="_blank"
                rel="noopener noreferrer"
              >
                @melinabronfman
              </a>{" "}
              con su mirada sobre la herida primal y la{" "}
              <strong>Diplomatura en Nuevos Paradigmas en Crianza</strong> de la
              cual fui alumna y ahora facilito la clase de nutrición. Hermosas
              vueltas de la vida, ¿no?.
              <br />
              <br />
              🔸Luego de ser mamá comencé a familiarizarme con{" "}
              <strong>
                la lactancia, el parto, el post parto y las disfunciones del
                suelo pélvico
              </strong>{" "}
              junto a{" "}
              <a
                href="https://www.instagram.com/fisiofocus/"
                target="_blank"
                rel="noopener noreferrer"
              >
                @fisiofocus
              </a>
              <br />
              <br />
              🔸La pandemia me llevó a formarme en trauma para aprender{" "}
              <i>cómo darle paz al sistema nervioso</i> junto a{" "}
              <a
                href="https://www.instagram.com/juanrodriguezleiva/"
                rel="noopener noreferrer"
                target="_blank"
              >
                @juanrodriguezleiva
              </a>
              <br />
              <br />
              🔸Recientemente terminé el <strong>máster en PNI</strong>, lo que
              llenó de felicidad, el <strong>Posgrado en microbiota</strong>, y
              el <strong>Curso de dieta keto</strong> en{" "}
              <a
                href="https://www.instagram.com/regenera_pni/"
                target="_blank"
                rel="noopener noreferrer"
              >
                @regenera_pni
              </a>
              <br />
              <br />
              🔅Siempre intentando tener una visión integral de la vida y del
              ser. Con el objetivo de poder guiarte de la mejor manera posible y
              con todas las herramientas que sean necesarias para que recuperes
              tu salud.
            </p>
          </div>
          <div className="sobreMiImage">
            <img src={fotovani2} alt="fitivanina" />
          </div>
        </div>
      </motion.div>

      <footer className="footer">
        <div className="footer-content">
          <div className="footer-section about">
            <h2 className="logo-text">Nutricionista Vanina Alaniz</h2>
            <p>
              Soy Licenciada en Nutrición, especializada en nutrición holística
              e integral. Mi objetivo es guiarte hacia un estilo de vida
              saludable, brindándote el apoyo necesario para mejorar tu
              bienestar.
            </p>
          </div>
          <div className="footer-section links">
            <h3>Enlaces útiles</h3>
            <ul>
              <li>
                <a href="#about">Sobre mí</a>
              </li>
              <li>
                <a href="#services">Servicios</a>
              </li>
              <li>
                <a href="#contact">Contacto</a>
              </li>
            </ul>
          </div>
          <div className="footer-section social">
            <h3>Redes Sociales</h3>
            <div className="social-links">
              <a
                href="https://www.instagram.com"
                target="_blank"
                rel="noopener noreferrer"
              >
                <i className="fab fa-instagram"></i>
              </a>
              <a
                href="https://www.facebook.com"
                target="_blank"
                rel="noopener noreferrer"
              >
                <i className="fab fa-facebook-f"></i>
              </a>
              <a
                href="https://www.linkedin.com"
                target="_blank"
                rel="noopener noreferrer"
              >
                <i className="fab fa-linkedin-in"></i>
              </a>
            </div>
          </div>
        </div>
        <div className="footer-bottom">
          &copy; {new Date().getFullYear()} Nutricionista Vanina Alaniz | Todos
          los derechos reservados
        </div>
      </footer>
    </div>
  );
}

export default Home;

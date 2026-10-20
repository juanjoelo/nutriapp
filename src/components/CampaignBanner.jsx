import { Link } from 'react-router-dom';
export function CampaignBanner({ campaign }) {
  if (!campaign) return null;
  return (
    <section className="campaign-banner shell" aria-label="Campaña de la tienda">
      <div>
        <span className="eyebrow">UN MOMENTO PARA ELEGIRTE</span>
        <h2>{campaign.title}</h2>
        <p>{campaign.subtitle}</p>
        <Link className="button primary" to="/tienda">
          {campaign.button}
        </Link>
      </div>
      {campaign.image && <img src={campaign.image} alt="" />}
    </section>
  );
}

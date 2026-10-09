import Link from "next/link";
import { PRICING_PLANS } from "@/lib/pricingPlans";

const targets = { free: "Individual", creator: "Individual / Creator", pro: "Professional", business: "Organization / Team" };

export default function Pricing() {
  return (
    <main className="pricing-page">
      <nav className="marketing-nav container">
        <Link href="/" className="brand"><span className="brand-mark">C</span><span>Creatora <b>AI</b></span></Link>
        <Link className="button small" href="/signup">Start creating</Link>
      </nav>
      <section className="pricing-hero">
        <span className="section-kicker">PERSONAL & ORGANIZATION PRICING</span>
        <h1>Choose the workspace that fits your work</h1>
        <p>Personal plans for individual creators. Business gives the whole organization one shared entitlement.</p>
      </section>
      <section className="plan-grid container">
        {PRICING_PLANS.map((plan) => (
          <article className={plan.popular ? "featured" : ""} key={plan.code}>
            {plan.popular && <em>MOST POPULAR</em>}
            <span className="plan-target">{targets[plan.code]}</span>
            <h2>{plan.name}</h2>
            <p>{plan.description}</p>
            <b>{plan.price}<small>{plan.price === "₹0" ? "" : "/ month"}</small></b>
            <div>{plan.features.map((feature) => <span className={feature.included ? "" : "excluded"} key={feature.text}>{feature.included ? "✓" : "−"} {feature.text}</span>)}</div>
            <Link className={`button ${plan.code === "free" ? "secondary" : ""}`} href={`/signup?plan=${plan.code}`}>
              {plan.name === "Free" ? "Start free" : `Choose ${plan.name}`}
            </Link>
          </article>
        ))}
      </section>
      <p className="pricing-footnote">Business is billed once to the organization. Authorized members inherit access to its shared workspace and connected assets.</p>
      <p className="pricing-footnote" style={{ marginTop: '12px', fontSize: '13px', opacity: 0.6 }}>AI generation usage is billed through your connected MuAPI account.</p>
    </main>
  );
}

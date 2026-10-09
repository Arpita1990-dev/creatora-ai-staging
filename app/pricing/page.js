import Link from "next/link";

const plans = [
  {
    name: "Free",
    target: "Individual",
    price: "₹0",
    description: "Explore Createora with the essentials.",
    features: ["2 projects", "AI Image Generation ✓ Connect your MuAPI account", "No video generation", "No social publishing", "1 team member", "Your MuAPI key", "Createora watermark", "Basic support"],
  },
  {
    name: "Creator",
    target: "Individual / Creator",
    price: "₹599",
    description: "Create and publish consistently.",
    popular: true,
    features: ["10 projects", "AI Image Generation ✓ Connect your MuAPI account", "AI Video Generation ✓ Connect your MuAPI account", "2 Facebook accounts", "2 Instagram accounts", "1 LinkedIn account", "1 YouTube channel", "1 team member", "Your MuAPI key", "No watermark", "Standard support"],
  },
  {
    name: "Pro",
    target: "Professional",
    price: "₹1,499",
    description: "Scale a professional content workflow.",
    features: ["Unlimited projects", "AI Image Generation ✓ Connect your MuAPI account", "AI Video Generation ✓ Connect your MuAPI account", "5 Facebook accounts", "5 Instagram accounts", "5 LinkedIn accounts", "5 YouTube channels", "1 team member", "Your MuAPI key", "No watermark", "Priority support"],
  },
  {
    name: "Business",
    target: "Organization / Team",
    price: "₹4,999",
    description: "One shared subscription for your organization.",
    features: ["Unlimited projects", "AI Image Generation ✓ Connect your MuAPI account", "AI Video Generation ✓ Connect your MuAPI account", "10 Facebook accounts", "10 Instagram accounts", "10 LinkedIn accounts", "10 YouTube channels", "10 team members", "1 organization", "Roles & permissions", "Shared projects", "Shared social accounts", "Organization MuAPI key", "No watermark", "Priority Business support"],
  },
];

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
        {plans.map((plan) => (
          <article className={plan.popular ? "featured" : ""} key={plan.name}>
            {plan.popular && <em>MOST POPULAR</em>}
            <span className="plan-target">{plan.target}</span>
            <h2>{plan.name}</h2>
            <p>{plan.description}</p>
            <b>{plan.price}<small>{plan.price === "₹0" ? "" : "/ month"}</small></b>
            <div>{plan.features.map((feature) => <span key={feature}>✓ {feature}</span>)}</div>
            <Link className={`button ${plan.name === "Free" ? "secondary" : ""}`} href={`/signup?plan=${plan.name.toLowerCase()}`}>
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

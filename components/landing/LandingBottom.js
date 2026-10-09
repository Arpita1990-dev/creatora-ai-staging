import Image from 'next/image';
import Link from 'next/link';
import BrandLogo from '@/components/BrandLogo';
import { PRICING_PLANS as plans } from '@/lib/pricingPlans';
import { CheckIcon, LandingAssetIcon, PlatformIcon, SparkIcon } from './LandingIcons';
import { platforms } from './landingData';

export function SocialPublishing() {
  return (
    <section className="cr-section cr-social" id="social-publishing"><div className="cr-shell cr-social-grid">
      <div className="cr-social-copy">
        <span className="cr-eyebrow">Create here. Publish where you connect.</span>
        <h2>Create once.<br /><em>Publish from Creatora AI.</em></h2>
        <p>Connect your social channels and publish finished content from the same workspace.</p>
        <div className="cr-social-list">{platforms.map((platform) => <div key={platform.id}><i className={'cr-platform cr-' + platform.id}><PlatformIcon platform={platform.id} /></i><span><b>{platform.label}</b><small>{platform.id === 'youtube' ? 'Video uploads' : 'Image and video publishing'}</small></span><CheckIcon /></div>)}</div>
      </div>
      <div className="cr-social-visual">
        <div className="cr-content-preview"><Image src="/template-thumbnails/festival-fashion-reel.jpg" alt="Festival fashion social creative" fill sizes="290px" /><span><small>CAMPAIGN READY</small><b>Festival edit</b><em>Vertical · 9:16</em></span></div>
        <div className="cr-social-hub"><div><SparkIcon /><span><b>Creatora AI</b><small>Publishing workspace</small></span></div><p>Select destinations</p>{platforms.map((platform) => <span key={platform.id}><i className={'cr-platform cr-' + platform.id}><PlatformIcon platform={platform.id} size={16} /></i>{platform.label}<CheckIcon size={14} /></span>)}<button type="button">Publish to 4 channels <span>→</span></button></div>
      </div>
    </div></section>
  );
}

export function CapabilityGrid() {
  const items = [
    ['feature-creation', 'AI creation', 'Images & videos'],
    ['feature-avatars', 'Avatar video', 'Presenter-led content'],
    ['feature-voice', 'Hindi & English', 'Supported voice options'],
    ['feature-brand', 'Brand Kit', 'Organization branding'],
    ['feature-platforms', '4 platforms', 'Social publishing'],
    ['feature-workspace', 'One workspace', 'Create · Preview · Publish'],
    ['feature-projects', 'Projects', 'Organized campaign workflow'],
    ['feature-byok', 'BYOK', 'Connect your MuAPI account'],
  ];
  return <section className="cr-section cr-capabilities"><div className="cr-shell"><div className="cr-capability-title"><span className="cr-eyebrow">Built for the complete workflow</span><h2>Everything you need to move<br /><em>from idea to social content</em></h2><p>No invented numbers. Just the product capabilities you can use.</p></div><div className="cr-capability-grid">{items.map(([icon, title, text]) => <article key={title}><i><LandingAssetIcon icon={icon} size={52} /></i><h3>{title}</h3><p>{text}</p></article>)}</div></div></section>;
}

export function Pricing() {
  return (
    <section className="cr-section cr-pricing" id="pricing"><div className="cr-shell">
      <div className="cr-section-head cr-center"><span className="cr-eyebrow">Simple, transparent pricing</span><h2>Choose the workspace<br /><em>that fits your work</em></h2><p>Start free. Upgrade when your creative workflow needs more room.</p></div>
      <div className="cr-pricing-grid">{plans.map((plan) => <article className={'cr-price-card' + (plan.popular ? ' featured' : '')} key={plan.code}>{plan.popular && <span className="cr-popular">Most popular</span>}{plan.badge && <span className="cr-team-badge">{plan.badge}</span>}<h3>{plan.name}</h3><p>{plan.description}</p><div className="cr-price">{plan.price}<small>{plan.price === '₹0' ? '' : ' / month'}</small></div><ul>{plan.features.slice(0, 8).map((feature) => <li className={feature.included ? '' : 'muted'} key={feature.text}>{feature.included ? <CheckIcon /> : <span>—</span>}{feature.text}</li>)}</ul><Link className={plan.name === 'Free' ? 'cr-button cr-button-outline' : 'cr-button'} href={'/signup?plan=' + plan.code}>{plan.name === 'Free' ? 'Start free' : 'Choose ' + plan.name}</Link></article>)}</div>
      <p className="cr-price-note">AI generation usage uses your connected MuAPI account. Plan entitlements remain unchanged.</p>
    </div></section>
  );
}

const faqs = [
  ['What can I create with Creatora AI?', 'You can create AI images, AI videos, avatar-led videos and campaign assets inside project workflows. Available generation types and limits depend on your plan and connected provider.'],
  ['Can I create AI videos?', 'Yes. Creatora AI supports prompt- and image-led AI video workflows on eligible plans through your connected MuAPI account.'],
  ['Can I create avatar videos?', 'Yes. Choose a presenter, add a script and supported voice configuration, then generate an avatar-led video.'],
  ['Does Creatora AI support Hindi voice-over?', 'Creatora AI currently supports Hindi and English voice-over options in the workflows where voice is available.'],
  ['Can I use my Organization Brand Kit?', 'Yes. Organization workspaces can save brand identity, communication and creative-direction fields, then optionally apply them to supported generation flows.'],
  ['Where can I publish my content?', 'You can connect supported Facebook, Instagram, LinkedIn and YouTube destinations. YouTube publishing is available for video uploads.'],
  ['Do I need my own AI API key?', 'Creatora AI uses a bring-your-own-key architecture for MuAPI generation. You connect and manage the provider account from your workspace settings.'],
];

export function Faq() {
  return <section className="cr-section cr-faq" id="faq"><div className="cr-shell cr-faq-layout"><div><span className="cr-eyebrow">Questions, answered</span><h2>Good to know<br /><em>before you create</em></h2><p>Clear answers about what Creatora AI supports today.</p></div><div>{faqs.map(([question, answer]) => <details key={question}><summary><span>{question}</span><i>+</i></summary><p>{answer}</p></details>)}</div></div></section>;
}

export function FinalCta() {
  return <section className="cr-final"><div className="cr-shell"><div className="cr-final-card"><div className="cr-final-glow" /><span className="cr-eyebrow">Your next campaign starts here</span><h2>Ready to turn your idea<br /><em>into your next campaign?</em></h2><p>Create AI-powered content, keep it on-brand and publish it from one workspace with Creatora AI.</p><div><Link className="cr-button cr-button-light" href="/signup">Start creating <span>→</span></Link><a className="cr-button cr-button-dark-ghost" href="#features">Explore features</a></div><small>No credit card required to start.</small></div></div></section>;
}

export function MarketingFooter() {
  return <footer className="cr-footer"><div className="cr-shell"><div className="cr-footer-main"><div className="cr-footer-brand"><Link href="/" aria-label="Creatora AI home"><BrandLogo /></Link><h3>Create. Publish. Grow.</h3><p>AI-powered content creation and social publishing for creators, businesses and teams.</p></div><div><h4>Product</h4><a href="#features">Features</a><a href="#how-it-works">How it works</a><a href="#social-publishing">Social publishing</a><a href="#pricing">Pricing</a></div><div><h4>Create</h4><Link href="/signup">AI images</Link><Link href="/signup">AI videos</Link><Link href="/signup">Avatar videos</Link><Link href="/signup">Campaigns</Link></div><div><h4>Account</h4><Link href="/login">Sign in</Link><Link href="/signup">Create account</Link><a href="#faq">FAQ</a></div></div><div className="cr-footer-bottom"><span>© 2026 Creatora AI. All rights reserved.</span><span>Facebook · Instagram · LinkedIn · YouTube</span></div></div></footer>;
}


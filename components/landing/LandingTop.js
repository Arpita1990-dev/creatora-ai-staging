import Image from 'next/image';
import Link from 'next/link';
import { ArrowIcon, CheckIcon, LandingAssetIcon, PlatformIcon, PlayIcon, SparkIcon } from './LandingIcons';
import { platforms } from './landingData';

function SectionIntro({ eyebrow, title, copy, center = false }) {
  return <div className={center ? 'cr-section-head cr-center' : 'cr-section-head'}><span className="cr-eyebrow">{eyebrow}</span><h2>{title}</h2><p>{copy}</p></div>;
}

export function Hero() {
  return (
    <section className="cr-hero creatora-gradient">
      <div className="cr-hero-glow" aria-hidden="true" />
      <div className="cr-shell cr-hero-grid">
        <div className="cr-hero-copy">
          <span className="cr-pill"><SparkIcon size={15} /> AI content creation + social publishing</span>
          <h1><span className="cr-title-light">Create.</span><span className="cr-title-coral">Publish.</span><span className="cr-title-gradient">Grow.</span></h1>
          <p>Create AI-powered images and videos, build avatar-led content and publish directly to your social channels — all from one workspace.</p>
          <div className="cr-hero-actions">
            <Link className="cr-button" href="/signup">Start creating free <ArrowIcon /></Link>
            <a className="cr-button cr-button-ghost" href="#how-it-works"><PlayIcon size={16} /> See how it works</a>
          </div>
          <div className="cr-platform-row" aria-label="Supported publishing platforms">
            <span>Publish to</span>{platforms.map((platform) => <div key={platform.id}><i className={'cr-platform cr-' + platform.id}><PlatformIcon platform={platform.id} size={16} /></i>{platform.label}</div>)}
          </div>
        </div>
        <div className="cr-hero-product" aria-label="Creatora AI creation workflow preview">
          <div className="cr-studio-window">
            <div className="cr-window-bar">
              <div aria-hidden="true"><i /><i /><i /></div>
              <span>New campaign</span>
              <b>Creatora Studio</b>
            </div>
            <div className="cr-studio-body">
              <aside aria-hidden="true">
                <strong>C</strong><i className="active" /><i /><i /><i />
              </aside>
              <div className="cr-studio-panel">
                <div className="cr-studio-title">
                  <div><small>CREATE WITH AI</small><b>What will you create?</b></div>
                  <span><SparkIcon size={14} /> Generate</span>
                </div>
                <div className="cr-prompt-box">
                  <span>Describe your idea</span>
                  <p>Create a cinematic vertical video for a luxury jewellery collection.</p>
                  <div><small>Luxury</small><small>9:16</small><small>Hindi voice</small></div>
                </div>
                <div className="cr-output-grid">
                  <div className="cr-hero-art">
                    <Image src="/template-thumbnails/jewelry-sparkle.jpg" alt="Luxury jewellery campaign preview" fill sizes="(max-width: 700px) 70vw, 360px" priority />
                    <span><i><CheckIcon size={13} /></i>Generated</span>
                  </div>
                  <div className="cr-publish-panel">
                    <small>READY TO PUBLISH</small>
                    <b>Choose destinations</b>
                    {platforms.map((platform) => <div key={platform.id}><i className={'cr-platform cr-' + platform.id}><PlatformIcon platform={platform.id} size={14} /></i><span>{platform.label}</span><CheckIcon size={14} /></div>)}
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="cr-floating-chip cr-chip-top"><SparkIcon size={18} /><span><b>AI video</b><small>Generated in your style</small></span></div>
          <div className="cr-floating-chip cr-chip-bottom"><i className="cr-platform cr-instagram"><PlatformIcon platform="instagram" size={13} /></i><span><b>Avatar video</b><small>Hindi &amp; English voice</small></span></div>
        </div>
      </div>
    </section>
  );
}

export function CapabilityStrip() {
  const items = [['feature-creation', 'AI creation', 'Images & videos'], ['feature-avatars', 'AI avatars', 'Presenter-led videos'], ['feature-brand', 'Brand Kit', 'Stay on-brand'], ['feature-platforms', '4 platforms', 'Publish directly'], ['feature-workspace', 'One workspace', 'Create to publish']];
  return <section className="cr-strip" aria-label="Product capabilities"><div className="cr-shell cr-strip-grid">{items.map(([icon, title, text]) => <div key={title}><i><LandingAssetIcon icon={icon} size={40} /></i><span><b>{title}</b><small>{text}</small></span></div>)}</div></section>;
}

export function AdTypes() {
  const cards = [
    { title: 'Product ads', text: 'Shape product images into polished campaign creative.', image: '/template-thumbnails/luxury-launch.png', tags: ['Image', 'Video'] },
    { title: 'AI avatar ads', text: 'Pair a presenter, script and supported voice option.', image: '/avatars/presenters/aanya.webp', tags: ['Presenter', 'Voice'] },
    { title: 'UGC-style ads', text: 'Create social-first concepts with a natural creator feel.', image: '/template-thumbnails/ugc-review.png', tags: ['Avatar', '9:16'] },
    { title: 'Social video ads', text: 'Build short-form videos for your connected channels.', image: '/template-thumbnails/fashion-lookbook.jpg', tags: ['AI Video', 'Social'] },
    { title: 'Promotional ads', text: 'Turn offers and launches into focused visual campaigns.', image: '/template-thumbnails/diwali-sale.png', tags: ['Campaign', 'Brand Kit'] },
    { title: 'Brand campaigns', text: 'Organize consistent creative inside a project workflow.', image: '/template-thumbnails/eco-brand.jpg', tags: ['Projects', 'Brand Kit'] },
  ];
  return (
    <section className="cr-section cr-ad-types" id="features"><div className="cr-shell">
      <SectionIntro eyebrow="Create with AI" title={<>Create the right ad for<br /><em>every campaign with AI</em></>} copy="From polished product ads to AI-presenter videos, create content for different platforms, audiences and campaign goals — all from one workspace." center />
      <div className="cr-ad-grid">{cards.map((card, index) => <article className="cr-ad-card" key={card.title}><div className="cr-ad-image"><Image src={card.image} alt="" fill sizes="(max-width: 700px) 92vw, 370px" /><span>0{index + 1}</span></div><div><h3>{card.title}</h3><p>{card.text}</p><div className="cr-tags">{card.tags.map((tag) => <small key={tag}>{tag}</small>)}</div></div></article>)}</div>
    </div></section>
  );
}

const steps = [
  { number: '01', title: 'Describe your idea', text: 'Tell Creatora AI about your product, promotion or campaign.', visual: 'prompt' },
  { number: '02', title: 'Choose how you want to create', text: 'Select the creative format that fits your campaign.', visual: 'types' },
  { number: '03', title: 'Make it your brand', text: 'Organization users can apply their existing Brand Kit to supported content.', visual: 'brand' },
  { number: '04', title: 'Generate with AI', text: 'Creatora AI turns your inputs into campaign-ready creative content.', visual: 'generate' },
  { number: '05', title: 'Preview your content', text: 'Review your generated creative before adding it to a campaign or publishing it.', visual: 'preview' },
  { number: '06', title: 'Publish from the same workspace', text: 'Send finished content to your connected social channels without leaving Creatora AI.', visual: 'publish' },
];

function StepVisual({ type }) {
  if (type === 'prompt') return <div className="cr-mini-ui"><label>Describe what you want to create</label><p>Create a luxury Instagram video ad for a new gold jewellery collection.</p><div className="cr-mini-chips"><b>Luxury</b><span>Cinematic</span><span>9:16</span></div></div>;
  if (type === 'types') return <div className="cr-type-picker">{[['flow-image','Image ad'],['flow-preview','AI video'],['feature-avatars','Avatar video']].map(([icon, name], i) => <div className={i === 1 ? 'selected' : ''} key={name}><i><LandingAssetIcon icon={icon} size={38} /></i><span>{name}<small>{i === 1 ? 'Prompt or image' : 'Choose format'}</small></span>{i === 1 && <CheckIcon />}</div>)}</div>;
  if (type === 'brand') return <div className="cr-brand-mini"><span>Your Brand Kit</span><div><b>ACME</b><span><i style={{background:'#ff5a36'}} /><i style={{background:'#ff8a42'}} /><i style={{background:'#171315'}} /></span></div>{['Logo', 'Brand colors', 'Tone of voice'].map((item) => <p key={item}>{item}<CheckIcon /></p>)}</div>;
  if (type === 'generate') return <div className="cr-generate-flow"><div><small>INPUT</small><b>Prompt + style</b></div><span>→</span><i><SparkIcon /></i><span>→</span><div><small>OUTPUT</small><b>Generated ad</b></div></div>;
  if (type === 'preview') return <div className="cr-preview-card"><Image src="/template-thumbnails/skincare-routine-reel.jpg" alt="Generated vertical video preview" fill sizes="320px" /><button aria-label="Preview generated video"><span>▶</span></button><div><b>Skincare ritual</b><small>Instagram · 9:16</small></div></div>;
  return <div className="cr-publish-flow"><div className="cr-publish-source"><SparkIcon /><b>Your creative</b></div><span>→</span><div className="cr-platform-icons">{platforms.map((platform) => <i key={platform.id} className={'cr-platform cr-' + platform.id}><PlatformIcon platform={platform.id} /></i>)}</div></div>;
}

export function HowItWorks() {
  return (
    <section className="cr-section cr-how" id="how-it-works"><div className="cr-shell">
      <SectionIntro eyebrow="How it works" title={<>From an idea to content<br /><em>ready to publish</em></>} copy="Move through one clear creative workflow in Creatora AI." center />
      <div className="cr-steps">{steps.map((step, index) => <article className={'cr-step ' + (index % 2 ? 'reverse' : '')} key={step.number}><div className="cr-step-copy"><span>{step.number}</span><h3>{step.title}</h3><p>{step.text}</p></div><div className="cr-step-visual"><StepVisual type={step.visual} /></div></article>)}</div>
    </div></section>
  );
}


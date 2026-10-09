import Image from 'next/image';
import Link from 'next/link';
import { CheckIcon, LandingAssetIcon, PlatformIcon, SparkIcon } from './LandingIcons';
import { platforms, presenters } from './landingData';

export function AvatarShowcase() {
  return (
    <section className="cr-section cr-avatar-section">
      <div className="cr-shell cr-avatar-grid">
        <div className="cr-avatar-stage">
          <div className="cr-phone">
            <Image src="/avatars/presenters/aanya.webp" alt="Aanya, a professional presenter available in Creatora AI" fill sizes="(max-width: 700px) 80vw, 380px" />
            <div className="cr-phone-shade" />
            <span className="cr-live-pill"><i /> AI presenter</span>
            <div className="cr-phone-caption"><small>NEW COLLECTION</small><b>Make every moment<br />shine a little brighter.</b><span>Hindi · Professional · 9:16</span></div>
            <button type="button" aria-label="Avatar video preview"><span>▶</span></button>
          </div>
          <span className="cr-script-chip"><SparkIcon size={15} /><b>Script ready</b><small>Voice + presenter</small></span>
        </div>
        <div className="cr-avatar-copy">
          <span className="cr-eyebrow">AI avatar video</span>
          <h2>Bring your message to life<br /><em>with AI presenters</em></h2>
          <p>Choose a presenter, add your script and create avatar-led videos for product promotions, explainers and social campaigns.</p>
          <div className="cr-presenter-list" aria-label="Available presenter examples">
            {presenters.map((presenter, index) => <div className={index === 0 ? 'active' : ''} key={presenter.id}><Image src={'/avatars/presenters/' + presenter.id + '.webp'} alt={presenter.name} width={58} height={58} /><span>{presenter.name}<small>{presenter.category}</small></span>{index === 0 && <CheckIcon />}</div>)}
          </div>
          <div className="cr-avatar-features">
            <div><i>01</i><span><b>Presenter library</b><small>Choose from different presenter styles for different campaign types.</small></span></div>
            <div><i>02</i><span><b>Hindi & English voice</b><small>Create presenter-led content with supported Hindi and English voice-over options.</small></span></div>
            <div><i>03</i><span><b>Brand-ready content</b><small>Bring your organization&apos;s visual identity into supported avatar campaigns.</small></span></div>
          </div>
          <Link className="cr-text-link" href="/signup">Create an avatar video <span>→</span></Link>
        </div>
      </div>
    </section>
  );
}

export function BrandKitShowcase() {
  return (
    <section className="cr-section cr-brand-section"><div className="cr-shell cr-brand-layout">
      <div className="cr-brand-copy">
        <span className="cr-eyebrow">Your brand. Your style.</span>
        <h2>Keep every creation<br /><em>recognizably yours</em></h2>
        <p>Organization users can use their existing Brand Kit to keep supported Creatora AI content consistent with their brand.</p>
        <ul>
          <li><CheckIcon /><span><b>Visual identity</b>Brand name, logo and up to eight brand colors</span></li>
          <li><CheckIcon /><span><b>Communication</b>Tone of voice, target audience and default call to action</span></li>
          <li><CheckIcon /><span><b>Creative direction</b>Image style, video style and logo placement</span></li>
        </ul>
        <small className="cr-fine-print">Brand Kit is available in organization workspaces and remains optional during supported generation flows.</small>
      </div>
      <div className="cr-brand-card-wrap">
        <div className="cr-brand-card">
          <div className="cr-brand-card-head"><span><SparkIcon size={15} /> Organization Brand Kit</span><small>Saved</small></div>
          <div className="cr-brand-identity"><div className="cr-demo-logo">A</div><span><small>BRAND NAME</small><b>Aurelia Studio</b><em>Premium jewellery for modern celebrations.</em></span></div>
          <div className="cr-brand-field"><small>BRAND COLORS</small><div className="cr-swatches"><i style={{background:'#251543'}} /><i style={{background:'#f06e55'}} /><i style={{background:'#e8bd72'}} /><i style={{background:'#fff7ec'}} /></div></div>
          <div className="cr-brand-row"><div><small>TONE OF VOICE</small><b>Elegant & warm</b></div><div><small>LOGO PLACEMENT</small><b>Bottom right</b></div></div>
          <div className="cr-brand-apply"><span><CheckIcon /> Apply Brand Kit</span><div className="cr-toggle"><i /></div></div>
        </div>
        <div className="cr-brand-output"><Image src="/template-thumbnails/jewelry-sparkle.jpg" alt="Branded jewellery creative example" fill sizes="260px" /><span><small>GENERATED CREATIVE</small><b>Consistent by design</b></span></div>
      </div>
    </div></section>
  );
}

export function WorkspaceFlow() {
  const stages = [
    { number: '01', title: 'Create', text: 'AI images and videos', color: 'coral', icon: 'flow-image' },
    { number: '02', title: 'Present', text: 'Avatar videos with supported voice', color: 'pink', icon: 'feature-avatars' },
    { number: '03', title: 'Brand', text: 'Organization Brand Kit', color: 'orange', icon: 'flow-brand' },
    { number: '04', title: 'Publish', text: 'Connected social channels', color: 'red', icon: 'flow-publish' },
  ];
  return (
    <section className="cr-section cr-workspace"><div className="cr-shell">
      <div className="cr-workspace-head"><div><span className="cr-eyebrow">One creative workspace</span><h2>From idea to published content<br /><em>without changing tools</em></h2></div><p>Create images and videos, build avatar-led content, maintain brand consistency and publish to your connected social channels.</p></div>
      <div className="cr-stage-grid">{stages.map((stage, index) => <article className={'cr-stage cr-stage-' + stage.color} key={stage.title}><span>{stage.number}</span><i><LandingAssetIcon icon={stage.icon} size={50} /></i><h3>{stage.title}</h3><p>{stage.text}</p>{index < stages.length - 1 && <b aria-hidden="true">→</b>}</article>)}</div>
      <div className="cr-flow-bar"><span>Your idea</span><i>→</i><span>Image · AI video · Avatar video</span><i>→</i><span>Brand when applicable</span><i>→</i><span>Preview</span><i>→</i><span>Publish</span></div>
      <div className="cr-flow-platforms">{platforms.map((platform) => <div key={platform.id}><i className={'cr-platform cr-' + platform.id}><PlatformIcon platform={platform.id} size={18} /></i>{platform.label}</div>)}</div>
    </div></section>
  );
}


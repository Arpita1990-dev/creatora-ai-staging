import './landing.css';
import MarketingHeader from '@/components/landing/MarketingHeader';
import LandingShowcase from '@/components/landing/LandingShowcase';
import LandingReviews from '@/components/landing/LandingReviews';
import { Hero, CapabilityStrip, AdTypes, HowItWorks } from '@/components/landing/LandingTop';
import { AvatarShowcase, BrandKitShowcase, WorkspaceFlow } from '@/components/landing/LandingMiddle';
import { SocialPublishing, CapabilityGrid, Pricing, Faq, FinalCta, MarketingFooter } from '@/components/landing/LandingBottom';

export default function Home() {
  return (
    <main className="cr-landing creatora-gradient">
      <MarketingHeader /><Hero /><CapabilityStrip /><LandingShowcase /><AdTypes />
      <HowItWorks /><AvatarShowcase /><BrandKitShowcase /><WorkspaceFlow />
      <SocialPublishing /><CapabilityGrid /><LandingReviews /><Pricing /><Faq /><FinalCta /><MarketingFooter />
    </main>
  );
}


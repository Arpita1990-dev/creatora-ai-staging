import { PLAN_CATALOG } from "./planCatalog.js";

function planFeatures(code) {
  const plan = PLAN_CATALOG[code];
  const feature = (text, included = true) => ({ text, included });
  const projects = feature(plan.maxProjects == null ? "Unlimited projects" : `${plan.maxProjects} projects`);
  const image = feature(plan.imageGenerationLimit == null ? "AI image generation" : "Limited AI image generation", plan.imageGeneration);
  const generation = [feature("AI video generation", plan.videoGeneration), feature("AI Avatar Video", plan.avatarVideo)];
  const social = [["Facebook", "maxFacebookAccounts", "account"], ["Instagram", "maxInstagramAccounts", "account"], ["LinkedIn", "maxLinkedInAccounts", "account"], ["YouTube", "maxYouTubeAccounts", "channel"]].map(([platform, key, noun]) => {
    const count = plan[key];
    const prefix = code === "creator" && ["LinkedIn", "YouTube"].includes(platform) ? "Connect" : "Connect up to";
    return feature(count ? `${prefix} ${count} ${platform} ${noun}${count === 1 ? "" : "s"}` : `${platform} publishing`, count > 0);
  });
  const members = feature(plan.maxTeamMembers === 1 ? "1 member" : `Up to ${plan.maxTeamMembers} team members`);
  const watermark = feature(plan.watermark ? "Creatora AI watermark" : "No watermark");
  const support = feature({ BASIC: "Basic support", STANDARD: "Standard support", PRIORITY: "Priority support", BUSINESS_PRIORITY: "Priority Business support" }[plan.supportLevel]);
  const business = code === "business" ? ["1 organization workspace", "Roles & permissions", "Shared projects", "Shared social accounts", "Organization AI/API configuration"].map((text) => feature(text)) : [];
  return code === "free" ? [projects, image, members, support, watermark, ...generation, ...social] : [projects, image, ...generation, ...social, members, ...business, watermark, support];
}

export const PRICING_PLANS = [
  {
    code: "free",
    name: "Free",
    description: "Explore Creatora AI and start creating.",
    features: planFeatures("free"),
  },
  {
    code: "creator",
    name: "Creator",
    description: "Perfect for creators, freelancers and entrepreneurs.",
    popular: true,
    features: planFeatures("creator"),
  },
  {
    code: "pro",
    name: "Pro",
    description: "For professionals who need more creative freedom.",
    features: planFeatures("pro"),
  },
  {
    code: "business",
    name: "Business",
    description: "Built for organizations and collaborative marketing teams.",
    badge: "FOR TEAMS",
    features: planFeatures("business"),
  },
].map((plan) => ({ ...plan, price: new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(PLAN_CATALOG[plan.code].monthlyPrice / 100) }));


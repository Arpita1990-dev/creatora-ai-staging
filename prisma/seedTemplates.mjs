import { existsSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import {
  additionalTemplates,
  expandedTemplates,
} from "./templateSeedData.mjs";

const prisma = new PrismaClient();

const deprecatedAudioTemplateSlugs = [
  "asmr-product", "audiobook-teaser", "beauty-voice", "news-bulletin",
  "logo-sting", "travel-guide", "hold-music", "cafe-jazz",
  "support-greeting", "sleep-soundscape", "documentary-narration",
  "ecommerce-voice", "game-ambience", "festival-sound", "fitness-coach",
  "kids-story", "language-lesson", "event-announcement", "podcast-intro", "radio-ad",
  "luxury-voiceover", "morning-meditation", "motivation-speech",
  "museum-guide", "nature-ambience", "launch-jingle",
  "property-narration", "restaurant-ambience", "retail-music", "sports-hype",
  "luxury-brand-podcast", "sports-radio-promo", "sleep-meditation",
  "tech-news-opener", "restaurant-radio-ad", "travel-podcast-theme",
  "fitness-coach-voice", "kids-bedtime-story", "property-audio-tour",
  "beauty-podcast-ad", "cinematic-trailer-score", "retail-store-loop",
  "language-lesson-audio", "product-demo-narration", "morning-news-jingle",
  "spa-ambient-loop", "museum-audio-guide", "car-dealer-radio",
  "event-countdown-audio", "food-delivery-jingle", "nature-documentary-voice",
  "saas-podcast-sponsor", "fashion-show-soundtrack", "holiday-sale-radio",
  "guided-breathwork",
];

const coreTemplates = [
  {
    id: "luxury-launch",
    name: "Luxury Product Launch",
    description:
      "Create an editorial product launch with premium lighting and concise conversion copy.",
    industry: "Fashion",
    platform: "Instagram",
    format: "4:5",
    duration: "Static",
    inputs: "Product photo, brand colours, offer",
    requirements: ["Product photo", "Brand colours", "Offer details"],
    outputs: "Product image, headline, caption",
    cost: 18,
    type: "Image + Copy",
    outputType: "Image + Copy",
    campaignType: "Product launch",
    category: "Product launches",
    style: "Luxury",
    cta: "Shop Now",
    prompt:
      "Create a luxury product launch advertisement with editorial lighting, premium materials, elegant negative space, and room for a concise headline.",
    tone: "peach",
  },
  {
    id: "ugc-review",
    name: "UGC Product Review",
    description:
      "Turn a product image and key benefit into an authentic vertical creator-style review.",
    industry: "Beauty",
    platform: "Instagram Reels",
    format: "9:16",
    duration: "15 sec",
    inputs: "Product photo, key benefit, voice style",
    requirements: ["Product photo", "Key benefit", "Voice preference"],
    outputs: "Video script, reel, captions",
    cost: 32,
    type: "Video + Copy",
    outputType: "Video + Copy",
    campaignType: "UGC",
    category: "UGC advertising",
    style: "UGC",
    cta: "Try It Today",
    prompt:
      "Create an authentic UGC product review with a strong three-second hook, product demonstration, natural reaction, benefit proof, captions, and a direct CTA.",
    tone: "pink",
    video: true,
    previewUrl: "/template-previews/ugc-review.mp4",
  },
  {
    id: "diwali-sale",
    name: "Diwali Sale Campaign",
    description:
      "Generate a festive multi-channel sales campaign with coordinated visuals and copy.",
    industry: "Festivals",
    platform: "Facebook",
    format: "1:1",
    duration: "7 days",
    inputs: "Catalogue, discount, dates, audience",
    requirements: ["Product photo", "Offer details", "Campaign dates"],
    outputs: "Campaign plan, image, video, captions, calendar",
    cost: 55,
    type: "Campaign Package",
    outputType: "Campaign Package",
    campaignType: "Seasonal campaign",
    category: "Festivals",
    style: "Playful",
    cta: "Shop the Sale",
    prompt:
      "Create a vibrant Diwali sale campaign with festive light, premium product focus, celebratory color, clear discount messaging, and coordinated social assets.",
    tone: "lime",
    video: true,
    previewUrl: "/template-previews/diwali-sale.mp4",
  },
  {
    id: "amazon-set",
    name: "Amazon Product Set",
    description:
      "Create marketplace-ready product imagery and benefit-led listing copy.",
    industry: "Ecommerce",
    platform: "Amazon/marketplace",
    format: "1:1",
    duration: "Static",
    inputs: "Product images, features, compliance notes",
    requirements: ["Product photo", "Key benefits"],
    outputs: "Product image, bullets, title",
    cost: 24,
    type: "Image + Copy",
    outputType: "Image + Copy",
    campaignType: "Marketplace listing",
    category: "Ecommerce",
    style: "Minimal",
    cta: "Buy Now",
    prompt:
      "Create a clean marketplace product image with accurate product detail, neutral background, balanced composition, and compliant benefit-led copy.",
    tone: "aqua",
  },
  {
    id: "before-after",
    name: "Before and After",
    description:
      "Create a vertical transformation story with compliant claims and captions.",
    industry: "Healthcare",
    platform: "Instagram",
    format: "9:16",
    duration: "15 sec",
    inputs: "Before image, after image, disclaimer",
    requirements: ["Reference image", "Disclaimer"],
    outputs: "Short video, caption, CTA",
    cost: 30,
    type: "Video + Copy",
    outputType: "Video + Copy",
    campaignType: "Transformation",
    category: "Healthcare",
    style: "Lifestyle",
    cta: "Learn More",
    prompt:
      "Create a tasteful before-and-after transformation story with clear sequencing, restrained claims, readable captions, and a compliant CTA.",
    tone: "blue",
    video: true,
    previewUrl: "/template-previews/before-after.mp4",
  },
  {
    id: "restaurant-promo",
    name: "Restaurant Promotion",
    description:
      "Build a food promotion with appetite-led imagery, motion, and local offer copy.",
    industry: "Restaurants",
    platform: "Instagram",
    format: "9:16",
    duration: "10 sec",
    inputs: "Dish photos, offer, location",
    requirements: ["Product photo", "Offer details", "Location"],
    outputs: "Image, video, captions",
    cost: 36,
    type: "Image + Video",
    outputType: "Image + Video",
    campaignType: "Local promotion",
    category: "Restaurants",
    style: "Cinematic",
    cta: "Book a Table",
    prompt:
      "Create an appetizing restaurant promotion with cinematic food close-ups, warm atmosphere, offer text, location context, and a strong booking CTA.",
    tone: "amber",
    video: true,
    previewUrl: "/template-previews/restaurant-promo.mp4",
  },
  {
    id: "real-estate",
    name: "Real Estate Walkthrough",
    description:
      "Produce a landscape property showcase with feature-led narration.",
    industry: "Real estate",
    platform: "YouTube",
    format: "16:9",
    duration: "15 sec",
    inputs: "Property photos, features, location",
    requirements: ["Reference image", "Property features", "Location"],
    outputs: "Walkthrough video, description",
    cost: 48,
    type: "Video + Copy",
    outputType: "Video + Copy",
    campaignType: "Property showcase",
    category: "Real estate",
    style: "Cinematic",
    cta: "Schedule a Viewing",
    prompt:
      "Create a polished real-estate walkthrough highlighting space, natural light, premium finishes, key property features, and location benefits.",
    tone: "steel",
    video: true,
    previewUrl: "/template-previews/real-estate.mp4",
  },
];

function thumbnailUrl(id) {
  const extension = existsSync(
    join(process.cwd(), "public", "template-thumbnails", `${id}.jpg`),
  )
    ? "jpg"
    : "png";
  return `/template-thumbnails/${id}.${extension}`;
}

async function seed() {
  const templates = [...coreTemplates, ...additionalTemplates, ...expandedTemplates];
  await prisma.template.updateMany({
    where: { slug: { in: deprecatedAudioTemplateSlugs } },
    data: { isPublished: false },
  });
  for (const [index, template] of templates.entries()) {
    const {
      id,
      name,
      description,
      category,
      industry,
      platform,
      format,
      prompt,
      thumbnailUrl: suppliedThumbnailUrl,
      previewUrl: suppliedPreviewUrl,
      ...configuration
    } = template;
    const existing = await prisma.template.findUnique({
      where: { slug: id },
      select: { configuration: true, previewUrl: true },
    });
    let existingConfiguration = {};
    try {
      existingConfiguration = JSON.parse(existing?.configuration || "{}");
    } catch {}
    const existingAiPreview =
      existingConfiguration.previewKind === "ai-generated" &&
      existingConfiguration.previewProvider === "KIE" &&
      /^\/template-ai\/.+\.mp4$/i.test(existing?.previewUrl || "") &&
      existsSync(join(process.cwd(), "public", existing.previewUrl.replace(/^\/+/, "")));
    const mergedConfiguration = {
      ...existingConfiguration,
      ...configuration,
    };
    if (mergedConfiguration.video) {
      delete mergedConfiguration.audio;
      if (existingAiPreview) {
        Object.assign(mergedConfiguration, existingConfiguration, {
          previewKind: "ai-generated",
          previewProvider: "KIE",
        });
      } else if (mergedConfiguration.previewProvider === "MUAPI") {
        mergedConfiguration.previewKind = "full-motion";
      } else if (mergedConfiguration.previewKind !== "full-motion") {
        mergedConfiguration.previewKind = "thumbnail-motion";
      }
    }
    const storedConfiguration = JSON.stringify(mergedConfiguration);
    const previewUrl = mergedConfiguration.video
      ? existingAiPreview
        ? existing.previewUrl
        : mergedConfiguration.previewProvider === "MUAPI" && existing?.previewUrl
        ? existing.previewUrl
        : mergedConfiguration.previewKind === "full-motion"
          ? suppliedPreviewUrl
          : `/template-previews/${id}.mp4`
      : suppliedPreviewUrl || suppliedThumbnailUrl || thumbnailUrl(id);
    await prisma.template.upsert({
      where: { slug: id },
      update: {
        name,
        description,
        category,
        industry,
        assetType: configuration.outputType,
        platform,
        aspectRatio: format,
        thumbnailUrl: existingAiPreview
          ? existingConfiguration.previewReferenceUrl
          : suppliedThumbnailUrl || thumbnailUrl(id),
        previewUrl,
        promptTemplate: prompt,
        configuration: storedConfiguration,
        isSystem: true,
        isPublished: true,
      },
      create: {
        slug: id,
        name,
        description,
        category,
        industry,
        assetType: configuration.outputType,
        platform,
        aspectRatio: format,
        thumbnailUrl: existingAiPreview
          ? existingConfiguration.previewReferenceUrl
          : suppliedThumbnailUrl || thumbnailUrl(id),
        previewUrl,
        promptTemplate: prompt,
        configuration: storedConfiguration,
        isSystem: true,
        isPublished: true,
      },
    });
  }
  console.log(
    `Seeded ${templates.length} templates.`,
  );
}

seed().finally(() => prisma.$disconnect());

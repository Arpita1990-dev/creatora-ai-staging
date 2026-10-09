import { existsSync, mkdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expandedTemplates } from "../prisma/templateSeedData.mjs";

const execFileAsync = promisify(execFile);

const ffmpegPath = join(
  process.cwd(),
  "node_modules",
  "@ffmpeg-installer",
  "win32-x64",
  "ffmpeg.exe",
);

const outputDir = join(process.cwd(), "public", "template-previews");
const force = process.argv.includes("--force");
const remoteOnly = process.argv.includes("--remote-only");
const selectedSlug = process.argv.find((value) => value.startsWith("--slug="))?.slice(7);
const remoteThumbnails = new Map(
  expandedTemplates.map((template) => [template.id, template.thumbnailUrl]),
);

const videoTemplates = [
  { slug: "ugc-review", label: "UGC Review", color: "e9b1cd" },
  { slug: "diwali-sale", label: "Diwali Sale", color: "e9d37a" },
  { slug: "before-after", label: "Before & After", color: "86b8ef" },
  { slug: "restaurant-promo", label: "Restaurant Promo", color: "f4be6b" },
  { slug: "real-estate", label: "Real Estate", color: "a7b0bd" },
  { slug: "fitness-launch", label: "Fitness Launch", color: "a486e8" },
  { slug: "coffee-story", label: "Coffee Story", color: "f4be6b" },
  { slug: "island-travel", label: "Island Travel", color: "bcebe5" },
  { slug: "saas-explainer", label: "SaaS Explainer", color: "a7b0bd" },
  { slug: "pet-care-demo", label: "Pet Care Demo", color: "f4be6b" },
  { slug: "electric-car-reveal", label: "Electric Car", color: "86b8ef" },
  { slug: "jewelry-sparkle", label: "Jewelry Showcase", color: "e9b1cd" },
  { slug: "running-shoe", label: "Running Shoe", color: "86b8ef" },
  { slug: "home-decor", label: "Home Decor", color: "f4be6b" },
  { slug: "gadget-unboxing", label: "Gadget Unboxing", color: "a7b0bd" },
  { slug: "eco-brand", label: "Eco Brand", color: "e9d37a" },
  { slug: "baby-care", label: "Baby Care", color: "e9b1cd" },
  { slug: "fashion-lookbook", label: "Fashion Lookbook", color: "e9b1cd" },
  { slug: "game-trailer", label: "Game Trailer", color: "a486e8" },
  { slug: "course-promo", label: "Course Promo", color: "86b8ef" },
  { slug: "fintech-app", label: "Fintech App", color: "a7b0bd" },
  { slug: "wedding-venue", label: "Wedding Venue", color: "e9b1cd" },
  { slug: "boutique-hotel", label: "Boutique Hotel", color: "bcebe5" },
  { slug: "dental-trust", label: "Dental Clinic", color: "86b8ef" },
  { slug: "yoga-retreat", label: "Yoga Retreat", color: "e9d37a" },
  { slug: "meal-kit", label: "Meal Kit", color: "f4be6b" },
  { slug: "furniture-craft", label: "Furniture Craft", color: "f4be6b" },
  { slug: "solar-home", label: "Solar Home", color: "e9d37a" },
  { slug: "nonprofit-story", label: "Nonprofit Story", color: "e9d37a" },
  { slug: "book-trailer", label: "Book Trailer", color: "a486e8" },
  { slug: "gallery-preview", label: "Gallery Preview", color: "a7b0bd" },
  { slug: "conference-teaser", label: "Conference", color: "86b8ef" },
  { slug: "app-tutorial", label: "App Tutorial", color: "a7b0bd" },
  { slug: "recruitment-film", label: "Recruitment Film", color: "86b8ef" },
  { slug: "architect-portfolio", label: "Architect Portfolio", color: "a7b0bd" },
  { slug: "artisan-perfume-film", label: "Perfume Film", color: "e9b1cd" },
  { slug: "streetwear-drop", label: "Streetwear Drop", color: "86b8ef" },
  { slug: "smartwatch-training", label: "Smartwatch Ad", color: "a7b0bd" },
  { slug: "organic-tea-ritual", label: "Tea Ritual", color: "e9d37a" },
  { slug: "modern-furniture-tour", label: "Furniture Tour", color: "f4be6b" },
  { slug: "mountain-bike-action", label: "Bike Action", color: "86b8ef" },
  { slug: "bakery-morning-reel", label: "Bakery Reel", color: "f4be6b" },
  { slug: "solar-home-story", label: "Solar Home", color: "e9d37a" },
  { slug: "wedding-venue-film", label: "Wedding Venue", color: "e9b1cd" },
  { slug: "kids-learning-app", label: "Kids App Demo", color: "a486e8" },
  { slug: "skincare-routine-reel", label: "Skincare Reel", color: "e9b1cd" },
  { slug: "craft-chocolate-story", label: "Chocolate Story", color: "f4be6b" },
  { slug: "coastal-hotel-tour", label: "Hotel Tour", color: "bcebe5" },
  { slug: "gaming-headset-reveal", label: "Gaming Reveal", color: "a486e8" },
  { slug: "financial-app-demo", label: "Finance App", color: "a7b0bd" },
  { slug: "plant-care-guide", label: "Plant Care", color: "e9d37a" },
  { slug: "handmade-ceramics", label: "Ceramics Story", color: "f4be6b" },
  { slug: "electric-scooter-city", label: "Scooter Ad", color: "86b8ef" },
  { slug: "yoga-retreat-invite", label: "Yoga Retreat", color: "e9d37a" },
  { slug: "pet-adoption-story", label: "Pet Adoption", color: "f4be6b" },
  { slug: "festival-fashion-reel", label: "Fashion Reel", color: "e9b1cd" },
  { slug: "meal-kit-demo", label: "Meal Kit Demo", color: "e9d37a" },
  { slug: "camera-launch-film", label: "Camera Launch", color: "a7b0bd" },
  { slug: "charity-impact-story", label: "Charity Story", color: "e9d37a" },
  { slug: "eco-packaging-unbox", label: "Eco Unboxing", color: "e9d37a" },
  { slug: "skincare-lab-tour", label: "Skincare Lab", color: "e9b1cd" },
  { slug: "athlete-day-reel", label: "Athlete Reel", color: "86b8ef" },
  { slug: "tech-event-recap", label: "Tech Recap", color: "a7b0bd" },
  { slug: "chef-special-reveal", label: "Chef Reveal", color: "f4be6b" },
  { slug: "travel-itinerary-reel", label: "Travel Reel", color: "bcebe5" },
  { slug: "home-workout-demo", label: "Workout Demo", color: "86b8ef" },
  { slug: "storybook-animation", label: "Storybook", color: "a486e8" },
  { slug: "luxury-property-reel", label: "Luxury Property", color: "a7b0bd" },
  { slug: "cosmetics-transformation", label: "Cosmetics", color: "e9b1cd" },
  { slug: "film-trailer-teaser", label: "Film Trailer", color: "a7b0bd" },
  { slug: "retail-window-showcase", label: "Retail Window", color: "f4be6b" },
  { slug: "language-app-demo", label: "Language App", color: "a486e8" },
  { slug: "product-feature-spotlight", label: "Product Feature", color: "a7b0bd" },
  { slug: "newsroom-behind-scenes", label: "Newsroom", color: "a7b0bd" },
  { slug: "spa-treatment-tour", label: "Spa Tour", color: "e9b1cd" },
  { slug: "museum-exhibit-reel", label: "Museum Reel", color: "a7b0bd" },
  { slug: "car-showroom-walkthrough", label: "Car Showroom", color: "a7b0bd" },
  { slug: "event-stage-reveal", label: "Event Stage", color: "a486e8" },
  { slug: "food-delivery-demo", label: "Food Delivery", color: "f4be6b" },
  { slug: "wildlife-mini-documentary", label: "Wildlife", color: "e9d37a" },
  { slug: "saas-dashboard-tour", label: "SaaS Dashboard", color: "a7b0bd" },
  { slug: "runway-highlight-reel", label: "Runway Reel", color: "e9b1cd" },
  { slug: "holiday-gift-guide", label: "Gift Guide", color: "e9d37a" },
  { slug: "breathwork-visual-guide", label: "Breathwork", color: "bcebe5" },
];

async function generateVideo(template) {
  const outputPath = join(outputDir, `${template.slug}.mp4`);
  let thumbnailPath = ["jpg", "png", "webp"]
    .map((extension) => join(process.cwd(), "public", "template-thumbnails", `${template.slug}.${extension}`))
    .find((candidate) => existsSync(candidate));
  if (remoteOnly && thumbnailPath) return { slug: template.slug, status: "exists" };
  if (existsSync(outputPath) && !force) {
    return { slug: template.slug, status: "exists" };
  }
  if (!thumbnailPath && remoteThumbnails.get(template.slug)?.startsWith("http")) {
    const configuredUrl = remoteThumbnails.get(template.slug);
    const downloadUrl = configuredUrl.includes("loremflickr.com")
      ? `https://picsum.photos/seed/${encodeURIComponent(template.slug)}/640/960`
      : configuredUrl;
    const response = await fetch(downloadUrl);
    if (!response.ok) throw new Error(`Thumbnail download failed with HTTP ${response.status}`);
    thumbnailPath = join(process.cwd(), "public", "template-thumbnails", `${template.slug}.jpg`);
    writeFileSync(thumbnailPath, Buffer.from(await response.arrayBuffer()));
  }
  const visualInput = thumbnailPath
    ? ["-loop", "1", "-framerate", "30", "-i", thumbnailPath]
    : ["-f", "lavfi", "-i", `testsrc2=s=540x960:d=4:r=30`];
  const temporaryPath = join(outputDir, `${template.slug}.tmp.mp4`);

  const args = [
    ...visualInput,
    ...(thumbnailPath
      ? [
          "-vf",
          "scale=600:1067:force_original_aspect_ratio=increase,crop=600:1067,zoompan=z='min(zoom+0.001,1.10)':d=120:s=540x960:fps=30,format=yuv420p",
        ]
      : []),
    "-t", "4",
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-an",
    "-movflags", "+faststart",
    "-y",
    temporaryPath,
  ];

  try {
    await execFileAsync(ffmpegPath, args);
    if (existsSync(outputPath)) unlinkSync(outputPath);
    renameSync(temporaryPath, outputPath);
    return { slug: template.slug, status: "generated" };
  } catch (error) {
    if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
    return { slug: template.slug, status: "failed", error: error.message };
  }
}

async function main() {
  if (!existsSync(ffmpegPath)) {
    console.error("ffmpeg not found. Run: npm install");
    process.exit(1);
  }

  mkdirSync(outputDir, { recursive: true });

  const selectedTemplates = selectedSlug
    ? videoTemplates.filter((template) => template.slug === selectedSlug)
    : videoTemplates;
  console.log(`Generating ${selectedTemplates.length} video previews...`);

  let generated = 0;
  let existing = 0;
  let failed = 0;

  for (const template of selectedTemplates) {
    const result = await generateVideo(template);
    if (result.status === "generated") {
      generated++;
      console.log(`  [generated] ${template.slug}`);
    } else if (result.status === "exists") {
      existing++;
      console.log(`  [exists]    ${template.slug}`);
    } else {
      failed++;
      console.log(`  [failed]    ${template.slug}: ${result.error}`);
    }
  }

  console.log(`\nDone. Generated: ${generated}, Existing: ${existing}, Failed: ${failed}`);
  console.log(`Output directory: ${outputDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

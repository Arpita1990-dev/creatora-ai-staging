/**
 * Cleanup script: Remove ALL audio templates from database.
 * Also removes audio-related entries from expandedTemplateSubjects.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('=== Removing Audio Templates ===\n');

  // Get all templates
  const allTemplates = await prisma.template.findMany({
    select: { slug: true, name: true, configuration: true },
  });

  const audioSlugs = [];
  for (const t of allTemplates) {
    try {
      const config = JSON.parse(t.configuration || '{}');
      if (config.outputType === 'Audio' || config.audio === true) {
        audioSlugs.push(t.slug);
      }
    } catch {}
  }

  console.log(`Found ${audioSlugs.length} audio templates:`);
  audioSlugs.forEach(s => console.log(`  - ${s}`));

  if (audioSlugs.length > 0) {
    const result = await prisma.template.deleteMany({
      where: { slug: { in: audioSlugs } },
    });
    console.log(`\nDeleted ${result.count} audio templates.`);
  }

  // Verify
  const remaining = await prisma.template.findMany({
    select: { slug: true, configuration: true },
  });
  let remainingAudio = 0;
  for (const t of remaining) {
    try {
      const config = JSON.parse(t.configuration || '{}');
      if (config.outputType === 'Audio' || config.audio === true) remainingAudio++;
    } catch {}
  }
  console.log(`\nRemaining audio templates: ${remainingAudio}`);
  console.log(`Total templates: ${remaining.length}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

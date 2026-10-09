/**
 * Migration script: Remove audio templates and in-progress projects.
 *
 * 1. Deletes all templates with outputType "Audio" from the database.
 * 2. Deletes all projects with status "IN_PROGRESS" from the database.
 * 3. Re-seeds video templates to replace the removed audio templates.
 */
import { PrismaClient } from '@prisma/client';
import { execFileSync } from 'node:child_process';

const prisma = new PrismaClient();

async function main() {
  console.log('=== CreateoraAI Migration: Remove Audio Templates & In-Progress Projects ===\n');

  // ── Step 1: Count and delete audio templates ──────────────────────────────
  const allTemplates = await prisma.template.findMany({
    select: { slug: true, name: true, configuration: true },
  });

  const audioSlugs = [];
  for (const t of allTemplates) {
    try {
      const config = JSON.parse(t.configuration || '{}');
      if (config.outputType === 'Audio') {
        audioSlugs.push(t.slug);
      }
    } catch {}
  }

  console.log(`Found ${audioSlugs.length} audio templates to remove.`);

  if (audioSlugs.length > 0) {
    const deleteResult = await prisma.template.deleteMany({
      where: { slug: { in: audioSlugs } },
    });
    console.log(`Deleted ${deleteResult.count} audio templates from database.`);
  }

  // ── Step 2: Delete in-progress projects ──────────────────────────────────
  const inProgressProjects = await prisma.project.findMany({
    where: { status: 'IN_PROGRESS' },
    select: { id: true, name: true },
  });

  console.log(`\nFound ${inProgressProjects.length} in-progress projects to remove.`);
  inProgressProjects.forEach(p => console.log(`  - ${p.id}: ${p.name}`));

  if (inProgressProjects.length > 0) {
    const deleteResult = await prisma.project.deleteMany({
      where: { status: 'IN_PROGRESS' },
    });
    console.log(`Deleted ${deleteResult.count} in-progress projects from database.`);
  }

  // ── Step 3: Re-seed templates (adds new video templates, skips existing) ─
  console.log('\nRe-seeding templates to add video replacements...');
  try {
    execFileSync(process.execPath, ['prisma/seedTemplates.mjs'], {
      cwd: process.cwd(),
      timeout: 60_000,
      stdio: 'inherit',
      windowsHide: true,
    });
    console.log('Template re-seed complete.');
  } catch (error) {
    console.error('Template re-seed failed:', error.message);
  }

  // ── Verification ─────────────────────────────────────────────────────────
  const allRemaining = await prisma.template.findMany({
    select: { configuration: true },
  });
  let remainingAudio = 0;
  let totalVideo = 0;
  for (const t of allRemaining) {
    try {
      const config = JSON.parse(t.configuration || '{}');
      if (config.outputType === 'Audio') remainingAudio++;
      if (config.outputType === 'Video + Copy') totalVideo++;
    } catch {}
  }
  const remainingInProgress = await prisma.project.count({
    where: { status: 'IN_PROGRESS' },
  });
  const totalTemplates = allRemaining.length;

  console.log('\n=== Verification ===');
  console.log(`Audio templates remaining: ${remainingAudio}`);
  console.log(`In-progress projects remaining: ${remainingInProgress}`);
  console.log(`Total templates: ${totalTemplates}`);
  console.log(`Video templates: ${totalVideo}`);
  console.log('\nMigration complete.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

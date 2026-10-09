import fs from 'node:fs';

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^"|"$/g, '');
  }
}

loadEnvFile('.env');
loadEnvFile('.env.local');

const intervalMs = Math.max(2000, Number(process.env.CAMPAIGN_WORKER_INTERVAL_MS || 10000));
const { prisma } = await import('../lib/prisma.js');
const { processPendingGenerationJobs, syncGenerationJob } = await import('../lib/generationJobs.js');
const { startGenerationQueueWorker } = await import('../lib/generationQueue.js');
let running = false;

const queueWorker = startGenerationQueueWorker(async (generationJobId) => {
  const job = await prisma.generationJob.findUnique({ where: { id: generationJobId } });
  if (job) await syncGenerationJob(job);
});

async function tick() {
  if (running) return;
  running = true;
  try {
    const jobs = await processPendingGenerationJobs(Number(process.env.GENERATION_WORKER_BATCH_SIZE || 10));
    if (jobs.length) console.log(`Processed ${jobs.length} generation job(s).`);
  } catch (error) {
    console.error('Generation worker cycle failed:', error.message || error);
  } finally {
    running = false;
  }
}

console.log(`Generation worker polling every ${intervalMs}ms.`);
if (queueWorker) console.log('Redis/BullMQ generation consumer started.');
await tick();
setInterval(tick, intervalMs);

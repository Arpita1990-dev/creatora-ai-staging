import { Queue, Worker } from 'bullmq';

const queueName = 'creatora-generation';
let queue;

function connectionOptions() {
  if (!process.env.REDIS_URL) return null;
  const url = new URL(process.env.REDIS_URL);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db: url.pathname?.length > 1 ? Number(url.pathname.slice(1)) : 0,
    tls: url.protocol === 'rediss:' ? {} : undefined,
    connectTimeout: Number(process.env.REDIS_CONNECT_TIMEOUT_MS || 3000),
    maxRetriesPerRequest: null,
  };
}

export async function enqueueGenerationJob(generationJobId) {
  const connection = connectionOptions();
  if (!connection) return false;
  queue ||= new Queue(queueName, { connection, defaultJobOptions: { attempts: 1, removeOnComplete: 1000, removeOnFail: 5000 } });
  await queue.add('generate', { generationJobId }, { jobId: generationJobId });
  return true;
}

export function startGenerationQueueWorker(processor) {
  const connection = connectionOptions();
  if (!connection) return null;
  const worker = new Worker(queueName, async (queueJob) => processor(queueJob.data.generationJobId), { connection, concurrency: Math.max(1, Number(process.env.GENERATION_WORKER_CONCURRENCY || 2)) });
  worker.on('failed', (job, error) => console.error('Generation queue job failed', { jobId: job?.id, message: error.message }));
  return worker;
}


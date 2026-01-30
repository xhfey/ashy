import 'dotenv/config';
import { Redis } from '@upstash/redis';

if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
  console.error('Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN in environment.');
  process.exit(1);
}

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

async function testLatency() {
  const times = [];

  for (let i = 0; i < 10; i++) {
    const start = Date.now();
    await redis.ping();
    times.push(Date.now() - start);
  }

  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  console.log('Ping times (ms):', times);
  console.log('Average:', avg);
}

testLatency().catch((err) => {
  console.error('Latency test failed:', err);
  process.exit(1);
});

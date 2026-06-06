import { Queue, type JobsOptions } from "bullmq";
import IORedis from "ioredis";

import type { QueueName, QueuePayload } from "@99freelas/core";

export const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: {
    type: "exponential",
    delay: 5000,
  },
  removeOnComplete: 1000,
  removeOnFail: 5000,
};

export function createRedisConnection(redisUrl: string): IORedis {
  return new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
}

export class QueueProducer {
  private readonly connection: IORedis;
  private readonly queues = new Map<QueueName, Queue>();

  constructor(private readonly redisUrl: string) {
    this.connection = createRedisConnection(redisUrl);
  }

  async enqueue<TQueueName extends QueueName>(
    queueName: TQueueName,
    payload: QueuePayload<TQueueName>,
    options?: JobsOptions,
  ): Promise<{ jobId: string }> {
    const queue = this.getQueue(queueName);
    const job = await queue.add(queueName, payload, options ?? DEFAULT_JOB_OPTIONS);

    return {
      jobId: job.id ?? `${queueName}:unknown`,
    };
  }

  async close(): Promise<void> {
    await Promise.all([...this.queues.values()].map((queue) => queue.close()));
    await this.connection.quit();
  }

  private getQueue(queueName: QueueName): Queue {
    const existing = this.queues.get(queueName);

    if (existing) {
      return existing;
    }

    const queue = new Queue(queueName, {
      connection: this.connection,
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    });

    this.queues.set(queueName, queue);
    return queue;
  }
}


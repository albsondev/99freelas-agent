export type ProcessorProducer = {
  enqueue: (...args: any[]) => Promise<{ jobId: string }>;
};

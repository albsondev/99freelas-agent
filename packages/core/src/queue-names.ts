export const QueueNames = {
  EMAIL_POLL: "email.poll",
  EMAIL_PARSE: "email.parse",
  OPPORTUNITY_FETCH: "opportunity.fetch",
  OPPORTUNITY_PARSE: "opportunity.parse",
  OPPORTUNITY_SCORE: "opportunity.score",
  PROPOSAL_GENERATE: "proposal.generate",
  PROPOSAL_SUBMIT: "proposal.submit",
  NOTIFICATION_SEND: "notification.send",
} as const;

export type QueueName = (typeof QueueNames)[keyof typeof QueueNames];


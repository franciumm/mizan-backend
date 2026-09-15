import { overviewSchema, playbookSchema } from './schema.js';

// Suggested methods are drafts, never presented as procedures already used or validated.
const playbooks = [
  {
    _id: 'research-business', title: 'Research a business before choosing a distribution test',
    purpose: 'Draft a focused view of the customer, problem, offer, and plausible routes to reach them.',
    whenToUse: 'Before designing a distribution experiment for HustlIQ or a participating business.',
    prerequisites: 'The founder’s description of the business; product or offer links; any real customer conversations. Mark missing information as unknown.',
    steps: '1. Write down the business model and the customer it aims to serve.\n2. Separate founder claims from observed customer evidence.\n3. Identify the problem, current alternatives, and why someone might switch.\n4. Collect relevant places, conversations, and opportunities where those customers can be reached. Save source links.\n5. Compare possible messages and channels against the evidence.\n6. Choose one uncertain assumption for a small test. Record why it matters and what would change your mind.',
    expectedOutput: 'A brief containing the customer, problem, offer, source links, unknowns, and one proposed test.',
    pitfalls: 'Treating a plausible story as demand; assuming different businesses share the same channel; confusing willingness to participate with willingness to pay.',
    assumptions: 'Suggested procedure. Adapt it after using it; effectiveness has not been established.',
    changeNotes: 'Initial draft prepared for this workspace.', sourceEventIds: [],
  },
  {
    _id: 'distribution-test', title: 'Run and document a distribution experiment',
    purpose: 'Learn whether a particular customer, offer, message, or channel deserves another test.',
    whenToUse: 'When a research question can be tested through a concrete action.',
    prerequisites: 'One hypothesis; a reachable audience; an offer or message; a practical limit on effort; access to the resulting conversations.',
    steps: '1. Create an Experiment event and link the discovery or decision that prompted it.\n2. Record the hypothesis and what outcome would support or challenge it before acting.\n3. Specify the audience, channel, message, and actual action.\n4. Carry out the test and add updates to the same event.\n5. Record the actual exposure and responses, including objections and silence. Keep unknown counts unknown.\n6. Compare the outcome with your expectation. Explain limitations and alternative explanations.\n7. Record the next decision and link it back to this experiment.',
    expectedOutput: 'An event with the original expectation, observed result, evidence, lesson, and next step.',
    pitfalls: 'Changing too many assumptions at once; counting activity as demand; interpreting a weak test as proof that the whole business cannot work.',
    assumptions: 'Suggested procedure. Success criteria depend on the specific experiment.',
    changeNotes: 'Initial draft prepared for this workspace.', sourceEventIds: [],
  },
  {
    _id: 'direction-review', title: 'Review whether to continue, change direction, or pause',
    purpose: 'Make a deliberate decision using the accumulated journey and current constraints.',
    whenToUse: 'After a meaningful set of experiments, a major discovery, or a change in your ability to continue.',
    prerequisites: 'Relevant events, results, limitations, current assumptions, and your own capacity and priorities.',
    steps: '1. Revisit why you started and what you are trying to achieve now.\n2. Gather the experiments and discoveries relevant to the current direction.\n3. Separate evidence that supports it, evidence that challenges it, mixed results, and unresolved questions.\n4. Check whether the tests were strong enough to support a decision.\n5. Compare continuing, changing direction, and pausing. Write the tradeoffs for each.\n6. Record your decision as a Review event, linking the evidence events.\n7. State what new evidence would make you reconsider, and update the current focus if it changed.',
    expectedOutput: 'A reasoned review with linked evidence, alternatives, a decision, and conditions for reconsidering it.',
    pitfalls: 'Continuing only because of past effort; pivoting after one inconclusive attempt; forgetting that personal capacity is part of the decision.',
    assumptions: 'Suggested reflection guide. There is no automatic score or predetermined recommendation.',
    changeNotes: 'Initial draft prepared for this workspace.', sourceEventIds: [],
  },
];

export const journeySeed = [
  ...playbooks.map(({ _id, ...data }) => ({ _id, kind: 'playbook', data: playbookSchema.parse(data), revision: 0 })),
  { _id: 'hustliq-overview', kind: 'overview', revision: 0, data: overviewSchema.parse({}) },
];

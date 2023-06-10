import { context, octokit } from './github';
import { labels } from './constants';

export const getOpenedIssues = async () => {
  const issues = await octokit().rest.issues.listForRepo({
    state: 'open',
    per_page: 100,
    ...context().repo
  });

  return issues.data;
};

export const findWaitingIssues = async () => {
  const issues = await getOpenedIssues();

  return issues.filter(issue => {
    return issue.labels.some(label => {
      if (typeof label !== 'string') {
        return label.name === labels.waiting;
      } else {
        return label === labels.waiting;
      }
    });
  });
};

export const markIssueAs = async (issueNumber: number, updatedLabels: string[]) => {
  const shouldClosed = updatedLabels.length === 1 && updatedLabels[0] === labels.losing;

  if (!shouldClosed) {
    await octokit().rest.issues.createComment({
      issue_number: issueNumber,
      body: `@${context().repo.owner} ${updatedLabels.length}게임에 당첨됐습니다!`,
      ...context().repo
    });
  }

  return octokit().rest.issues.update({
    ...context().repo,
    state: shouldClosed ? 'closed' : 'open',
    issue_number: issueNumber,
    labels: updatedLabels
  });
};

export const createPurchaseIssue = async (date: string, body: string) => {
  return octokit().rest.issues.create({
    labels: [labels.waiting],
    title: date,
    body: body,
    ...context().repo
  });
};

export const initLabels = async () => {
  const labelInformation = Object.entries(labels);

  const allLabels = (await octokit().rest.issues.listLabelsForRepo({ ...context().repo })).data;
  if (allLabels.length !== labelInformation.length) {
    // Clear all labels
    await Promise.all(allLabels.map(it => octokit().rest.issues.deleteLabel({ name: it.name, ...context().repo })));

    // Create labels
    const promises = labelInformation.map(tryCreateLabel);
    await Promise.allSettled(promises);
  }
};

const tryCreateLabel = async ([description, name]: [string, string]) => {
  return octokit().rest.issues.createLabel({ name, description, ...context().repo });
};

export const rankToLabel = (rank: number): string => {
  return (
    [labels.losing, labels.winning_1st, labels.winning_2nd, labels.winning_3rd, labels.winning_4th, labels.winning_5th][
      rank
    ] ?? labels.losing
  );
};

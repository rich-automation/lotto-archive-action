import { context, octokit } from './github';
import dayjs from 'dayjs';
import { labels } from './constants';

export const getOpenedIssues = async () => {
  const issues = await octokit().rest.issues.listForRepo({
    state: 'open',
    per_page: 100,
    ...context().repo
  });

  return issues.data;
};

export const findLastPurchaseIssue = async () => {
  const issues = await getOpenedIssues();

  return issues
    .filter(issue => {
      console.log(issue.labels);

      return true;
    })
    .at(0);
};

export const createPurchaseIssue = async () => {
  return octokit().rest.issues.create({
    labels: [labels.waiting],
    title: `${dayjs().format('YYYY-MM-DD')}`,
    body: 'date: 2023-06-10\n' + 'numbers: [[1,2,3,4,5,6], [1,2,3,4,5,6]]\n' + 'link: https://www.naver.com',
    ...context().repo
  });
};

export const initLabels = async () => {
  const promises = Object.entries(labels).map(tryCreateLabel);
  await Promise.all(promises);
};

const tryCreateLabel = async ([description, name]: [string, string]) => {
  try {
    await octokit().rest.issues.createLabel({ name, description, ...context().repo });
  } catch {}
};

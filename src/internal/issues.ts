import { context, octokit } from './github';

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

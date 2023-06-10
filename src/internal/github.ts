import { getOctokit, context as ctx } from '@actions/github';
import core from '@actions/core';
import { inputKeys } from './constants';

let _octokit: ReturnType<typeof getOctokit>;

export const octokit = () => {
  if (_octokit) return _octokit;
  const token = core.getInput(inputKeys.githubToken);
  _octokit = getOctokit(token);
  return _octokit;
};

export const context = () => {
  return ctx;
};

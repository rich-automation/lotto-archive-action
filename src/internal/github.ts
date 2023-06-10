import * as github from '@actions/github';
import * as core from '@actions/core';
import { inputKeys } from './constants';

let _octokit: ReturnType<typeof github.getOctokit>;

export const octokit = () => {
  if (_octokit) return _octokit;
  const token = core.getInput(inputKeys.githubToken);
  _octokit = github.getOctokit(token);
  return _octokit;
};

export const context = () => {
  return github.context;
};

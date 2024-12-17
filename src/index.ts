import * as core from '@actions/core';
import { createWaitingIssue, getWaitingIssues, initLabels, markIssueAsChecked, rankToLabel } from './internal/issues';
import { getNextLottoRound } from '@rich-automation/lotto';
import { inputKeys } from './internal/constants';
import { bodyBuilder, bodyParser } from './internal/bodyHandlers';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { LottoRunner } from './LottoRunner';

dayjs.extend(utc);
dayjs.extend(timezone);

const controller = 'playwright';
const debugFlag = core.getBooleanInput(inputKeys.debug) ?? false;

const runner = new LottoRunner({ controller, debug: debugFlag });

runner.prepare = async function (service) {
  await initLabels();

  core.info(`💸 기본 환경을 설정하고 로그인을 진행합니다.`);

  const id = core.getInput(inputKeys.lottoId);
  const pwd = core.getInput(inputKeys.lottoPassword);

  if (id !== '' && pwd !== '') {
    await service.signIn(id, pwd);
  }
};

runner.postRun = async function (service) {
  core.info(`💸 당첨 발표를 확인합니다.`);

  const waitingIssues = await getWaitingIssues();
  if (waitingIssues.length > 0) {
    core.info(`💸 총 ${waitingIssues.length}개의 티켓에 대해서 당첨 내역을 확인합니다.`);

    const promises = waitingIssues.map(async issue => {
      if (issue.body) {
        const { numbers, round } = bodyParser(issue.body);

        const result = await service.check(numbers, round);
        const ranks = result.map(it => it.rank);

        const rankLabels = [...new Set(ranks.map(it => rankToLabel(it)))];
        await markIssueAsChecked(issue.number, rankLabels);
      }
    });

    const result = await Promise.allSettled(promises);
    const rejectedIssues = result.filter(it => it.status === 'rejected');
    if (rejectedIssues.length > 0) {
      core.info(`💸 ${rejectedIssues.length}개의 티켓을 처리하는 중 오류가 발생했습니다.`);
    }
  } else {
    core.info('💸 확인 할 구매 내역이 없습니다.');
  }
};

runner.run = async function (service) {
  core.info('💸 로또를 구매합니다.');

  try {
    const amountInput = Number(core.getInput(inputKeys.lottoPurchaseAmount)) || 5;
    const amount = Math.max(1, Math.min(amountInput, 5));

    const date = dayjs.tz(dayjs(), 'Asia/Seoul').format('YYYY-MM-DD');
    const numbers = await service.purchase(amount);
    if (numbers.length > 0) {
      core.info('💸 로또 구매 완료!');

      const round = getNextLottoRound();
      const link = service.getCheckWinningLink(numbers, round);

      core.info('💸 구매 내역에 대한 이슈를 생성합니다.');
      const issueBody = bodyBuilder({ date, round, numbers, link });
      await createWaitingIssue(date, issueBody);
      core.info('💸 이슈 생성 완료.');
    } else {
      core.info('💸 구매가 정상적으로 이루어지지 않은것 같네요, 구매한 번호 조회에 실패했어요!');
    }
  } catch (e) {
    if (e instanceof Error) {
      core.info(`💸 로또 구매에 실패했습니다. ${e}`);
      core.setFailed(e.message);
    }
  }
};

runner.onError = function (error) {
  if (error instanceof Error) {
    core.info(`💸 GitHub Actions 실행에 실패했습니다. ${error}`);
    core.setFailed(error.message);
  }

  process.exit(0);
};

runner.start();

import * as core from '@actions/core';
import { createPurchaseIssue, findLastPurchaseIssue } from './internal/issues';

async function run() {
  // const id = core.getInput(inputKeys.lottoId);
  // const pwd = core.getInput(inputKeys.lottoPassword);

  // const lottoService = new LottoService({ headless: true });
  // await lottoService.signIn(id, pwd);
  // const numbers = await lottoService.purchase(5);

  // 지난주에 구매한 이슈 확인 > 당첨여부 확인 후 이슈 업데이트 > 당첨금액 확인
  // findLastPurchaseIssue

  const createdIssue = await createPurchaseIssue();
  console.log('createdIssue:', JSON.stringify(createdIssue));

  const lastIssue = await findLastPurchaseIssue();
  console.log('lastIssue:', JSON.stringify(lastIssue));

  try {
    // 구매 시도
    // const numbers = await lottoService.purchase(5);
    // 구매 성공하면 이슈 생성, 링크 포함
    // const nextRound = getCurrentLottoRound() + 1;
    // const link = lottoService.getCheckWinningLink(nextRound, numbers);
  } catch (e) {
    core.info(`로또 구매에 실패했습니다. ${e}`);
  }
}

run();

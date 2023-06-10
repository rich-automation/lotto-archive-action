var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import core from '@actions/core';
import { findLastPurchaseIssue } from './internal/issues';
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        // const id = core.getInput(inputKeys.lottoId);
        // const pwd = core.getInput(inputKeys.lottoPassword);
        // const lottoService = new LottoService({ headless: true });
        // await lottoService.signIn(id, pwd);
        // const numbers = await lottoService.purchase(5);
        // 지난주에 구매한 이슈 확인 > 당첨여부 확인 후 이슈 업데이트 > 당첨금액 확인
        // findLastPurchaseIssue
        const issue = yield findLastPurchaseIssue();
        console.log('issue:', JSON.stringify(issue));
        try {
            // 구매 시도
            // const numbers = await lottoService.purchase(5);
            // 구매 성공하면 이슈 생성, 링크 포함
            // const nextRound = getCurrentLottoRound() + 1;
            // const link = lottoService.getCheckWinningLink(nextRound, numbers);
        }
        catch (e) {
            core.info(`로또 구매에 실패했습니다. ${e}`);
        }
    });
}
run();

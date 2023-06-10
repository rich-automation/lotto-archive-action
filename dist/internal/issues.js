var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { context, octokit } from './github';
export const getOpenedIssues = () => __awaiter(void 0, void 0, void 0, function* () {
    const issues = yield octokit().rest.issues.listForRepo(Object.assign({ state: 'open', per_page: 100 }, context().repo));
    return issues.data;
});
export const findLastPurchaseIssue = () => __awaiter(void 0, void 0, void 0, function* () {
    const issues = yield getOpenedIssues();
    return issues
        .filter(issue => {
        console.log(issue.labels);
        return true;
    })
        .at(0);
});

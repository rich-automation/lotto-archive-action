# lotto-actions

이 액션은 깃허브 액션을 통해 한국의 로또 6/45 게임을 구매하기 위해 만들어졌습니다.

## 사용방법

이 액션을 사용하기 위해서는 아래의 사항들이 필요합니다.

- 로또 게임 구매를 위한 깃허브 저장소를 새롭게 생성합니다.
- [동행복권](https://www.dhlottery.co.kr/) 아이디와 패스워드를 깃허브 저장소의 [Secrets](https://docs.github.com/ko/actions/security-guides/encrypted-secrets#creating-encrypted-secrets-for-a-repository) 에 저장합니다.
- **동행복권 아이디에는 예치금이 충전되어있어야 합니다.**
- 깃허브 저장소에 cron 이벤트를 수신할 수 있는 워크플로우를 생성해야 합니다. 그 후, 아래와 같이 워크플로우에 다음과 같은 단계를 추가합니다.

```yaml
name: Lotto purchase (cron)
on:
  schedule:
    # 매 주 수요일 오후 12시, Github Actions 에서는 UTC 기준으로 실행됨
    # https://elmah.io/tools/cron-parser/
    - cron: '0 3 * * 3'

jobs:
  run-actions:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: rich-automation/lotto-actions@0.0.4
        with:
          id: ${{ secrets.ID }}
          pwd: ${{ secrets.PASSWORD }}
          token: ${{ secrets.GITHUB_TOKEN }}
```

## 입력값

| name     | description                                                             | required |
| -------- | ----------------------------------------------------------------------- | -------- |
| `token`  | The GitHub access token used to authenticate with the Octokit instance. | Yes      |
| `id`     | 동행복권 사이트의 아이디.                                               | Yes      |
| `pwd`    | 동행복권 사이트의 비밀번호.                                             | Yes      |
| `amount` | 구매할 게임의 수량 (최대 5게임).                                        | No       |

## 설명

1주일에 한번 해당 액션이 실행되도록 설정하면, 1주일마다 정해진 시간에 아래 동작을 순차적으로 실행합니다.

- 이슈에 등록된 지난주에 구매한 게임의 당첨번호를 확인하고, 당첨되지 않으면 이슈를 닫습니다.
- 당첨이 된 경우에는 저장소의 소유자를 코멘트에 멘션하여 당첨 사실을 알려주고, 당첨 등수 라벨을 달아줍니다.
- 당첨 확인이 끝나면, 로또를 구매하고 저장소의 이슈에 등록합니다.

### 주의사항

- 인터넷 로또는 1주일에 최대 5게임까지 구매가 가능합니다.
- 인터넷 로또는 구매 가능한 시간대가 정해져있습니다.
  > 추첨일(토요일)에는 오후 8시에 판매 마감합니다. 추첨일 오후 8시부터 다음날(일요일) 오전 6시까지는 판매가 정지됩니다.
- 레포는 Public/Private 모두 가능하지만, Public 의 경우 무료로 사용할 수 있습니다. Private 레포의 경우 일정량의 무료 사용량에서 차감됩니다.
  > https://docs.github.com/en/billing/managing-billing-for-github-actions/about-billing-for-github-actions

## 예제

다음의 저장소 설정을 참고하세요.

- https://github.com/bang9/lotto-purchase

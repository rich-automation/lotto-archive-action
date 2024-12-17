# lotto-archive-action

이 액션은 한국의 로또 6/45 게임 기록을 아카이빙 하기 위해서 만들어졌습니다.  
이 액션에는 구매하는 기능은 없으며, 당첨번호를 확인하고 이슈에 기록하는 기능만을 제공합니다.

> [!WARNING]
> 구매는 [동행복권](https://www.dhlottery.co.kr/) 사이트에서 직접 구매하셔야 합니다.  
> 깃허브 액션으로 로또를 구매하는것은 동행 복권의 이용 약관과 깃허브 서비스 정책에 위반되므로, 이에 대한 책임을 본 액션의 제공자는 지지 않습니다.

## 사용방법

이 액션을 사용하기 위해서는 아래의 단계를 따라주세요.

- 로또 게임 기록을 위한 깃허브 저장소를 새롭게 생성합니다.
- 구매한 로또 게임 당첨 번호와 회차를 액션의 input 으로 전달합니다.
- 당첨 번호와 회차를 기록하는 시점에, 이전 회차의 당첨 여부를 확인하고 아카이빙 합니다.

### 메뉴얼하게 입력하는 예제

```yaml
name: Lotto Archive

on:
  workflow_dispatch: # 수동 실행 트리거
    inputs:
      numbersArray:
        description: '구매한 로또 번호 배열 (예: [[1,2,3,4,5,6],[7,8,9,10,11,12]])'
        required: true
        type: string
      round:
        description: '로또 회차 번호'
        required: true
        type: number

jobs:
  lotto-archive:
    runs-on: ubuntu-latest

    steps:
      - uses: rich-automation/lotto-archive-action@latest
        with:
          numbersArray: ${{ inputs.numbersArray }}
          round: ${{ inputs.round }}
          token: ${{ secrets.GITHUB_TOKEN }}
```

## 입력값

| name           | description                                                  | required |
| -------------- | ------------------------------------------------------------ | -------- |
| `numbersArray` | 구매한 로또 번호 배열 (예: [[1,2,3,4,5,6],[7,8,9,10,11,12]]) | Yes      |
| `round`        | 로또 회차 번호                                               | Yes      |
| `token`        | GitHub Actions 에서 사용할 토큰                              | Yes      |
| `debug`        | GitHub Actions 에 디버그 로그를 출력합니다                   | No       |

## 설명

해당 액션이 실행되면 아래 동작을 순차적으로 실행합니다.

- 이슈에 등록된 이전에 구매한 게임들의 당첨번호를 확인하고, 당첨되지 않으면 이슈를 닫습니다.
- 당첨이 된 경우에는 저장소의 소유자를 코멘트에 멘션하여 당첨 사실을 알려주고, 당첨 등수 라벨을 달아줍니다.
- 당첨 확인이 끝나면, 등록하려는 구매한 로또 번호를 저장소의 이슈에 등록합니다.

### 참고사항

- 인터넷 로또는 1주일에 최대 5게임까지 구매가 가능합니다.
- 인터넷 로또는 구매 가능한 시간대가 정해져있습니다.
  > 추첨일(토요일)에는 오후 8시에 판매 마감합니다. 추첨일 오후 8시부터 다음날(일요일) 오전 6시까지는 판매가 정지됩니다.
- 레포는 Public/Private 모두 가능하지만, Public 의 경우 무료로 사용할 수 있습니다. Private 레포의 경우 일정량의 무료 사용량에서 차감됩니다.
  > https://docs.github.com/en/billing/managing-billing-for-github-actions/about-billing-for-github-actions
- GitHub Action 의 경우 퍼블릭 레포에 60일간 활동이 없으면 워크플로우가 자동으로 정지가 되니, 이메일을 잘 확인하거나 워크플로우가 비활성화 되지 않도록 주의하세요! ([링크](https://docs.github.com/ko/actions/using-workflows/disabling-and-enabling-a-workflow))

export const inputKeys = {
  lottoId: 'id',
  lottoPassword: 'pwd',
  githubToken: 'token'
};
export const emojis = {
  // waiting
  hourglass: ':hourglass:',
  // winning
  tada: ':tada:',
  confetti_ball: ':confetti_ball:',
  medal_1st: ':1st_place_medal:',
  medal_2nd: ':2nd_place_medal:',
  medal_3rd: ':3rd_place_medal:',
  one: ':one:',
  two: ':two:',
  three: ':three:',
  four: ':four:',
  five: ':five:',
  // losing
  skull: ':skull_and_crossbones:'
};

export const labels = {
  waiting: `${emojis.hourglass}`,
  losing: `${emojis.skull}`,
  winning_1st: `${emojis.confetti_ball} ${emojis.medal_1st}`,
  winning_2nd: `${emojis.confetti_ball} ${emojis.medal_2nd}`,
  winning_3rd: `${emojis.confetti_ball} ${emojis.medal_3rd}`,
  winning_4th: `${emojis.tada} ${emojis.four}`,
  winning_5th: `${emojis.tada} ${emojis.five}`
};

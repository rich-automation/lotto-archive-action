interface BodyInterface {
  date: string;
  round: number;
  numbers: number[][];
  link: string;
}

export const bodyParser = (body: string): BodyInterface => {
  const [dateLine = '', roundLine = '', numbersLine = '[]', linkLine = ''] = body.split('\n');

  return {
    date: getValue(dateLine),
    round: Number(getValue(roundLine)),
    numbers: JSON.parse(getValue(numbersLine)),
    link: getValue(linkLine)
  };
};

export const bodyBuilder = (body: BodyInterface) => {
  return (
    `date: ${body.date}\n` +
    `round: ${body.round}\n` +
    `numbers: ${JSON.stringify(body.numbers)}\n` +
    `link: ${body.link}`
  );
};

const getValue = (line: string) => {
  return line.split(':')[1]?.trim() ?? '';
};

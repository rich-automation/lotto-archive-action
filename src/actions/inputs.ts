import { InputBuilder } from '../InputBuilder';

const builder = new InputBuilder();

export const inputs = builder
  .set('numbersArray', {
    required: true,
    type: {
      type: 'array',
      value: {
        type: 'array',
        value: 'number'
      }
    }
  })
  .set('round', {
    required: true,
    type: 'number'
  })
  .set('token', {
    required: true,
    type: 'string'
  })
  .set('debug', {
    required: false,
    type: 'boolean'
  })
  .build();

/* eslint-disable @typescript-eslint/no-explicit-any */

import * as core from '@actions/core';

type SchemaType =
  | 'string'
  | 'number'
  | 'boolean'
  | { type: 'array'; value: SchemaType }
  | { type: 'object'; properties: Record<string, SchemaType> };

interface InputConfig {
  required: boolean;
  type: SchemaType;
}

type ResolveSchema<T extends SchemaType> = T extends 'string'
  ? string
  : T extends 'number'
  ? number
  : T extends 'boolean'
  ? boolean
  : T extends { type: 'array'; value: SchemaType }
  ? ResolveSchema<T['value']>[]
  : T extends { type: 'object'; properties: Record<string, SchemaType> }
  ? { [K in keyof T['properties']]: ResolveSchema<T['properties'][K]> }
  : never;

export class InputBuilder<T extends Record<string, InputConfig>> {
  private configs: T;

  constructor() {
    this.configs = {} as T;
  }

  set<K extends string, V extends InputConfig>(key: K, config: V): InputBuilder<T & Record<K, V>> {
    (this.configs as any)[key] = config;
    return this as any;
  }

  build(): { [K in keyof T]: ResolveSchema<T[K]['type']> } {
    const result: any = {};
    for (const key in this.configs) {
      const config = this.configs[key];
      if (config) {
        const rawValue = core.getInput(key, { required: config.required });
        result[key] = this.validateAndParse(key, rawValue, config.type);
      }
    }
    return result;
  }

  private validateAndParse(key: string, value: any, schema: SchemaType): any {
    if (typeof schema === 'string') {
      return this.parsePrimitive(value, schema);
    } else if (schema.type === 'array') {
      return JSON.parse(value).map((item: any) => this.validateAndParse(key, item, schema.value));
    } else if (schema.type === 'object') {
      const parsed = JSON.parse(value);
      const result: any = {};
      for (const prop in schema.properties) {
        result[prop] = this.validateAndParse(`${key}.${prop}`, parsed[prop], schema.properties[prop] as SchemaType);
      }
      return result;
    }
  }

  private parsePrimitive(value: any, type: string): any {
    if (type === 'string') return value;
    if (type === 'number') {
      const parsed = Number(value);
      if (isNaN(parsed)) throw new Error('Value must be a valid number.');
      return parsed;
    }
    if (type === 'boolean') return value.toLowerCase() === 'true';
    throw new Error(`Unknown type: ${type}`);
  }
}

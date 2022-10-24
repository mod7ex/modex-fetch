declare global {
  declare type TFunction = (...args: any[]) => any;

  type TEmpty = undefined | null;

  declare type Numberish = number | string;

  declare type NullableNumberish = Numberish | undefined | null;

  declare type NoneNullableValueKeys<T extends object> = Value<{
    [K in keyof T]: T[K] extends TEmpty ? never : K;
  }>;

  // **************************************************************************************************** For Test

  declare type IsNotAny<T> = 0 extends 1 & T ? false : true;

  declare type IsTypeEqual<T1, T2> = IsNotAny<T1> extends false ? false : IsNotAny<T2> extends false ? false : [T1] extends [T2] ? ([T2] extends [T1] ? true : false) : false;

  // ****************************************************************************************************
}

export {};

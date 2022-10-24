const DEFAULT = "$";

export type UUID<T extends NullableNumberish = undefined, O extends NullableNumberish = undefined> = `uid-${number}-${number}-${O extends undefined ? (T extends undefined ? typeof DEFAULT : T) : O}`;

/**
 *
 * Assign a default type solved the Type-infering issue
 * since the default value is undefined, the default type also should be indefined
 *
 */
const uuidGen = <T extends NullableNumberish = undefined>(payload?: T) => {
  let state = 0;

  return <O extends NullableNumberish = undefined>(on_the_fly_payload?: O) => {
    state++;

    const _payload = on_the_fly_payload ?? payload ?? DEFAULT;

    return `uid-${Date.now()}-${state}-${_payload}` as UUID<T, O>;
  };
};

export default uuidGen;

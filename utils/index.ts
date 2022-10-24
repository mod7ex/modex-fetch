export const cleanShallowCopy = <T extends Record<string, any>>(target: T) => {
  return Object.entries(target).reduce((prev, [key, value]) => {
    if (value == null) return prev;
    return {
      ...prev,
      [key]: value,
    };
  }, {}) as Pick<T, NoneNullableValueKeys<T>>;
};

interface AbortionOptions {
  timeout: number;
  auto?: boolean;
  reason?: any;
}

export const createAbortion = ({ timeout, auto = true, reason }: AbortionOptions) => {
  const controller = new AbortController();

  // @ts-ignore
  let id: NodeJS.Timeout | undefined;

  const kill = (_reason?: any) => controller.abort(_reason ?? reason);

  const schedule = (_timeout?: number, _reason?: any) => {
    id = setTimeout(() => kill(_reason ?? reason), _timeout ?? timeout);
  };

  if (auto) schedule();

  const clear = () => clearTimeout(id);

  return { controller, clear, schedule, kill };
};

export const headers = (options?: object) => {
  return new Headers({
    "Content-Type": "application/json",
    // 'Content-Length': options?.body?.toString().length,
  });
};

const trim_slash = (str: string): string => {
  const len = str.length;

  if (str.startsWith("/")) return trim_slash(str.slice(1, len));

  if (str.endsWith("/")) return trim_slash(str.slice(0, len - 1));

  return str;
};

export const path_join = (...args: string[]) => {
  return trim_slash(
    args.reduce((prev, curr) => {
      return `${prev}/${trim_slash(curr)}`;
    }, "")
  );
};

export const payload_to_query = (payload: Record<string, Numberish | boolean>, init = "?") => {
  const query = Object.entries(payload)
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  return `${query ? init : ""}${query}`;
};

export const pick = <T extends object, K extends keyof T>(payload: T, keys: K[]) => {
  return keys.reduce((prev, key) => {
    return {
      ...prev,
      [key]: payload[key],
    };
  }, {}) as Pick<T, K>;
};

/* ******************************************************************************************************************** */

export function isPlural<T extends string>(word: T) {
  return word[word.length - 1] === "s";
}

// prettier-ignore
export type Plurify<T extends `${string}`> =
          T extends `${infer F}y`
          ? `${F}ies`
          : T extends `${string}s`
          ? T
          : `${T}s`; // add what you want depending on your use-case

export function plurify<T extends string>(word: T) {
  if (isPlural(word)) return word;

  let plural;

  if (!word) plural = "s";

  const _index = word.length - 1;
  const last_letter = word[_index];

  if (last_letter === "y") plural = `${word.slice(0, _index)}ies`;
  else plural = `${word}s`;

  return plural as Plurify<T>;
}

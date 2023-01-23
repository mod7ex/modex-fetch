// import RequestsMap from "${HOME}/.modex-fetchrc";
import { cleanShallowCopy, createAbortion, headers as default_headers, payload_to_query, path_join, pick, plurify, type Plurify } from "./utils";
import uuidGen from "./utils/uuid";

/* ******************************************************************************************************************** */

const uuid = uuidGen();

interface IMethods {
  GET: "GET" | "get";
  POST: "POST" | "post";
  PUT: "PUT" | "put";
  DELETE: "DELETE" | "delete";
}

type HttpMethod = IMethods[keyof IMethods];

type PostBasedMethod = Exclude<HttpMethod, IMethods["GET"]>;

type RequestKey = string;
// type RequestKey = UUID<Numberish, Numberish>;

type TData = NonNullable<RequestInit["body"]>;

interface IRawRequest<M extends HttpMethod> {
  base_url?: string;
  path?: string;
  timeout?: number;
  params?: Record<string, Numberish | boolean>;
  key?: RequestKey;
  options?: RequestInit;
  method?: M;
  cache?: boolean;
  remember?: boolean;
}

type RawRequest = IRawRequest<IMethods["GET"]> | (IRawRequest<PostBasedMethod> & { data?: TData });

/* ******************************************************************************************************************** */

const DEFAULTS = {
  BASE_URL: "https://dummyjson.com",
  TIMEOUT: 3000,
  PATH: "",
  METHOD: "GET",
  CACHE: true,
  REMEMBER: false,
  CACHE_TTL: 1000 * 60 * 60, // 1h,
};

/* ******************************************************************************************************************** */

const RequestKeySymbol = Symbol("the symbol used aside with the pass in string key to index requests in the weak map");

// type SymbolizedKey = { key: RequestKey; __symbol: typeof RequestKeySymbol };
type SymbolizedKey = { [K in typeof RequestKeySymbol]: RequestKey };

let requestsMap: WeakMap<SymbolizedKey, RawRequest> | undefined; // Key Order

export let keysMap: Map<RequestKey, SymbolizedKey> | undefined;

const symbolizedKey = (key: RequestKey, store = true) => {
  const _key = { [RequestKeySymbol]: key };
  if (store) (keysMap ?? (keysMap = new Map())).set(key, _key);
  return _key;
};

export const store_request = (payload: RawRequest, key: RequestKey = uuid()) => {
  const _key = symbolizedKey(key);

  delete payload.options?.signal;
  delete payload.remember; // so that it won't be stored again on a later request

  (requestsMap ?? (requestsMap = new WeakMap())).set(_key, payload);

  return _key;
};

export const get_request = (key: RequestKey) => {
  const _key = keysMap?.get(key);

  return _key && requestsMap?.get(_key);
};

export const delete_request = (key: RequestKey) => {
  return keysMap?.delete(key) ?? false;
};

export const prepare_request = (payload?: RawRequest) => {
  return {
    base_url: DEFAULTS.BASE_URL,
    timeout: DEFAULTS.TIMEOUT,
    path: DEFAULTS.PATH,
    method: DEFAULTS.METHOD,
    cache: DEFAULTS.CACHE,
    remember: DEFAULTS.REMEMBER,
    ...payload,
  } as RawRequest;
};

/* ******************************************************************************************************************** */

let cacheMap: Map<RequestKey, { timestamp: number; response: Response }> | undefined;

export const cacheResponse = (key: RequestKey, response: Response) => {
  (cacheMap ?? (cacheMap = new Map())).set(key, { timestamp: Date.now(), response });
};

export const clearCachedResponse = (key: RequestKey) => {
  cacheMap?.delete(key) ?? false;
};

export const getCachedResponse = (key: RequestKey) => {
  return cacheMap?.get(key);
};

export const clearCache = () => {
  cacheMap?.clear();
};

/* ******************************************************************************************************************** */

/**
 *
 * we use fetch here we can use some other api like axios <package>
 *
 * https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch#supplying_request_options
 *
 */

const checkResponse = (response: Response) => {
  // console.log(response);

  // the PHP be-like

  if (!response.ok) {
    if (response.status === 404) throw new TypeError("Page not found");
    throw new TypeError("Network response was not OK");
  }
};

const errMsg = (err: any) => {
  // console.log(typeof err);

  if (err?.name == "AbortError") return "Request timeout passed so aborted";

  return err?.message ?? "Something went wrong";
};

const responseToSuccessResult = async <T extends Data>(response: Response, key: RequestKey | undefined) => {
  const data = <T>await response.json();

  return {
    data,
    success: true,
    response,
    key,
  } as const;
};

type Data = Record<string, any>;

type Result<T extends Data, E = any> =
  | { success: false; error: E; message: string; key?: RequestKey }
  | {
      data: T;
      success: true;
      response: Response;
      key?: RequestKey;
    };

/**
 *
 * - by default the cache is on
 */
export const raw_request = async <T extends Data, E = any>(payload?: RawRequest): Promise<Result<T, E>> => {
  const { method, base_url, path, timeout, params, key: _key, options, cache, remember } = prepare_request(payload);

  if (_key) {
    const cached_response = getCachedResponse(_key);

    if (cached_response) {
      if (Date.now() - cached_response.timestamp < DEFAULTS.CACHE_TTL)
        // cache is still valide
        return responseToSuccessResult<T>(cached_response.response, _key);
      else {
        clearCachedResponse(_key); // the key existed for more than an hour
      }
    }
  }

  // generate a random key in case of a none-provided key beside the wish of remembering the request or caching the response
  const key = (cache || remember) && !_key ? uuid() : _key;

  if (remember) store_request(payload!, key);

  const end_point = path_join(base_url!, path!);

  const query = params ? payload_to_query(params) : "";

  const { controller, clear } = createAbortion({
    timeout: timeout!,
    reason: "Request timeout exceeded",
  });

  const headers = {
    ...default_headers(options),
    ...options?.headers,
  };

  const _options: RequestInit = {
    // keep same order !
    signal: controller.signal,
    method: method,
    // @ts-ignore
    body: payload?.data,
    ...options,
    headers,
  };

  try {
    const response = await fetch(end_point + query, _options);

    checkResponse(response);

    // cache only on a success response
    if (cache) cacheResponse(key!, response.clone());

    return responseToSuccessResult<T>(response, key);
  } catch (error: any) {
    console.error("[request error]: ", error);

    return { error, message: errMsg(error), success: false, key };
  } finally {
    clear();
  }
};

export const request = async <T extends Data, E = any>(payload?: RawRequest) => {
  const result = await raw_request<T, E>(payload);

  if (!result.success) return result;

  return {
    ...result,
    /**
     *
     * @param pick_keys
     * @returns object containing only the picked keys
     * @if no argument is passed, it returns the same copy
     * @if the argument is an empty array, it returns an empty plain object
     */
    pick: <P extends keyof T>(pick_keys?: P[]) => {
      const data = result.data;

      return (pick_keys ? pick(data, pick_keys) : data) as keyof T extends P ? T : Pick<T, P>;
    },
  };
};

/* ******************************************************************************************************************** */

export const createRequest = <T extends Data | undefined = undefined, E = undefined>(payload?: RawRequest) => {
  const { controller, clear, schedule, kill } = createAbortion({
    timeout: payload?.timeout ?? DEFAULTS.TIMEOUT,
    auto: false,
  });

  /**
   * the timeout you pass in is only used for the cancel function
   */
  const exe = <_T extends Data | undefined = undefined, _E = undefined>(_payload?: RawRequest) => {
    // type RType = _T extends undefined ? T : _T;
    type RType = _T extends undefined ? (T extends undefined ? Data : T) : _T;
    type RErr = _E extends undefined ? (E extends undefined ? Error : E) : _E;

    const { base_url, path, params, key, method, options, timeout, ...rest } = payload ?? {};

    const { base_url: _base_url, path: _path, params: _params, key: _key, method: _method, options: _options, timeout: _timeout, ..._rest } = _payload ?? {};

    const __payload = cleanShallowCopy({
      key: _key ?? key,
      path: _path ?? path,
      timeout: _timeout ?? timeout,
      base_url: _base_url ?? base_url,
      params: _params ?? params,
      method: _method ?? method,
      ..._rest,
      ...rest,
      options: {
        ...options,
        ..._options,
        signal: controller.signal,
      },
    });

    schedule(__payload.timeout ?? DEFAULTS.TIMEOUT, "Request timeout exceeded");

    return request<RType, RErr>(__payload);
  };

  const cancel = () => {
    clear();
    kill();
  };

  return { exe, cancel };
};

/* ******************************************************************************************************************** */
/**
 *
 * @param payload
 * -- { key: RequestKey; del: 0 | 1 | 2 }
 * - request identifier key
 * - del 0, 1, 2 (0: don't delete, 1: delete if request is success, 2: delete anyway)
 * - by default del is 0
 */
export const resolve = async <T extends Data>({ key, del = 0 }: { key: RequestKey; del?: 0 | 1 | 2 }) => {
  // try later to add an option payload
  const payload = get_request(key);

  if (!payload) return;

  const response = await request<T>(payload);

  if (del) {
    if (del & 1) response.success && delete_request(key);
    else delete_request(key);
  }

  return response;
};

/* ******************************************************************************************************************** */

type Omitted_Method_Payload<M extends HttpMethod> = Omit<IRawRequest<M> & (M extends IMethods["GET"] ? unknown : { data?: TData }), "method">;

type MethodRequest = {
  [M in HttpMethod]: <T extends Data, E = any>(payload?: Omitted_Method_Payload<M>) => ReturnType<typeof request<T, E>>;
};

const method_request = <M extends HttpMethod, T extends Data, E>(method: M = DEFAULTS.METHOD as M, payload?: Omitted_Method_Payload<M>) => {
  return request<T, E>({ ...payload, options: { ...payload?.options, method } });
};

export const http = new Proxy({} as MethodRequest, {
  get(_, method: HttpMethod) {
    return (payload: any) => method_request(method, payload);
  },
});

/* ******************************************************************************************************************** */

// Here is the thing y'all

// type TEntity = keyof typeof RequestsMap | Plurify<keyof typeof RequestsMap>;
type TEntity = string;

// Fix --> string
const entity_to_end_point = (entity: TEntity) => {
  let end_point = Reflect.get(RequestsMap, entity); // put the url in the Map in case of complicated ones

  if (!end_point) end_point = plurify(entity); // otherwise we will just plurify what you provided (entity) & use it as end_point

  return end_point as string;
};

type Omitted_Method_And_Path_Payload<M extends HttpMethod> = Omit<Omitted_Method_Payload<M>, "path">;

type MethodRequestMap = {
  [M in HttpMethod]: <T extends Data, E = any>(payload?: Omitted_Method_And_Path_Payload<M>) => ReturnType<typeof request<T, E>>;
};

/* ******************************************************************************************************************** */

type EntityMethodRequestMap<M extends HttpMethod> = {
  [Key in TEntity]: MethodRequestMap[M];
} & MethodRequest[M];

// ***************** GET
type EntityGETRequest = EntityMethodRequestMap<IMethods["GET"]>;

// ***************** POST
type EntitydPOSTRequest = EntityMethodRequestMap<PostBasedMethod>;

// Fix try using this method_request
const createProxiedMethod = <T extends object>(method: HttpMethod) => {
  return new Proxy({} as T, {
    get(_, entity: TEntity) {
      return async (payload: any) => {
        const path = entity_to_end_point(entity);

        return http[method]({ ...payload, path });
      };
    },

    apply(payload: any) {
      return http[method](payload);
    },
  });
};

export const get = createProxiedMethod<EntityGETRequest>("GET");

export const post = createProxiedMethod<EntitydPOSTRequest>("POST");

export const put = createProxiedMethod<EntitydPOSTRequest>("PUT");

export const drop = createProxiedMethod<EntitydPOSTRequest>("DELETE");

// addEventListener('fetch', (event) => {
//     console.log(event); // use it to ex: set a token or...
// });

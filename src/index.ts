import {
  QueryCache,
  QueryClient,
  QueryFunctionContext,
  UseQueryOptions,
  hashKey,
} from "@tanstack/react-query";
import {
  ConvexReactClient,
  ConvexReactClientOptions,
  Watch,
} from "convex/react";
import { FunctionReference, getFunctionName } from "convex/server";
import { convexToJson } from "convex/values";

const functionName = Symbol.for("functionName");
function isConvexQuery(
  queryKey: readonly any[]
): queryKey is [FunctionReference<"query">, Record<string, any>, {}] {
  return !!(queryKey[0] && queryKey[0][functionName]);
}

// This can't be set for each query individually,
// see https://github.com/TanStack/query/issues/4052#issuecomment-1296174282
/**
 * Set this globally to use Convex query functions.
 *
 * ```ts
 * const queryClient = new QueryClient({
 *   defaultOptions: {
 *    queries: {
 *       queryKeyHashFn: convexQueryKeyHashFn
 *     },
 *   },
 * });
 */
export const convexQueryKeyHashFn = <QueryKey extends readonly any[]>(
  queryKey: QueryKey
): string => {
  if (isConvexQuery(queryKey)) {
    return `convex-query|${getFunctionName(queryKey[0])}-${JSON.stringify(convexToJson(queryKey[1]))}`;
  }
  return hashKey(queryKey);
};

/**
 * Use this to specify your own fallback queryKeyHashFn:
 *
 * ```ts
 * const queryClient = new QueryClient({
 *   defaultOptions: {
 *    queries: {
 *       queryKeyHashFn: convexQueryKeyHashFnMiddleware(yourQueryKeyHashFn),
 *     },
 *   },
 * });
 * ```
 */
export const convexQueryKeyHashFnMiddleware =
  (next: (queryKey: ReadonlyArray<unknown>) => string) =>
  (queryKey: ReadonlyArray<unknown>) => {
    if (isConvexQuery(queryKey)) {
      return `convex-query-${getFunctionName(queryKey[0])}-${JSON.stringify(convexToJson(queryKey[1]))}`;
    }
    return next(queryKey);
  };

export interface ConvexQueryClientOptions extends ConvexReactClientOptions {
  /** queryClient can also be set later by calling .connect(queryClient) */
  queryClient?: QueryClient;
}

/**
 * Client that subscribes to events from a TanStack Query QueryClient and populates
 * query results in it for Convex Queries.
 */
export class ConvexQueryClient {
  convexClient: ConvexReactClient;
  subscriptions: Record<
    string,
    {
      watch: Watch<any>;
      unsubscribe: () => void;
      queryKey: [FunctionReference<"query">, Record<string, any>, options?: {}];
    }
  >;
  unsubscribe: (() => void) | undefined;
  queryClient: QueryClient | undefined;
  constructor(
    /** A ConvexReactClient instance or a URL to use to instantiate one. */
    client: ConvexReactClient | string,
    options: ConvexQueryClientOptions = {}
  ) {
    if (typeof client === "string") {
      this.convexClient = new ConvexReactClient(client, options);
    } else {
      this.convexClient = client as ConvexReactClient;
    }
    this.subscriptions = {};
    if (options.queryClient) {
      this.queryClient = options.queryClient;
      this.unsubscribe = this.subscribeInner(
        options.queryClient.getQueryCache()
      );
    }
  }
  connect(queryClient: QueryClient) {
    if (this.unsubscribe) {
      throw new Error("already subscribed!");
    }
    this.queryClient = queryClient;
    this.unsubscribe = this.subscribeInner(queryClient.getQueryCache());
  }

  // TODO this is updating every query when that's unnecessary since it's
  // being called once per watch.
  onUpdate = () => {
    console.log("got update!");
    // Fortunately this does not reset the gc time.
    for (const [_key, { queryKey, watch }] of Object.entries(
      this.subscriptions
    )) {
      this.queryClient!.setQueryData(queryKey, (prev) => {
        if (prev === undefined) {
          // If `prev` is undefined there is no react-query entry for this query key.
          // Return `undefined` to signal not to create one.
          return undefined;
        }
        return watch.localQueryResult();
      });
    }
  };

  subscribeInner(queryCache: QueryCache): () => void {
    return queryCache.subscribe((event) => {
      if (!isConvexQuery(event.query.queryKey)) {
        return;
      }

      switch (event.type) {
        // A query has been GC'd so no stale value will be available.
        // In Convex this means we should unsubscribe.
        case "removed": {
          console.log("Unsubscribing from", event.query.queryHash);
          this.subscriptions[event.query.queryHash].unsubscribe();
          delete this.subscriptions[event.query.queryHash];
          break;
        }
        // A query has been requested for the first time.
        // Subscribe to the query so we hold on to it.
        case "added": {
          console.log("Subscribing to", event.query.queryHash);

          const watch = this.convexClient.watchQuery(
            // TODO pass journals through
            ...(event.query.queryKey as [FunctionReference<"query">, any, {}])
          );
          // TODO this runs once for each unique subscription but doesn't need to.
          // It should be running once, ever.
          const unsubscribe = watch.onUpdate(this.onUpdate);

          this.subscriptions[event.query.queryHash] = {
            queryKey: event.query.queryKey,
            watch,
            unsubscribe,
          };
          break;
        }
        // Runs when a useQuery mounts
        case "observerAdded": {
          break;
        }
        // Runs when a useQuery unmounts
        case "observerRemoved": {
          if (event.query.getObserversCount() === 0) {
            console.log(
              "Last useQuery subscribed to this query has unmounted:",
              event.query.queryKey,
              "so query will be unsubscribed in",
              event.query.gcTime / 1000,
              "seconds"
            );
          }
          break;
        }
        // Fires once per useQuery hook
        case "observerResultsUpdated": {
          break;
        }
        case "updated": {
          console.log("updated by action", event.action.type);
          break;
        }
        case "observerOptionsUpdated": {
          console.log("observerOptionsUpdated, likely bc unmemoized query key");
          break;
        }
      }
    });
  }

  /**
   * Returns a promise for the query result of a query key containing `[FunctionReference, args]`.
   *
   * This data is often already cached.
   */
  queryFn = async <T extends FunctionReference<"query", "public">>(
    context: QueryFunctionContext<readonly [T["_returnType"], T["_args"]]>
  ): Promise<T["_returnType"]> => {
    const [func, args] = context.queryKey;
    console.log("running fetch function queryFn(", func, args, ")");
    const data = await this.convexClient.query(func, args);
    return data;
  };

  /**
   * Query options factory for Convex query subscriptions.
   *
   * ```
   * useQuery(convexQueryOptions(api.foo.bar, args))
   * ```
   *
   * If you need to specify other options spread it:
   * ```
   * useQuery({
   *   ...convexQueryOptions(api.foo.bar, args),
   *   placeholderData: { name: "me" }
   * });
   * ```
   * @deprecated this one doesnt work
   */
  queryOptionsOld<Query extends FunctionReference<"query", "public">>(
    query: Query,
    args: Query["_args"]
  ) {
    const queryKey: readonly [Query, Query["_args"]] = [query, args];
    return {
      queryFn: this.queryFn,
      queryKey,
      staleTime: Infinity,
    };
  }

  /**
   * Query options factory for Convex query subscriptions.
   *
   * ```
   * useQuery(convexQueryOptions(api.foo.bar, args))
   * ```
   *
   * If you need to specify other options spread it:
   * ```
   * useQuery({
   *   ...convexQueryOptions(api.foo.bar, args),
   *   placeholderData: { name: "me" }
   * });
   * ```
   */
  queryOptions<Query extends FunctionReference<"query">>(
    funcRef: Query,
    queryArgs: Query["_args"]
  ): Pick<
    UseQueryOptions<
      Query["_returnType"],
      Error,
      Query["_returnType"],
      [Query, Query["_args"]]
    >,
    "queryKey" | "queryFn" | "staleTime"
  > {
    return {
      queryKey: [funcRef, queryArgs],
      queryFn: this.queryFn,
      staleTime: Infinity,
    };
  }
}

import {
  QueryCache,
  QueryClient,
  QueryFunctionContext,
  hashKey,
} from "@tanstack/react-query";
import { ConvexReactClient, Watch } from "convex/react";
import { FunctionReference, getFunctionName } from "convex/server";
import { convexToJson } from "convex/values";

const functionName = Symbol.for("functionName");
function isConvexQuery(
  queryKey: readonly any[]
): queryKey is [FunctionReference<"query">, Record<string, any>, {}] {
  return !!(queryKey[0] && queryKey[0][functionName]);
}

export const convexQueryKeyHashFn = <QueryKey extends readonly any[]>(
  queryKey: QueryKey
): string => {
  if (isConvexQuery(queryKey)) {
    return `convex-query-${getFunctionName(queryKey[0])}-${JSON.stringify(convexToJson(queryKey[1]))}`;
  }
  return hashKey(queryKey);
};

// TODO make it clear clear that Convex data is never stale, probably possible
// by returning data from cache synchronously.
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
  constructor(client: ConvexReactClient, queryClient?: QueryClient) {
    this.convexClient = client;
    this.subscriptions = {};
    if (queryClient) {
      this.queryClient = queryClient;
      this.unsubscribe = this.subscribeInner(queryClient.getQueryCache());
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
   * When used with a query key containing `[FunctionReference, args]`
   *
   *
   * This data is often already cached!
   */
  queryFn = async <T extends FunctionReference<"query", "public">>(
    context: QueryFunctionContext<readonly [T["_returnType"], T["_args"]]>
  ): Promise<T["_returnType"]> => {
    const [func, args] = context.queryKey;
    console.log("running fetch function queryFn(", func, args, ")");
    const data = await this.convexClient.query(func, args);
    return data;
  };

  // TODO queryFnWithDefault
  // the types are a bit involved, it's Convex types if it's a convex function
  // otherwise whatever the next thing is.
}

/* eslint-disable jsx-a11y/anchor-is-valid */
import { useState } from "react";
import ReactDOM from "react-dom/client";
import {
  QueryCache,
  QueryClient,
  QueryClientProvider,
  QueryFunctionContext,
  useQuery,
} from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { ConvexReactClient } from "convex/react";
import { api } from "../convex/_generated/api";
import { convexToJson } from "convex/values";
import {
  ArgsAndOptions,
  FunctionReference,
  getFunctionName,
} from "convex/server";

const convexClient = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL);
const queryClient = new QueryClient();

export default function App() {
  const [shown, setShown] = useState(true);

  return (
    <QueryClientProvider client={queryClient}>
      <button onClick={() => setShown(!shown)}>
        {shown ? "hide" : "show"}
      </button>
      {shown && <Example />}
      <ReactQueryDevtools initialIsOpen />
    </QueryClientProvider>
  );
}
const functionName = Symbol.for("functionName");
function isConvexQuery(
  queryKey: any[]
): queryKey is [FunctionReference<any>, ...ArgsAndOptions<any, any>] {
  return !!(queryKey[0] && queryKey[0][functionName]);
}

// TODO make it clear clear that Convex data is never stale, probably possible
// by returning data from cache synchronously.
class ConvexQueryClient {
  convexClient: ConvexReactClient;
  subscriptions: Record<string, () => void>;
  unsubscribe: (() => void) | undefined;
  constructor(client: ConvexReactClient, queryClient?: QueryClient) {
    this.convexClient = client;
    this.subscriptions = {};
    if (queryClient) {
      this.unsubscribe = this.subscribeInner(queryClient.getQueryCache());
    }
  }
  connect(queryClient: QueryClient) {
    if (this.unsubscribe) {
      throw new Error("already subscribed!");
    }
    this.unsubscribe = this.subscribeInner(queryClient.getQueryCache());
  }

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
          this.subscriptions[event.query.queryHash]();
          delete this.subscriptions[event.query.queryHash];
          break;
        }
        // A query has been requested for the first time.
        // Subscribe to the query so we hold on to it.
        case "added": {
          console.log("Subscribing to", event.query.queryHash);
          this.subscriptions[event.query.queryHash] = convexClient
            .watchQuery(
              // TODO pass journals through
              ...(event.query.queryKey as [FunctionReference<"query">, any, {}])
            )
            .onUpdate(() => {});
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
        case "observerResultsUpdated": {
          console.log("observer results updated to", event.query.state.data);
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
    context: QueryFunctionContext<[T["_returnType"], T["_args"]]>
  ): Promise<T["_returnType"]> => {
    const [func, args] = context.queryKey;
    console.log("running fetch function queryFn(", func, args, ")");
    const data = await this.convexClient.query(func, args);
    return data;
  };

  // TODO queryFnWithDefault
  // the types are a bit involved, it's Convex types if it's a convex function
  // otherwise whatever the next thing is.

  queryKeyHashFn(
    queryKey: [FunctionReference<"query">, Record<string, any>]
  ): string {
    return `convex-query-${getFunctionName(queryKey[0])}-${JSON.stringify(convexToJson(queryKey[1]))}`;
  }
}

const convexQueryClient = new ConvexQueryClient(convexClient);
convexQueryClient.connect(queryClient);

function Example() {
  const [, setRerender] = useState(false); // We don't need the state value, just the updater function
  const forceRerender = () => {
    setRerender((prev) => !prev); // Toggle the state to force a rerender
  };
  const { isPending, error, data, isFetching } = useQuery({
    queryKey: [api.repos.get, { repo: "made/up" }],
    queryFn: convexQueryClient.queryFn,
    queryKeyHashFn: convexQueryClient.queryKeyHashFn,
    gcTime: 10000,
  });

  if (isPending) return "Loading...";

  if (error) return "An error has occurred: " + error.message;

  return (
    <div>
      <button onClick={forceRerender}>rerender</button>
      <h1>{data.name}</h1>
      <p>{data.description}</p>
      <strong>👀 {data.subscribers_count}</strong>{" "}
      <strong>✨ {data.stargazers_count}</strong>{" "}
      <strong>🍴 {data.forks_count}</strong>
      <div>{isFetching ? "Updating..." : ""}</div>
    </div>
  );
}

const rootElement = document.getElementById("root")!;
ReactDOM.createRoot(rootElement).render(<App />);

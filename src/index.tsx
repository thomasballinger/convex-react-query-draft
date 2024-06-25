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
import { ConvexReactClient, Watch } from "convex/react";
import { api } from "../convex/_generated/api";
import { convexToJson } from "convex/values";
import { FunctionReference, getFunctionName } from "convex/server";
import { ConvexQueryClient, convexQueryKeyHashFn } from "./lib";

// TODO we don't need both of these
const convexClient = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL);
const convexQueryClient = new ConvexQueryClient(convexClient);
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // This must be specified globally
      queryKeyHashFn: convexQueryKeyHashFn,
    },
  },
});
// TODO I bet we could connect this lazily
convexQueryClient.connect(queryClient);

export default function App() {
  const [topShown, setTopShown] = useState(true);
  const [middleTopShown, setMiddleTopShown] = useState(true);
  const [middleBottomShown, setMiddleBottomShown] = useState(true);
  const [bottomShown, setBottomShown] = useState(true);

  return (
    <QueryClientProvider client={queryClient}>
      <button onClick={() => setTopShown(!topShown)}>
        {topShown ? "hide" : "show"}
      </button>
      {topShown && <Example />}
      <button onClick={() => setMiddleTopShown(!middleTopShown)}>
        {middleTopShown ? "hide" : "show"}
      </button>
      {middleTopShown && <Example />}
      <button onClick={() => setMiddleBottomShown(!middleBottomShown)}>
        {middleBottomShown ? "hide" : "show"}
      </button>
      {middleBottomShown && <Example />}
      <button onClick={() => setBottomShown(!bottomShown)}>
        {bottomShown ? "hide" : "show"}
      </button>
      {bottomShown && <Example />}
      <ReactQueryDevtools initialIsOpen />
    </QueryClientProvider>
  );
}

function Example() {
  const [, setRerender] = useState(false); // We don't need the state value, just the updater function
  const forceRerender = () => {
    setRerender((prev) => !prev); // Toggle the state to force a rerender
  };
  const { isPending, error, data, isFetching } = useQuery({
    queryKey: [api.repos.get, { repo: "made/up" }],
    queryFn: convexQueryClient.queryFn,
    gcTime: 10000,
    staleTime: Infinity,
  });

  if (isPending) return "Loading...";

  if (error) return "An error has occurred: " + error.message;

  return (
    <div>
      <button onClick={forceRerender}>rerender</button>
      <h4>{data.name}</h4>
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

/* eslint-disable jsx-a11y/anchor-is-valid */
import { useState } from "react";
import ReactDOM from "react-dom/client";
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
} from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { ConvexReactClient } from "convex/react";
import { api } from "../convex/_generated/api";
import { ConvexQueryClient, convexQueryKeyHashFn } from "./lib";

const convexClient = new ConvexReactClient(
  (import.meta as any).env.VITE_CONVEX_URL
);
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
  // TODO what should mutations look like?
  // There's no need to invalidate, so do we really need anything special?

  return (
    <QueryClientProvider client={queryClient}>
      <Body />
      <ReactQueryDevtools initialIsOpen />
    </QueryClientProvider>
  );
}

function Body() {
  const { mutate, isPending } = useMutation({
    mutationFn: () =>
      convexClient.mutation(api.repos.star, { repo: "made/up" }),
  });

  const [topShown, setTopShown] = useState(true);
  const [middleTopShown, setMiddleTopShown] = useState(true);
  const [middleBottomShown, setMiddleBottomShown] = useState(true);
  const [bottomShown, setBottomShown] = useState(true);

  return (
    <div>
      <button onClick={() => mutate()}>Ask a friend to a star</button>
      {isPending ? "***" : ""}
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
    </div>
  );
}

function Example() {
  const [, setRerender] = useState(false);
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

  // TODO Errors should just work, but test it
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

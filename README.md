# Convex <3s TanStack Query

Want to use Convex in an app that uses React Query?

## Global setup

1. Set queryFn and queryKeyHashFn globally.

```ts
const convexQueryClient = new ConvexQueryClient(convexClient);
const queryClient = new QueryClient({
  defaultOptions: {
    queryFn: convexQueryClient.queryFn,
    queryKeyHashFn: convexQueryClient.queryKeyHashFn,
    gcTime: 10000,
  },
});
convexQueryClient.connect(queryClient);
```

2. Use just the query key to query.

```ts
const { isPending, error, data, isFetching } = useQuery({
  queryKey: [api.repos.get, { repo: "made/up" }],
});
```

TODO: If you need other fetch functions, override them at call sites or
pass in next queryFn and queryKeyHashFn.

## Query Key Factory

1. Want something more compact without the global setup? Try a query key factory instead.

```ts
const convexClient = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL);
const convexQueryClient = new ConvexQueryClient(convexClient);
const queryClient = new QueryClient();
convexQueryClient.connect(queryClient);
```

2. Use the query key factory

```ts
const { isPending, error, data, isFetching } = useQuery(
  convexQueryClient.queryOptions(api.repos.get, { repo: "made/up" }),
});
```

# Example

To run this example:

- `npm install`
- `npm run dev`

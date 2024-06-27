# Convex <3s TanStack Query

Want to use Convex in an app that uses React Query?

Convex Query functions are server-side functions that update reactively: instead of polling,
subscribe to a server-side function and always be up to date.

All relevant subscriptions will
be updated at the same time so there's no need to call `queryClient.invalidateQueries()`.

## Setup

1. Create a ConvexClient and ConvexQueryClient

```ts
const convexQueryClient = new ConvexQueryClient(convexClient);
const queryClient = new QueryClient({
  defaultOptions: {
    queryKeyHashFn: convexQueryKeyHashFn,
  },
});
convexQueryClient.connect(queryClient);
```

2. Use `useQuery()` with the `api` object imported from `../convex/_generated/server` and args are the query key.
   Specify the

```ts
const { isPending, error, data } = useQuery({
  queryKey: [api.repos.get, { repo: "made/up" }],
  queryFn: convexQueryClient.queryFn,
  gcTime: 10000, // unsubscribe after 10s of no use
  staleTime: Infinity,
});
```

Or use the

# Difference from using TanStack Query with `fetch`

New query results are pushed from the server, so a `staleTime` of `Infinity` should be used.
See [tkdodo's post](https://tkdodo.eu/blog/using-web-sockets-with-react-query#increasing-staletime)
for the motivation for this.

Your app will remain subscribed to a query until the `gcTime` has elapsed. Tune this for your app: it's a good idea to
use a value of at last a couple second

isFetching will always be `false` because there's no lag between

# Example

To run this example:

- `npm install`
- `npm run dev`

# TODO

- disable some default retry behavior so errors get reported more quickly; and adding more useQuery hooks for the same query should not retry the query.
- reset behavior after an error
- roll this up into a library
- auth
- paginated queries
- skip token?

# Contributing

After cloning this repo run `npm i` to install dependencies.
This package uses [tshy](https://github.com/isaacs/tshy) to publish ESM and CJS builds.

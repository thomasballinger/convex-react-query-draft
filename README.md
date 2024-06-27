# Convex <3s TanStack Query

Want to use Convex in an app that uses React Query?

Convex is a database with server-side (db-side?) functions that update reactively: instead of polling,
subscribe to a server-side function and always be up to date.

All relevant subscriptions will be updated at the same time so there's no need to call `queryClient.invalidateQueries()`.

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

2. Use `useQuery()` with the `api` object imported from `../convex/_generated/server` and the arguments for this query function.
   These two form the query key.

```ts
const { isPending, error, data } = useQuery({
  queryKey: [api.repos.get, { repo: "made/up" }],
  queryFn: convexQueryClient.queryFn,
  gcTime: 10000, // unsubscribe after 10s of no use
  staleTime: Infinity,
});
```

Set the `staleTime` to `Infinity` beacuse this data is never stale; it's proactively updated whenever the query result updates on the server. (see [tkdodo's post](https://tkdodo.eu/blog/using-web-sockets-with-react-query#increasing-staletime)
for more about this)
If you like, customize the `gcTime` to the length of time a query subscription should remain active after all `useQuery()` hooks using it have unmounted.

# Differences from using TanStack Query with `fetch`

New query results are pushed from the server, so a `staleTime` of `Infinity` should be used.

Your app will remain subscribed to a query until the `gcTime` has elapsed. Tune this for your app: it's a good idea to
use a value of at last a couple second

isFetching will always be `false` because there's no lag between

# Example

To run this example:

- `npm install`
- `npm run dev`

# Authentication

TanStack Query isn't opionated about auth; an auth code might be a an element of a query key like any other.
With Convex it's not necessary to add an additional key for an auth code; auth is an implicit argument to all
Convex queries and these queries will be retried when authentication info changes.

Convex auth is typically done via JWT: some query functions will fail if requested before calling `convexReactClinet.setAuth()` with a function that
provides the token.

Auth setup looks just like it's recommended in [Convex docs](https://docs.convex.dev/auth), which make use of components that use native convex hooks.
For Clerk, this might look like this: a `ClerkProvider` for auth, a `ConvexProviderWithClerk` for the convex client, and a `QueryClient`.

```
<ClerkProvider publishableKey="pk_test_...">
  <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </ConvexProviderWithClerk>
</ClerkProvider>
```

See the [Convex Auth docs](https://docs.convex.dev/auth) for setup instructions.

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

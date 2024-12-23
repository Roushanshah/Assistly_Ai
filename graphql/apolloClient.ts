import {
    ApolloClient,
    createHttpLink,
    DefaultOptions,
    InMemoryCache
} from '@apollo/client';

export const BASE_URL = process.env.NODE_ENV !== "development" ? `${process.env.NEXT_PUBLIC_DEV_URL}` : "http://localhost:3000";

const httpsLink = createHttpLink({
    uri: `${BASE_URL}/api/graphql`
});

const defaultOptions: DefaultOptions = {
    watchQuery: {
        fetchPolicy: "no-cache",
        errorPolicy: "all",
    },
    query: {
        fetchPolicy: "no-cache",
        errorPolicy: "all",
    },
    mutate: {
        fetchPolicy: "no-cache",
        errorPolicy: "all",
    },
};

const client = new ApolloClient({
    link: httpsLink,
    cache: new InMemoryCache(),
    defaultOptions: defaultOptions,
});

export default client
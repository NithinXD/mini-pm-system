
import { ApolloClient, InMemoryCache, HttpLink, from } from '@apollo/client';
import { setContext } from '@apollo/client/link/context';
import { onError } from '@apollo/client/link/error';

const httpLink = new HttpLink({ uri: 'http://localhost:8000/graphql/' });


const authLink = setContext((_, { headers }) => {
  const token = localStorage.getItem('token');
  return {
    headers: {
      ...headers,
      authorization: token ? `JWT ${token}` : '',
    },
  };
});

const errorLink = onError(({ graphQLErrors, networkError }: any) => {
  if (graphQLErrors) {
    for (let err of graphQLErrors) {
      if (err.message.includes('Signature has expired') || err.message.includes('Token is expired')) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/login';
        return;
      }
    }
  }
  if (networkError && 'statusCode' in networkError && networkError.statusCode === 401) {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
  }
});

const link = from([errorLink, authLink, httpLink]);

const client = new ApolloClient({
  link,
  cache: new InMemoryCache({
    typePolicies: {
      TaskType: {
        fields: {
          assignees: {
            merge(existing, incoming) {
              return incoming;
            }
          },
          comments: {
            merge(existing, incoming) {
              return incoming;
            }
          }
        }
      }
    }
  }),
});

export default client;

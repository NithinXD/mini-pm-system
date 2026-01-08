import React, { createContext, useState, useContext, useEffect } from 'react';
import { useMutation, useLazyQuery } from '@apollo/client/react';
import { LOGIN, REGISTER, GET_ME } from '../graphql/queries';

interface User {
  id: string;
  email: string;
  username: string;
  role?: {
    id: string;
    name: string;
    permissions: { [key: string]: boolean };
  };
  customPermissions?: { [key: string]: boolean };
  organization?: {
    id: string;
    name: string;
    slug: string;
    isOwner: boolean;
  };
}

interface GetMeData {
  me: User;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, username: string, password: string, organizationSlug: string) => Promise<void>;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    const savedUser = localStorage.getItem('user');
    return savedUser ? JSON.parse(savedUser) : null;
  });
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [loading, setLoading] = useState(false);

  const [loginMutation] = useMutation(LOGIN);
  const [registerMutation] = useMutation(REGISTER);
  const [getMeQuery] = useLazyQuery(GET_ME);

  useEffect(() => {
    if (token) {
      localStorage.setItem('token', token);
    } else {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    }
  }, [token]);

  useEffect(() => {
    if (user) {
      localStorage.setItem('user', JSON.stringify(user));
    }
  }, [user]);

  const login = async (email: string, password: string) => {
    setLoading(true);
    try {
      const { data } = await loginMutation({ variables: { email, password } }) as any;
      const newToken = data.tokenAuth.token;
      setToken(newToken);
      // Persist token immediately so Apollo auth link can read it
      localStorage.setItem('token', newToken);

      // Fetch user data after setting token (pass auth header to be explicit)
      try {
        const { data: userData } = await getMeQuery({ context: { headers: { Authorization: `Bearer ${newToken}` } } }) as { data?: GetMeData };
        if (userData?.me) {
          setUser(userData.me);
        }
      } catch (userError) {
        console.warn('Failed to fetch user data after login:', userError);
      }
      
      setLoading(false);
    } catch (error) {
      setLoading(false);
      throw error;
    }
  };

  const register = async (email: string, username: string, password: string, organizationSlug: string) => {
    setLoading(true);
    try {
      const { data } = await registerMutation({
        variables: { email, username, password, organizationSlug }
      }) as any;
      const newToken = data.register.token;
      setToken(newToken);
      // Persist token immediately
      localStorage.setItem('token', newToken);

      // Fetch full user object (including organization) after registration
      try {
        const { data: userData } = await getMeQuery({ context: { headers: { Authorization: `Bearer ${newToken}` } } }) as { data?: GetMeData };
        if (userData?.me) {
          setUser(userData.me);
        } else {
          setUser(data.register.user);
        }
      } catch (userError) {
        // Fallback to mutation user if GET_ME fails
        setUser(data.register.user);
      }
      setLoading(false);
    } catch (error) {
      setLoading(false);
      throw error;
    }
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  };

  // Check token on mount and periodically
  useEffect(() => {
    const fetchUserData = async () => {
      if (token && !user) {
        try {
          const { data } = await getMeQuery() as { data?: GetMeData };
          if (data?.me) {
            setUser(data.me);
          }
        } catch (error) {
          console.warn('Failed to fetch user data:', error);
          // If token is invalid, clear it
          if (error instanceof Error && error.message && error.message.includes('token')) {
            logout();
          }
        }
      }
    };
    fetchUserData();
    const checkTokenExpiration = () => {
      const storedToken = localStorage.getItem('token');
      if (storedToken && !token) {
        try {
          // Basic JWT token validation - check if it's expired
          const payload = JSON.parse(atob(storedToken.split('.')[1]));
          const currentTime = Date.now() / 1000;
          
          if (payload.exp && payload.exp < currentTime) {
            // Token is expired
            logout();
          } else {
            // Token is still valid, set it
            setToken(storedToken);
          }
        } catch (error) {
          // Invalid token format
          logout();
        }
      }
    };

    checkTokenExpiration();
    
    // Check token expiration every 5 minutes
    const interval = setInterval(checkTokenExpiration, 5 * 60 * 1000);
    
    return () => clearInterval(interval);
  }, [token, getMeQuery, user]);

  return (
    <AuthContext.Provider value={{ user, token, login, register, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

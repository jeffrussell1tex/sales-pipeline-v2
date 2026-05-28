import { createContext, useContext } from 'react';

const AppContext = createContext(null);

export const AppProvider = ({ value, children }) => (
    <AppContext.Provider value={value}>
        {children}
    </AppContext.Provider>
);

export const useApp = () => useContext(AppContext);

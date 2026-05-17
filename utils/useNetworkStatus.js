import { useState, useEffect } from 'react';
import * as Network from 'expo-network';

export function useNetworkStatus() {
    const [networkState, setNetworkState] = useState({
        isConnected: true,
        type: null,
        isCellular: false,
        isWifi: false,
    });

    useEffect(() => {
        checkNetwork();
        const interval = setInterval(checkNetwork, 5000);
        return () => clearInterval(interval);
    }, []);

    const checkNetwork = async () => {
        try {
            const state = await Network.getNetworkStateAsync();
            setNetworkState({
                isConnected: state.isConnected && state.isInternetReachable !== false,
                type: state.type,
                isCellular: state.type === Network.NetworkStateType.CELLULAR,
                isWifi: state.type === Network.NetworkStateType.WIFI,
            });
        } catch (e) {
            console.log('Network check error:', e);
        }
    };

    return networkState;
}
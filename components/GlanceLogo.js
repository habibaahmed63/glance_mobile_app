import Svg, { Path, Circle, Defs, LinearGradient, Stop, RadialGradient } from 'react-native-svg';

export default function GlanceLogo({ size = 100 }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 200 200">
            <Defs>
                <RadialGradient id="bgGrad" cx="50%" cy="50%" r="50%">
                    <Stop offset="0%" stopColor="#1a0a2e" />
                    <Stop offset="100%" stopColor="#0a0a0f" />
                </RadialGradient>
                <LinearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <Stop offset="0%" stopColor="#c084fc" />
                    <Stop offset="50%" stopColor="#7c3aed" />
                    <Stop offset="100%" stopColor="#4c1d95" />
                </LinearGradient>
                <LinearGradient id="sparkGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <Stop offset="0%" stopColor="#f0abfc" />
                    <Stop offset="100%" stopColor="#c084fc" />
                </LinearGradient>
            </Defs>

            <Circle cx="100" cy="100" r="95" fill="#0d0d1a" />

            <Circle cx="100" cy="100" r="88" fill="none" stroke="#7c3aed" strokeWidth="2" opacity="0.4" />

            <Path
                d="M 100 22 A 78 78 0 1 0 100 178 L 100 155 A 55 55 0 1 1 100 45 Z"
                fill="url(#ringGrad)"
                opacity="0.95"
            />

            <Path
                d="M 100 45 A 55 55 0 1 1 100 155 L 100 178 A 78 78 0 1 0 100 22 Z"
                fill="#0d0d1a"
                opacity="0.85"
            />

            <Path
                d="M 100 74 C 104 89 111 96 126 100 C 111 104 104 111 100 126 C 96 111 89 104 74 100 C 89 96 96 89 100 74 Z"
                fill="url(#sparkGrad)"
            />

            <Path
                d="M 100 88 C 102 94 106 98 112 100 C 106 102 102 106 100 112 C 98 106 94 102 88 100 C 94 98 98 94 100 88 Z"
                fill="#f5d0fe"
                opacity="0.9"
            />

            <Circle cx="48" cy="62" r="3" fill="#c084fc" opacity="0.6" />
            <Circle cx="40" cy="74" r="2" fill="#e879f9" opacity="0.5" />
            <Circle cx="158" cy="138" r="2.5" fill="#a855f7" opacity="0.5" />
        </Svg>
    );
}
import { Redirect } from 'expo-router';

import { AuthLanding } from '../../components/auth/AuthLanding';
import { useAuthStore } from '../../stores/useAuthStore';

// First screen of the rider app: logo, languages, Log in | Register.
export default function WelcomeScreen() {
  const pendingPassenger = useAuthStore((s) => s.pendingPassenger);
  // A sign-up that still needs its SMS code goes straight to verification.
  if (pendingPassenger) return <Redirect href="/(auth)/verification" />;
  return <AuthLanding initialTab="login" />;
}

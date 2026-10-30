import { Redirect } from 'expo-router';

// When signed out, the app's start URL ("/") lands here and goes to the login screen.
// When signed in, the (auth) group is hidden and "/" resolves to the claims tab instead.
export default function AuthIndex() {
  return <Redirect href="/login" />;
}

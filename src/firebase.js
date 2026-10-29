import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const env = import.meta.env;

export const configured = Boolean(env.VITE_FIREBASE_PROJECT_ID && env.VITE_FIREBASE_API_KEY);

const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  appId: env.VITE_FIREBASE_APP_ID,
});

export const db = getFirestore(app);

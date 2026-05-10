// Firebase Web SDK Configuration
// Replace with your Firebase project config from:
// Firebase Console → Project Settings → General → Your Apps → Web App

import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "digivasool.firebaseapp.com",
  projectId: "digivasool",
  storageBucket: "digivasool.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore
export const db = getFirestore(app);

export default app;

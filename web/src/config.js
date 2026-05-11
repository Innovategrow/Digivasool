// Backend API base URL
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

// Firebase web config — see firebase.js for full initialization
// The backend handles all Firestore operations via the API.
// Direct Firestore access from the frontend is available via:
// import { db } from './firebase';

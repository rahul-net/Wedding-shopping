// Firebase v9+ Modular SDK Initialization with Enterprise Offline Capabilities
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getAuth, 
    initializeAuth, 
    indexedDBLocalPersistence 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
    initializeFirestore, 
    persistentLocalCache, 
    persistentMultipleTabManager 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyCMTqbp6o7Ikz0uQQ8nZmvqE3G-0Xj7ugk",
    authDomain: "wedding-shopping-list.firebaseapp.com",
    projectId: "wedding-shopping-list",
    storageBucket: "wedding-shopping-list.firebasestorage.app",
    messagingSenderId: "37646947680",
    appId: "1:37646947680:web:533f3506200b49ec057a05",
    measurementId: "G-CETPXJTX0N"
};

// Initialize Core Application
const app = initializeApp(firebaseConfig);

// Initialize Authentication with Offline Persistence
const auth = initializeAuth(app, {
    persistence: indexedDBLocalPersistence
});

// Initialize Firestore with Advanced Multi-Tab Offline Cache Engine
const db = initializeFirestore(app, {
    localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager()
    })
});

export { app, auth, db };
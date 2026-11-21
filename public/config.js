// Public configuration. Firebase web config is safe to publish; access is enforced by firestore.rules.
// apiBase: where the Node backend runs. Locally it is the same origin; in production it is the Render service.
window.WILLAI = {
  apiBase: ['localhost', '127.0.0.1'].includes(location.hostname) ? '' : 'https://willai-api.onrender.com',
  firebase: {
    apiKey: 'AIzaSyBTQzufKmCxeDo1CPOsRbJ4RkFTgYhrV0E',
    authDomain: 'willai-564c9.firebaseapp.com',
    projectId: 'willai-564c9',
    storageBucket: 'willai-564c9.firebasestorage.app',
    messagingSenderId: '668017481903',
    appId: '1:668017481903:web:3543b98b0543ba12e35c5a',
  },
};

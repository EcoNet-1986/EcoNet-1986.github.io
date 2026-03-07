// Ce code permet à l'application de fonctionner techniquement
self.addEventListener('install', (event) => {
  console.log('EcoNet : Service Worker installé !');
});

self.addEventListener('fetch', (event) => {
  // On laisse les requêtes passer normalement vers Firebase et Netlify
  return;
});

// Nome e versão do nosso cache. Mude a versão (v2, v3...) sempre que atualizar os arquivos abaixo.
const CACHE_NAME = 'passa-plantao-cache-v1';

// Lista de todos os arquivos que a aplicação precisa para funcionar offline.
const URLS_TO_CACHE = [
  '/', // A raiz do site (a página principal)
  'PassaPlantao.html', // O nome do seu arquivo HTML principal
  
  // Arquivos de Estilo e Componentes (copiados do <head> do seu HTML)
  'https://cdn.tailwindcss.com',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
  'https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.css',
  'https://npmcdn.com/flatpickr/dist/themes/light.css',
  
  // Arquivos de Script (copiados do <head> e <body>)
  'https://cdn.jsdelivr.net/npm/flatpickr',
  'https://npmcdn.com/flatpickr/dist/l10n/pt.js',
  'https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js',
  'https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js',
  'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js'
];

// Evento 'install': é disparado quando o Service Worker é instalado pela primeira vez.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cache aberto. Adicionando URLs ao cache...');
        return cache.addAll(URLS_TO_CACHE);
      })
  );
});

// Evento 'fetch': é disparado para cada requisição que a página faz (CSS, JS, imagens, etc.).
self.addEventListener('fetch', event => {
  event.respondWith(
    // 1. Tenta encontrar a requisição no cache.
    caches.match(event.request)
      .then(response => {
        // Se encontrou no cache, retorna a resposta do cache.
        if (response) {
          return response;
        }
        // Se não encontrou, faz a requisição à rede.
        return fetch(event.request);
      })
  );
});
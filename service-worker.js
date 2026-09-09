const CACHE_NAME = 'shadowstrider-v3';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json',
  './icon.png'
];

// 1. ติดตั้ง Service Worker และ Cache ไฟล์พื้นฐาน
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  // สั่งให้ข้ามการรอ (Waiting) และเริ่มทำงานทันที
  self.skipWaiting();
});

// 2. ล้างแคชเวอร์ชันเก่าทิ้งทั้งหมดทันทีเมื่อตัวใหม่ทำงาน
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[ServiceWorker] ลบแคชเวอร์ชันเก่า:', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  // ยึดการควบคุม client ทุกแท็บทันที
  self.clients.claim();
});

// 3. ปรับเป็นกลยุทธ์ Network-First (โหลดโค้ดใหม่จากเซิร์ฟเวอร์ก่อนเสมอ)
self.addEventListener('fetch', (event) => {
  // ข้าม request ที่ไม่ใช่เมธอด GET หรือมาจาก chrome-extension
  if (event.request.method !== 'GET' || !event.request.url.startsWith('http')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // หากต่อเน็ตได้และดึงไฟล์สำเร็จ ให้อัปเดตไฟล์ใหม่ลงแคชอัตโนมัติ
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // หากไม่มีอินเทอร์เน็ต (Offline) ให้ดึงไฟล์สำรองจากแคชมาใช้เล่นต่อได้
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // กรณีหาไฟล์ไม่เจอระหว่างออฟไลน์ ให้ fallback กลับหน้าหลัก
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
        });
      })
  );
});

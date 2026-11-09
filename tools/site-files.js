// Единый список файлов сайта: его используют tools/serve.js (что отдавать) и tools/build.js (что публиковать).
// Dockerfile, .dockerignore и sw.js перечисляют файлы сами, их согласованность с этим списком проверяет tests/deploy.js.
module.exports = {
  pages: ['index.html', '404.html', 'manifest.webmanifest', 'sw.js', 'robots.txt'],
  dirs: ['assets'],
  // Только для хостингов, которые читают файл заголовков (Netlify, Cloudflare Pages); локальный сервер его не отдаёт.
  hosting: ['_headers']
};

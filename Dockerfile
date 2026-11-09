# Для воспроизводимой сборки закрепите образ по digest: FROM nginxinc/nginx-unprivileged:1.27-alpine@sha256:<digest>
FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html 404.html manifest.webmanifest sw.js robots.txt /usr/share/nginx/html/
COPY assets /usr/share/nginx/html/assets
EXPOSE 8080

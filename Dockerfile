# Образ закреплён по manifest digest; при обновлении тега digest нужно проверить заново.
FROM nginxinc/nginx-unprivileged:1.27-alpine@sha256:64e8c8138e835f3e7aca5a2032c1d4c5bac3963b9f9a939ebd414783704190db
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html 404.html manifest.webmanifest sw.js robots.txt /usr/share/nginx/html/
COPY assets /usr/share/nginx/html/assets
EXPOSE 8080

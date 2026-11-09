# Образ закреплён по manifest digest; при обновлении тега digest нужно проверить заново.
FROM nginxinc/nginx-unprivileged:1.31-alpine@sha256:b5047b9b76845eac124358373c6852377c52e4b05834a47647e955dd91cb8f1e
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html 404.html manifest.webmanifest sw.js robots.txt /usr/share/nginx/html/
COPY assets /usr/share/nginx/html/assets
EXPOSE 8080

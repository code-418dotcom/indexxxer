# Indexxxer – Synology (responsive build)

- Web UI: http://<nas-ip>:12345
- Locked to: `/volume3/x_adult/babes/Tiffany Thompson` → `/data` (ro)
- Responsive UI, ZIP lightbox (arrow keys), video player auto-prefers cached MP4
- Maintenance page with **Clean database** button (keeps only video/image/zip)

## Deploy
mkdir -p /volume3/docker/indexxxer/{db,thumbs,transcoded}
cd /volume3/docker/indexxxer
unzip -o indexxxer_syno_12345_responsive.zip
docker compose build --no-cache
docker compose up -d

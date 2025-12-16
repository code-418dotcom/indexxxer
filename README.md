# indexxxer v0.3.0

## Run (clean)
```bash
docker compose down --remove-orphans
docker compose build --no-cache
docker compose up -d
```

- Web UI: http://localhost:13337
- API docs: http://localhost:13338/docs

## Performer images
Put performer images in an image seed folder using:

`firstname_lastname.jpg`

Example: `jane_doe.jpg`

### Your folder
You said yours is:
`/mnt/c/docker/indexxxer/image_seed`

Edit `docker-compose.yml` and change:

```yaml
- ./image_seed:/images:ro
```

to:

```yaml
- /mnt/c/docker/indexxxer/image_seed:/images:ro
```

### Matching rules
For performer name **"Jane Doe"**, indexxxer tries:
- `jane_doe.jpg` / `.jpeg` / `.png` / `.webp`

It uses **first token + last token**, lowercased, non-alphanumerics become `_`.


## v0.3.0
- Complete UI redesign with modern gradient theme and improved aesthetics.
- Modernized tag cloud with pill-style interactive filters.
- Galleries page redesigned with card-based grid layout instead of sidebar list.
- Added video playback functionality - click videos to watch them inline.
- New `/media/stream` endpoint for video streaming with range request support.
- Enhanced performer detail page with video player modal.
- Video thumbnails now show play button overlay for better UX.
- Improved shadows, spacing, and hover effects throughout the application.


## v0.2.10
- Indexing now streams real-time progress updates to the Tools page.
- Progress log shows file scanning, performer matching, and link creation in real-time.
- Backend performs automatic performer-to-media matching during indexing.
- Matched counters on performer cards now reflect server-side matches from the database.
- Removed client-side matching logic; all matching is now done server-side for accuracy.
- Frontend performer detail page fetches server-matched media via new API endpoint.


## Fix in v0.1.6
Tools page now uses the Next.js `/api/*` proxy, no direct browser-to-API calls.


## Important: force the new version to run
This version uses versioned Docker image names:
- `indexxxer-web:0.1.7`
- `indexxxer-api:0.1.7`

So `docker compose up -d --build` will not accidentally keep using older images.


## Fix in v0.1.8
Restored missing Next.js proxy routes for /api/media/* and /api/performers/*.


## v0.1.9
- Performer cards are clickable (detail page).
- Added media indexing for ./sample_media via Tools → Index now.


## v0.1.10
- Fixed PerformerCard build error (clickable whole card).
- Fixed /health endpoint regression.


## v0.1.11
- Click performer image to open a large modal preview.
- Video thumbnails for indexed items via ffmpeg-generated thumbs.


## v0.1.12
- Fixed performer detail page build error.


## v0.1.13
- Added top search bar (name/aliases).
- Tools link is now a button.
- Added a sidebar with Tags (derived from Ethnicity) and Tools button.


## v0.1.14
- On desktop (>=1024px), performer images automatically open full-size when opening a card.
- Mobile/tablet behavior unchanged (tap to zoom).


## v0.1.15
- Desktop auto-open now shows the *thumbnail* enlarged (not the full image).
- Added /performers/{id}/thumb endpoint with ffmpeg-generated cached jpg.


## v0.1.16
- FIX: On performer detail page, show the thumbnail inline at large size instead of opening a modal automatically.
- Grid view still supports click-to-open full image modal.


## v0.1.17
- Added pagination (default 25 per page) with per-page dropdown: 25/50/100/250/500/1000/All.
- Background preloading of performer thumbnails for all filtered results (not only visible page).


## v0.1.18
- Fixed performer detail page crash (removed stale autoOpen logic)
- Detail page now always uses variant="detail" rendering


## v0.1.19
- Added ZIP image galleries: list entries, generate thumbs, view full-size images.
- New /galleries page to browse all ZIP galleries.
- Sidebar option to show all galleries (ZIP) and jump into a gallery.


## v0.1.20
- Fixed gallery switching on /galleries: URL param changes now update selection.
- Prevented stale ZIP entries from being reused when switching galleries (clears entries immediately + aborts old fetch).
- Added loading state and stable keys to avoid mixed thumbnails.


## v0.2.2
- Added performer_media link table to store deterministic performer ↔ media matches (supports multiple performers per item).
- Indexing rebuilds performer_media links after scan.
- Added API endpoint: GET /performers/{id}/media.
- Performer detail now prefers server-side matches.


## v0.2.3
- Sidebar tag cloud (popularity-sized) for common performer fields.
- Clicking values on performer detail navigates back to home with filter.


## v0.2.6
- Fix performer detail page build error (broken import block).

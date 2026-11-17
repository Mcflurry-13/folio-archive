# Folio browser connector

Load this folder as an unpacked extension in Chrome (chrome://extensions → Developer mode → Load unpacked). Open http://127.0.0.1:5180/ and sign in to Xiaohongshu in that same browser. Refresh Folio after installing.

Paste a full note/share link into Folio. The connector opens an inactive note tab, reads its DOM title, description and image metadata, downloads the images, closes its own tab, and returns a preview to Folio. Click Save to store text and images in IndexedDB. Short sharing links are opened normally, allowing the website to redirect them. Video files are not imported; a cover is included only when available.

Permissions: scripting on Xiaohongshu/RedNote and share-link hosts; image downloads on xhscdn.com and rednotecdn.com; a bridge on localhost that accepts requests only at port 5180. No cookie API, no history API, no external analytics. Source login and verification are handled by the user. No data is transmitted to OpenAI during capture.

Limits: 20 images per note, 3 MiB per image, 24 MB total encoded images. Partial image failures are shown. Deleted, private, login-gated or verification-gated content can fail. Content is returned only to the originating local Folio page; do not run untrusted apps on this port. The in-app chat browser cannot load this extension; existing collections can be moved using Folio JSON export/import.

Verification: extraction selectors inspected on the two user-supplied real notes. Parser, media validation, normalization and existing tests pass. Chrome installation and end-to-end capture verified: user-supplied note “一个安静整理灵感的 app” returned its complete description and four images. Saved to IndexedDB; reloading and reopening the editor retained all four images and text. International RedNote image domains are supported.

# Icons

Copy an SVG into a block or component. Use class `icon` (and `icon--lg` when needed). Paths use `stroke` via CSS on `.icon`.

```html
<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 13l4 4L19 7"/></svg>
```

## Set (Lucide-style, ISC)

| Name | Path `d` |
|------|----------|
| check | `M5 13l4 4L19 7` |
| chevron-right | `M9 6l6 6-6 6` |
| chevron-down | `M6 9l6 6 6-6` |
| arrow-right | `M5 12h14M13 6l6 6-6 6` |
| plus | `M12 5v14M5 12h14` |
| minus | `M5 12h14` |
| menu | `M4 7h16M4 12h16M4 17h16` |
| x | `M6 6l12 12M18 6L6 18` |
| phone | `M6 3h4l2 5-3 2a12 12 0 006 6l2-3 5 2v4a2 2 0 01-2 2A16 16 0 014 5a2 2 0 012-2z` |
| mail | `M4 6h16v12H4zM4 6l8 7 8-7` |
| map-pin | `M12 21s7-5.2 7-11a7 7 0 10-14 0c0 5.8 7 11 7 11zM12 10.5a1.5 1.5 0 110-3 1.5 1.5 0 010 3z` |
| clock | `M12 7v5l3 2M12 21a9 9 0 110-18 9 9 0 010 18z` |
| star | `M12 3l2.6 5.3L20 9.2l-4 3.9.9 5.4L12 15.9 7.1 18.5 8 13.1 4 9.2l5.4-.9L12 3z` |
| shield | `M12 3l8 3v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-3z` |
| wrench | `M14.5 6.5a4 4 0 01-5.2 5.2L4 17l3 3 5.3-5.3a4 4 0 015.2-5.2l-3-3z` |
| home | `M4 11l8-7 8 7v9a1 1 0 01-1 1h-5v-6H10v6H5a1 1 0 01-1-1v-9z` |
| users | `M16 20v-1a4 4 0 00-4-4H7a4 4 0 00-4 4v1M9.5 11a3 3 0 100-6 3 3 0 000 6zM17 11a3 3 0 100-6` |
| camera | `M4 8h3l2-2h6l2 2h3v11H4V8zM12 17a3.5 3.5 0 100-7 3.5 3.5 0 000 7z` |
| heart | `M12 20s-7-4.4-7-10a4 4 0 017-2.5A4 4 0 0119 10c0 5.6-7 10-7 10z` |
| leaf | `M5 19c8 0 12-6 14-14-8 2-14 6-14 14zM5 19c2-4 6-7 11-9` |
| truck | `M3 7h11v10H3zM14 10h4l3 3v4h-7V10zM7 20a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM17 20a1.5 1.5 0 100-3 1.5 1.5 0 000 3z` |
| building | `M4 20V6l8-3 8 3v14H4zM9 20v-5h6v5` |
| briefcase | `M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2M4 7h16v12H4V7z` |
| sparkles | `M12 3l1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2L12 3zM6 14l.8 2.2L9 17l-2.2.8L6 20l-.8-2.2L3 17l2.2-.8L6 14z` |
| quote | `M7 8h5v5H9a3 3 0 00-3 3v1h6v-4H8V8zm8 0h5v5h-3a3 3 0 00-3 3v1h6v-4h-4V8z` |
| play | `M8 5v14l11-7L8 5z` |
| image | `M4 5h16v14H4V5zm0 10l4-4 3 3 4-5 5 6` |
| link | `M10 13a5 5 0 007 0l2-2a5 5 0 00-7-7l-1 1M14 11a5 5 0 00-7 0l-2 2a5 5 0 007 7l1-1` |
| calendar | `M5 4h14v16H5V4zm0 4h14M9 2v4M15 2v4` |
| search | `M11 18a7 7 0 100-14 7 7 0 000 14zM20 20l-3.5-3.5` |

Add `fill="none"` is unnecessary — `.icon { fill: none; stroke: currentColor }` is in primitives.

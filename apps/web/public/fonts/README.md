# Local font assets

These Latin WOFF2 faces are copied from the installed @fontsource DM Sans, Barlow Condensed and Instrument Serif packages. Their respective license texts are included here.

Each asset filename includes the first 12 hex characters of its SHA-256 digest. The /fonts route serves immutable, year-long caching, so a changed font must get a new digest filename. Update the CSS URLs in src/app/fonts.css and the three critical-font preload links in src/app/layout.tsx when replacing a face. Do not overwrite an asset under an old digest filename.

Only faces used for the first paint are preloaded; the other weights load when needed. The CSS keeps system font fallbacks for glyphs outside these subsets.

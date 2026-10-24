# Brand assets

Holds the supplied **borderless DotcomSeekr logo** used by the site header.

The canonical asset is:

- `brand/dotcomseekr-logo-green.png`

It is the approved artwork: white lettering, a green target with concentric
rings, a reduced green halo, and the green "Seek and You Shall.com" tagline at
the bottom. Transparency and the square aspect ratio are preserved, so the
header sizes it by width only.

`BrandLogo` (`apps/web/src/components/BrandLogo.tsx`) references it directly via
`BRAND_LOGO_SRC` in `apps/web/src/brand.ts`. If the image fails to load, the
header falls back to a plain "DotcomSeekr" wordmark rather than showing a broken
image.

The older `brand/dotcomseekr-logo.png` plate artwork is retained but no longer
referenced. See `apps/web/src/components/ReticleFocus.tsx` for the reticle
treatment derived from the logo's targeting reticle.

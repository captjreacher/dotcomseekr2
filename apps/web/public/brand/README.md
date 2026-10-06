# Brand assets

Holds the supplied **compact rectangular DotcomSeekr logo** used by the site
header.

The canonical asset is:

- `brand/dotcomseekr-logo.png`

`BrandLogo` (`apps/web/src/components/BrandLogo.tsx`) references it directly via
`BRAND_LOGO_SRC` in `apps/web/src/brand.ts`. If the image fails to load, the
header falls back to a plain "DotcomSeekr" wordmark rather than showing a broken
image.

The large circular logo is intentionally **not** used as the application header
logo. See `apps/web/src/components/ReticleFocus.tsx` for the reticle treatment
derived from the logo's targeting reticle.

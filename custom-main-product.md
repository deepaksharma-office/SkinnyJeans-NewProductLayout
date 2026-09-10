# Custom product section

The screenshot informed the main product layout only. Existing theme files, templates, header, footer, product section, global assets, and cart code are unchanged.

## Files

- `sections/custom-main-product.liquid`: product context, reorderable blocks, section schema and preset.
- `snippets/custom-product-price.liquid`: selected-variant money formatting, compare-at/unit price, native payment terms.
- `snippets/custom-product-rating.liquid`: real standard review metafields and review anchor.
- `snippets/custom-product-variants.liquid`: option-value radios, swatches and variant NEW metadata.
- `snippets/custom-product-inventory.liquid`: tracked inventory, thresholds and backorder state.
- `snippets/custom-product-buy-buttons.liquid`: native product form and accelerated checkout.
- `snippets/custom-product-accordion.liquid`: shared description/collapsible panel.
- `snippets/custom-product-gallery.liquid`: responsive image grid, mobile pagination and image dialog.
- `assets/custom-main-product.css`: scoped responsive layout and motion.
- `assets/custom-main-product.js`: section lifecycle, variants, cart handoff, dialogs, gallery and accordion behavior.
- `tests/custom-main-product.test.cjs`: local Liquid/browser fixture validation.
- `custom-main-product.md`: this guide.

## Merchant setup

1. Upload the new section, snippets and assets to a development/unpublished copy of this theme. No production template was changed by this implementation.
2. In the Shopify theme editor, create an alternate **product template** based on the current product template. Add **Custom product information**. In that alternate template, remove the original Product information and the old standalone description/fit/care sections to avoid duplicate content. Keep the Judge.me review widget section. Preview before assigning the alternate template to products.
3. Reorder the custom information blocks as desired. Select a page in **Variant selector → Size guide page**. Without a page, the link is hidden.
4. Fit/care panels use `custom.design_and_fit` and `custom.fabric_and_care` product metafields already referenced in the theme. Enter block content or a dynamic source to override them. Empty panels are omitted. Description starts open; initially-open settings apply when description is absent.
5. Native color swatches must be configured on the product option values. Color, Colour and Wash are recognized case-insensitively; Size receives the size-guide link; other option names receive regular buttons. Missing native swatch data displays a readable text choice instead of inventing a color/image.
6. Create/populate the boolean **variant** metafield `custom.new_tag`. The label under each color reads `option_value.variant.metafields.custom.new_tag.value` for the currently relevant option combination, never a product-level flag.
7. Remove the Inventory block to hide stock messaging. Red/orange thresholds determine dot color; the green threshold limits numeric disclosure, above which it reads “In stock.” Thresholds are normalized in ascending order. Untracked inventory has no invented quantity; continuing sales at zero stock reads “Available to order.”
8. Enable **Show accelerated checkout** in Buy buttons, and configure available wallets/installments through Shopify. Device, market and payment eligibility determine what appears.
9. Editorial serif headings are enabled locally because the existing theme uses Poppins for both heading and body text. Disable **Use editorial serif headings** to inherit the theme heading font. No font download is introduced. Gallery gap, spacing, mobile slider, popup and desktop zoom have section settings.

## Review integration

The current `templates/product.json` contains Judge.me **preview_badge** and **review_widget** app blocks. There is no local Judge.me Liquid snippet. The theme also already uses Shopify's standard `reviews.rating` and `reviews.rating_count` metafields.

The custom Rating block follows that existing metafield integration: fractional stars, numeric rating and actual review count link to `#judgeme_product_reviews`. Change the block's anchor if the installed widget uses another ID. With absent/zero review data, nothing renders.

For Judge.me's own badge, remove the custom Rating block and add Judge.me's official **Preview Badge** app block in the same position. This section supports `@app` and renders app blocks natively. Keep Judge.me's app embed and the full review widget configured through its official app UI. No review API, app script injection or synthetic review data was added to production files.

## Variant and cart behavior

Rendering uses `product.selected_or_first_available_variant`, `product.options_with_values`, `option_value.id/selected/available/variant`, and the Section Rendering API with `option_values`. It never enumerates `product.variants` or downloads a complete variant matrix. Section-rendered HTML is authoritative for money, availability, inventory, option states and metafields. Invalid combinations remain selectable for correction and disable purchasing. Sold-out choices are visually crossed and announced, but remain keyboard-selectable so shoppers can explore and recover from unavailable combinations.

Each selection aborts the preceding request. On success, only variant-dependent fragments are replaced; gallery nodes, review/app blocks and accordion state remain intact. Deep links are respected server-side. The variant URL updates without losing unrelated query parameters; impossible combinations retain `option_values`. Failed requests leave purchase controls disabled instead of submitting the old variant.

Native `form | payment_terms` is rendered in its own product form directly below price, following this theme's existing pattern. Native `form | payment_button` is in the purchase form. Updated IDs emit change events and Shopify's payment initializer runs after fragment replacement. Wallet logos, eligibility and checkout flow remain Shopify-controlled.

Add-to-cart uses the locale-aware Ajax Cart route and the existing cart drawer/notification `getSectionsToRender`, `setActiveElement` and `renderContents` contract, plus the theme's cart-update event. If the cart UI cannot render after a successful add, the customer goes to the cart page without repeating the add. Errors appear inline. Native product form submission remains available without JavaScript for the displayed variant.

References used: [high-variant products](https://shopify.dev/docs/storefronts/themes/product-merchandising/variants/support-high-variant-products), [product option values](https://shopify.dev/docs/api/liquid/objects/product_option_value), [native swatches](https://shopify.dev/docs/api/liquid/objects/swatch), [payment terms](https://shopify.dev/docs/api/liquid/filters/payment_terms), [payment buttons](https://shopify.dev/docs/api/liquid/filters/payment_button).

## Gallery and accessibility

- Server-rendered, 2:3 image tiles with responsive CDN widths capped at 1200px in the normal gallery; first image eager/high priority, others lazy. Stable dimensions prevent gallery shifts.
- Desktop two-column grid; mobile native horizontal scroll snap with overlaid pagination. The associated variant image is selected without rebuilding gallery nodes.
- Popup high-resolution URLs (2400px) are inert data attributes. Opening a slide reuses its normal image while loading only that slide's full image. Loading and retry states are included.
- Native dialogs provide focus trapping and Escape behavior. Body scroll position and inline styles are saved/restored, with scrollbar compensation. Overlay/close controls, desktop SVG plus/minus zoom cursors, pointer-position zoom and keyboard arrows are included.
- Mobile viewer uses native horizontal scrolling and has no forced mouse zoom. All motion respects reduced-motion preferences. Exclusive accordions use grid-row animation and inert collapsed content.

## Validation and remaining limits

Shopify Theme Check: **no offenses in the new production files**. The existing theme has unrelated errors/warnings, including missing image dimensions and existing Liquid issues; those were left untouched. JavaScript syntax validation passes.

The local browser test renders the actual custom Liquid templates with fixture adapters for Shopify-only forms/filters and uses Chromium. It checks desktop/mobile geometry, deep links, variant prices and compare-at values, stock, unavailable combinations, stale/failing requests, cart success/error and the existing drawer contract, delayed full-resolution images, popup navigation, desktop zoom, mobile pagination, native dialog focus/scroll cleanup, exclusive accordions, reduced motion, empty data and editor reconnection. Screenshots are saved in a temporary `custom-product-qa-*` directory. Fixture product values, illustrated media and payment placeholders exist only in the test, never in the storefront section.

Run with `liquidjs` and `playwright-core` available on Node's module path and matching Chromium installed:

```sh
node --check assets/custom-main-product.js
node tests/custom-main-product.test.cjs
shopify theme check
```

A real store preview was not available for this implementation. Shopify server option-value behavior with an actual high-variant product, real media, Judge.me app hydration, live cart rendering, wallet eligibility, installment refresh and actual checkout must be verified on the unpublished theme. Browser fixtures do not certify those integrations. Compare desktop and mobile with the supplied screenshot using the real product before publishing.

Scope assumptions/limits:

- Fashion products with one-time purchasing are the target. Subscription-only products deliberately disable purchasing until a selling-plan UI is supplied. Gift-card recipient fields, quantity pickers and B2B volume-pricing tables are outside this custom section. Quantity defaults to 1, or the variant's minimum quantity rule when greater.
- Only image media renders; videos and 3D models are excluded gracefully.
- Combined-listing options that point to a different product navigate to that product's native URL, preserving its app/SEO context. Ordinary option changes use section rendering with no full-page reload.
- Without JavaScript, product text/images and native add-to-cart for the displayed variant remain usable; option switching and popup behavior require JavaScript. Accordion content stays visible without JavaScript.
- Added interface phrases are English, matching the request/theme content. Existing Shopify translation keys are reused for purchase/price states; global locale files are unchanged.
- Real rating data and native swatch data must be populated to reproduce those parts of the screenshot. Shop Pay and Apple Pay appearance cannot be forced across devices.

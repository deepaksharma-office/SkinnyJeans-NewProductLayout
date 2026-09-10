/* Local fixture QA, not a Shopify checkout emulator.
 * Requires liquidjs and playwright-core on NODE_PATH and an installed Chromium.
 * Run: node tests/custom-main-product.test.cjs
 * Shopify-only filters/forms below are test adapters; production Liquid is unchanged.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { Liquid } = require('liquidjs');
const { chromium } = require('playwright-core');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'sections/custom-main-product.liquid'), 'utf8');
const schema = JSON.parse(source.match(/{% schema %}([\s\S]*?){% endschema %}/)[1]);
const artifactDir = fs.mkdtempSync(path.join(os.tmpdir(), 'custom-product-qa-'));
function adapt(text) {
  return text.replace(/{% schema %}[\s\S]*?{% endschema %}/g, '')
    .replace(/{%-?\s*form\s+([^%]+?)-?%}/g, (_, args) => {
      const id = args.match(/id:\s*(\w+)/)?.[1];
      const className = args.match(/class:\s*'([^']+)'/)?.[1] || '';
      return `<form method="post" action="/cart/add" id="{{ ${id} }}" class="${className}" ${args.includes('data-custom-buy-form') ? 'data-custom-buy-form' : ''}>`;
    }).replace(/{%-?\s*endform\s*-?%}/g, '</form>');
}
const engine = new Liquid({ root: path.join(root, 'snippets'), extname: '.liquid', fs: {
  exists: async (file) => fs.existsSync(file), existsSync: fs.existsSync,
  readFile: async (file) => adapt(fs.readFileSync(file, 'utf8')),
  readFileSync: (file) => adapt(fs.readFileSync(file, 'utf8')),
  resolve: (dir, file, ext) => path.resolve(dir, file.endsWith(ext) ? file : file + ext),
  dirname: path.dirname, sep: path.sep
} });
const escape = (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
engine.registerFilter('asset_url', (value) => `/assets/${value}`);
engine.registerFilter('stylesheet_tag', (value) => `<link rel="stylesheet" href="${value}">`);
engine.registerFilter('image_url', (value, width) => `${value.src}?width=${width?.[1] || 1000}`);
engine.registerFilter('image_tag', (value, ...args) => {
  const opts = Object.fromEntries(args.filter(Array.isArray));
  return `<img src="${value}" width="800" height="1200" alt="${escape(opts.alt)}" loading="${opts.loading || 'lazy'}" fetchpriority="${opts.fetchpriority || 'auto'}">`;
});
engine.registerFilter('money', (value) => `$${(value / 100).toFixed(2)}`);
engine.registerFilter('money_with_currency', (value) => `$${(value / 100).toFixed(2)} USD`);
engine.registerFilter('metafield_tag', (value) => value?.value || '');
engine.registerFilter('payment_terms', () => '<span data-fixture-payment-terms>Shopify payment terms fixture</span>');
engine.registerFilter('payment_button', () => '<button type="button" data-fixture-payment-button>Shopify accelerated checkout fixture</button>');
engine.registerFilter('placeholder_svg_tag', () => '<svg width="800" height="1200"></svg>');
engine.registerFilter('t', (key) => ({
  'products.product.add_to_cart': 'Add to cart', 'products.product.sold_out': 'Sold out',
  'products.product.unavailable': 'Unavailable', 'products.product.price.regular_price': 'Regular price',
  'products.product.price.sale_price': 'Sale price', 'products.product.variant_sold_out_or_unavailable': 'Sold out or unavailable'
}[key] || key));
const settings = Object.fromEntries(schema.settings.map((s) => [s.id, s.default]));
const blocks = schema.presets[0].blocks.map((block, index) => ({
  ...block, id: `block-${index}`, settings: {
    ...Object.fromEntries((schema.blocks.find((s) => s.type === block.type).settings || []).map((s) => [s.id, s.default])), ...block.settings
  }
}));
blocks.find((b) => b.type === 'variant_selector').settings.size_guide_page = { title: 'Size guide', content: '<table><tr><th>Size</th><th>Waist</th></tr><tr><td>27</td><td>27 inches</td></tr></table><a href="#guide-link">Guide link</a>' };
const variants = [
  { id: 101, price: 23900, compare_at_price: 0, available: true, inventory_quantity: 7, featured_media: { id: 1 } },
  { id: 102, price: 25900, compare_at_price: 28900, available: true, inventory_quantity: 2, featured_media: { id: 3 } },
  { id: 103, price: 23900, compare_at_price: 0, available: false, inventory_quantity: 0, featured_media: { id: 2 } }
].map((v) => ({ ...v, inventory_management: 'shopify', inventory_policy: 'deny', quantity_rule: { min: 1 }, metafields: { custom: { new_tag: { value: v.id === 101 } } } }));
const optionValue = (id, name, selected, variant, swatch) => ({ id, name, selected, available: variant?.available || false, variant, swatch, toString() { return name; } });
function productFor(url, overrides = {}) {
  const ids = url.searchParams.get('option_values')?.split(',');
  const current = ids ? (ids[1] === '22' ? variants[1] : ids[1] === '23' ? variants[2] : ids[1] === '24' ? null : variants[0]) : variants.find((v) => String(v.id) === url.searchParams.get('variant')) || variants[0];
  const sizeId = ids?.[1] || (current?.id === 102 ? '22' : current?.id === 103 ? '23' : '21');
  const sizes = ['23', '24', '25', '26', '27', '28', '29', '30', '31', '32', '33', '34'];
  const sizeValues = sizes.map((name, i) => {
    const id = String(21 + i);
    return optionValue(id, name, id === sizeId, id === '22' ? variants[1] : id === '23' ? variants[2] : id === '24' ? null : variants[0]);
  });
  return { id: 1, title: 'SkinnyBoot', url: '/products/skinnyboot', selected_or_first_available_variant: current,
    description: '<p>A cropped take on our best-selling skinny silhouette. High-rise with a form-skimming leg cut at the ankle — designed to be worn with everything from sandals to knee-high boots.</p><p>Cut, sewn, washed and finished in Los Angeles, California.</p>',
    media: Array.from({ length: 4 }, (_, i) => ({ id: i + 1, media_type: 'image', alt: `Denim view ${i + 1}`, preview_image: { src: `/media/${i + 1}.svg`, width: 800, height: 1200 } })),
    options_with_values: [
      { name: 'WASH', position: 1, selected_value: 'Medium Indigo', values: [optionValue('11', 'Medium Indigo', true, current, { color: { rgb: '60, 100, 130' } }), optionValue('12', 'Dark Indigo', false, variants[1], { color: { rgb: '28, 45, 72' } }), optionValue('13', 'White', false, current, { color: { rgb: '224, 224, 228' } }), optionValue('14', 'Rinse', false, current, { image: { src: '/media/1.svg' } })] },
      { name: 'Size', position: 2, values: sizeValues },
      { name: 'Inseam', position: 3, values: [optionValue('31', '32', true, current), optionValue('32', '34', false, current), optionValue('33', '36', false, variants[2])] }
    ],
    metafields: { reviews: { rating: { value: { rating: 4.8, scale_max: 5 } }, rating_count: { value: 142 } }, custom: { design_and_fit: { value: '<p>High rise. Fitted through the hip. <a href="#fit-detail">Fit details</a></p>' }, fabric_and_care: { value: '<p>Premium stretch denim. Wash cold.</p>' } } },
    ...overrides
  };
}
async function render(url, overrides = {}, id = 'fixture') {
  return engine.parseAndRender(adapt(source), { product: productFor(url, overrides), section: { id, settings, blocks }, settings: { currency_code_enabled: false }, routes: { cart_url: '/cart', cart_add_url: '/cart/add.js' }, request: {}, form: {} });
}
let failVariant = false;
let cartError = false;
let lastCartBody = '';
const mediaRequests = [];
const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname.startsWith('/assets/')) {
      response.setHeader('Content-Type', url.pathname.endsWith('.css') ? 'text/css' : 'text/javascript');
      return response.end(fs.readFileSync(path.join(root, url.pathname)));
    }
    if (url.pathname.startsWith('/media/')) {
      mediaRequests.push(url.searchParams.get('width'));
      response.setHeader('Content-Type', 'image/svg+xml');
      return response.end('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1200"><rect width="800" height="1200" fill="#ccc3b3"/><path d="M240 150h320l-20 450-70 520h-90l-10-520-40 520h-100l-10-520z" fill="#304c61"/><path d="M240 230h310M385 160v430" stroke="#a4906e" stroke-width="4"/></svg>');
    }
    if (url.pathname === '/cart/add.js') {
      for await (const chunk of request) lastCartBody += chunk;
      response.setHeader('Content-Type', 'application/json');
      if (cartError) { response.statusCode = 422; return response.end(JSON.stringify({ status: 422, description: 'The requested quantity is unavailable.' })); }
      return response.end(JSON.stringify({ id: 101, key: 'fixture', sections: { 'cart-drawer': '<div>Cart fixture</div>', 'cart-icon-bubble': '<span>1</span>' } }));
    }
    if (url.searchParams.has('section_id')) {
      if (failVariant) { response.statusCode = 500; return response.end('Unavailable'); }
      if (url.searchParams.get('option_values')?.split(',')[1] === '22') await new Promise((resolve) => setTimeout(resolve, 200));
      return response.end(await render(url));
    }
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>html{font-size:62.5%;--font-body-family:Arial,sans-serif;--font-heading-family:Arial,sans-serif}body{margin:0}#fixture-header{height:80px}</style></head><body><div id="fixture-header"></div>${await render(url)}<div id="judgeme_product_reviews">Review widget fixture</div><div style="height:600px"></div><cart-drawer></cart-drawer><script>customElements.define('cart-drawer',class extends HTMLElement{getSectionsToRender(){return [{id:'cart-drawer'},{id:'cart-icon-bubble'}]}setActiveElement(el){this.trigger=el}renderContents(result){window.cartResult=result}})</script></body></html>`);
  } catch (error) { response.statusCode = 500; response.end(error.stack); }
});

(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1584, height: 1000 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${base}/products/skinnyboot`);
    const section = page.locator('custom-main-product');
    await section.locator('[data-enhanced]').count();
    assert.equal(await section.locator('h1').count(), 1);
    assert.equal(await section.locator('.custom-main-product__media').count(), 4);
    assert.equal(await section.locator('[data-custom-accordion-toggle][aria-expanded=true]').count(), 1);
    assert.equal(await section.locator('.custom-main-product__new').first().innerText(), 'New');
    assert(!mediaRequests.includes('2400'), 'No initial full-resolution requests');
    const layout = await page.evaluate(() => {
      const gallery = document.querySelector('[data-custom-gallery]').getBoundingClientRect();
      const info = document.querySelector('.custom-main-product__info').getBoundingClientRect();
      return { gallery: gallery.width, info: info.width, sideBySide: info.left > gallery.right, overflow: document.documentElement.scrollWidth > innerWidth };
    });
    assert(layout.sideBySide && layout.gallery > layout.info && !layout.overflow);
    await page.screenshot({ path: path.join(artifactDir, 'custom-desktop.png'), fullPage: true });
    const guide = section.locator('[data-custom-guide]');
    await page.evaluate(() => window.scrollTo(0, 120));
    const scrollBefore = await page.evaluate(() => scrollY);
    await guide.click();
    assert.equal(await section.locator('.custom-main-product__guide').evaluate((el) => el.open), true);
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).position), 'fixed');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => document.body.style.position), '');
    assert.equal(await page.evaluate(() => scrollY), scrollBefore);
    assert.equal(await guide.evaluate((el) => el === document.activeElement), true);
    await section.locator('.custom-main-product__block--collapsible [data-custom-accordion-toggle]').first().click();
    assert.equal(await section.locator('[data-custom-accordion-toggle][aria-expanded=true]').count(), 1);
    assert.equal(await section.locator('.custom-main-product__block--description .custom-main-product__accordion-panel').evaluate((el) => el.inert), true);
    await section.locator('[data-custom-image="0"]').click();
    await page.waitForFunction(() => document.querySelector('[data-custom-slide="0"]').dataset.loading === 'false');
    assert(mediaRequests.includes('2400'));
    const viewerImage = section.locator('[data-custom-slide="0"] img');
    await viewerImage.click();
    assert.equal(await viewerImage.getAttribute('data-zoomed'), '');
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(500);
    assert.equal(await section.locator('[data-custom-viewer-count]').innerText(), '2 / 4');
    await page.keyboard.press('Escape');
    await section.locator('label[for="custom-option-fixture-2-22"]').click();
    await page.waitForFunction(() => document.querySelector('[data-custom-state]').dataset.variantId === '102');
    assert((await section.locator('[data-custom-update=price]').innerText()).includes('$259.00'));
    assert((await section.locator('[data-custom-update=price]').innerText()).includes('$289.00'));
    assert((await section.locator('[data-custom-update=inventory]').innerText()).includes('Only 2'));
    assert.equal(await section.locator('input[name=id]').first().inputValue(), '102');
    assert(page.url().includes('variant=102'));
    await section.locator('label[for="custom-option-fixture-2-23"]').click();
    await page.waitForFunction(() => document.querySelector('[data-custom-state]').dataset.variantId === '103');
    assert.equal(await section.locator('.custom-main-product__add').isDisabled(), true);
    assert.equal(await section.locator('.custom-main-product__payment').isVisible(), false);
    await section.locator('label[for="custom-option-fixture-2-24"]').click();
    await page.waitForFunction(() => document.querySelector('[data-custom-state]').dataset.variantId === '');
    assert.equal((await section.locator('.custom-main-product__add').textContent()).trim(), 'Unavailable');
    // Out-of-order responses must never win over the latest option selection.
    await section.locator('label[for="custom-option-fixture-2-22"]').click();
    await section.locator('label[for="custom-option-fixture-2-21"]').click();
    await page.waitForFunction(() => document.querySelector('[data-custom-state]').dataset.variantId === '101');
    await page.waitForTimeout(300);
    assert.equal(await section.locator('[data-custom-state]').getAttribute('data-variant-id'), '101');
    failVariant = true;
    await section.locator('label[for="custom-option-fixture-2-22"]').click();
    await section.locator('[data-custom-error]').waitFor({ state: 'visible' });
    assert.equal(await section.locator('.custom-main-product__add').isDisabled(), true);
    assert.equal(await section.locator('.custom-main-product__payment').isVisible(), false);
    failVariant = false;
    await section.locator('label[for="custom-option-fixture-2-21"]').click();
    await page.waitForFunction(() => !document.querySelector('.custom-main-product__add').disabled);
    cartError = true;
    await section.locator('.custom-main-product__add').click();
    await page.waitForFunction(() => document.querySelector('[data-custom-error]').textContent.includes('quantity'));
    cartError = false;
    await section.locator('.custom-main-product__add').click();
    await page.waitForFunction(() => window.cartResult);
    assert(lastCartBody.includes('101') && lastCartBody.includes('sections'));
    await page.goto(`${base}/products/skinnyboot?variant=102`);
    assert.equal(await section.locator('[data-custom-state]').getAttribute('data-variant-id'), '102');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${base}/products/skinnyboot`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await section.locator('[data-custom-dot="2"]').click();
    await page.waitForFunction(() => document.querySelector('[data-custom-dot="2"]').getAttribute('aria-current') === 'true');
    await page.screenshot({ path: path.join(artifactDir, 'custom-mobile.png'), fullPage: true });
    await section.locator('[data-custom-image="2"]').click();
    await page.waitForFunction(() => document.querySelector('[data-custom-slide="2"]').dataset.loading === 'false');
    await section.locator('[data-custom-slide="2"] img').click();
    assert.equal(await section.locator('[data-zoomed]').count(), 0);
    await section.locator('[data-custom-viewer-track]').evaluate((el) => el.scrollTo({ left: el.clientWidth * 3, behavior: 'instant' }));
    await page.waitForFunction(() => document.querySelector('[data-custom-viewer-count]').textContent === '4 / 4');
    await page.keyboard.press('Escape');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(await section.locator('.custom-main-product__pulse').evaluate((el) => getComputedStyle(el).animationName), 'none');
    // Editor cleanup while a dialog is open, followed by a section reconnection.
    await guide.click();
    await section.evaluate((el) => { window.savedSection = el; el.remove(); });
    assert.equal(await page.evaluate(() => document.body.style.position), '');
    await page.evaluate(() => document.body.append(window.savedSection));
    await guide.click();
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.body.style.position === '');
    assert.deepEqual(errors, []);
    const empty = await render(new URL(base), { media: [], description: '', metafields: {}, has_only_default_variant: true });
    assert(!empty.includes('custom-main-product__rating'));
    assert(empty.includes('No product images available'));
    assert(!empty.includes('data-custom-accordion-toggle'));
    assert(!source.includes('for variant in product.variants'));
    console.log(JSON.stringify({ status: 'passed', coverage: ['desktop/mobile layout', 'native dialog focus and scroll restoration', 'exclusive accordion', 'lazy popup images', 'desktop zoom', 'mobile viewer', 'pagination', 'deep links', 'price/compare/inventory updates', 'sold-out and invalid combinations', 'request races and failures', 'cart success/error and drawer contract', 'editor reconnect', 'reduced motion', 'empty data'], screenshots: artifactDir }, null, 2));
  } finally {
    await browser?.close();
    server.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; server.close(); });

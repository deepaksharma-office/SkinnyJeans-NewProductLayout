(() => {
  if (customElements.get('custom-main-product')) return;
  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const motion = () => reducedMotion() ? 'instant' : 'smooth';

  // Shared only between custom section instances; restores every property it changes.
  const scrollLock = {
    owners: new Set(),
    acquire(owner) {
      if (this.owners.has(owner)) return;
      if (!this.owners.size) {
        const body = document.body;
        this.x = window.scrollX;
        this.y = window.scrollY;
        this.saved = {};
        for (const property of ['overflow', 'padding-right', 'position', 'top', 'left', 'width']) {
          this.saved[property] = [body.style.getPropertyValue(property), body.style.getPropertyPriority(property)];
        }
        const gap = window.innerWidth - document.documentElement.clientWidth;
        const padding = parseFloat(getComputedStyle(body).paddingRight) || 0;
        body.style.paddingRight = `${padding + gap}px`;
        body.style.overflow = 'hidden';
        body.style.position = 'fixed';
        body.style.top = `${-this.y}px`;
        body.style.left = `${-this.x}px`;
        body.style.width = '100%';
      }
      this.owners.add(owner);
    },
    release(owner) {
      if (!this.owners.delete(owner) || this.owners.size) return;
      for (const [property, [value, priority]] of Object.entries(this.saved)) {
        if (value) document.body.style.setProperty(property, value, priority);
        else document.body.style.removeProperty(property);
      }
      window.scrollTo({ left: this.x, top: this.y, behavior: 'instant' });
    }
  };

  class CustomDialogs {
    constructor(root, signal) {
      this.root = root;
      this.triggers = new WeakMap();
      root.addEventListener('click', (event) => {
        const close = event.target.closest('[data-custom-close]');
        if (close) close.closest('dialog').close();
        if (event.target.closest('[data-custom-guide]')) this.open(root.querySelector('.custom-main-product__guide'));
        if (event.target === this.active) this.active.close();
      }, { signal });
      root.querySelectorAll('dialog').forEach((dialog) => {
        dialog.addEventListener('close', () => {
          if (dialog.open) return;
          scrollLock.release(dialog);
          if (this.active === dialog) {
            this.active = null;
            const trigger = this.triggers.get(dialog);
            if (trigger?.isConnected) trigger.focus({ preventScroll: true });
          }
        }, { signal });
        // Native showModal supplies focus trapping, inert background and Escape handling.
      });
    }
    open(dialog) {
      if (!dialog || dialog.open) return;
      if (this.active) {
        scrollLock.release(this.active);
        this.active.close();
      }
      this.triggers.set(dialog, document.activeElement);
      this.active = dialog;
      scrollLock.acquire(dialog);
      dialog.showModal();
    }
    destroy() {
      if (this.active) {
        scrollLock.release(this.active);
        this.active.close();
        this.active = null;
      }
    }
  }

  class CustomGallery {
    constructor(root, dialogs, signal) {
      this.root = root;
      this.dialogs = dialogs;
      this.gallery = root.querySelector('[data-custom-gallery]');
      this.media = [...root.querySelectorAll('.custom-main-product__media')];
      this.images = [...root.querySelectorAll('[data-custom-image]')];
      this.viewer = root.querySelector('[data-custom-viewer]');
      this.track = root.querySelector('[data-custom-viewer-track]');
      this.slides = [...root.querySelectorAll('[data-custom-slide]')];
      this.dots = [...root.querySelectorAll('[data-custom-dot]')];
      this.index = 0;
      this.targetIndex = null;
      this.signal = signal;
      root.addEventListener('click', (event) => this.click(event), { signal });
      this.gallery?.addEventListener('scroll', () => {
        if (window.matchMedia('(max-width: 749px)').matches && root.dataset.mobileSlider === 'true') {
          this.setIndex(Math.round(this.gallery.scrollLeft / this.gallery.clientWidth));
        }
      }, { passive: true, signal });
      this.track?.addEventListener('scroll', () => {
        const index = Math.round(this.track.scrollLeft / this.track.clientWidth);
        if (this.targetIndex !== null) {
          if (Math.abs(this.track.scrollLeft - this.targetIndex * this.track.clientWidth) < 2) this.targetIndex = null;
          else return;
        }
        if (index !== this.index) {
          this.resetZoom();
          this.setIndex(index);
          this.load(index);
        }
      }, { passive: true, signal });
      this.track?.addEventListener('pointerdown', () => { this.targetIndex = null; }, { passive: true, signal });
      this.track?.addEventListener('wheel', () => { this.targetIndex = null; }, { passive: true, signal });
      this.viewer?.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault();
          this.navigate(this.index + (event.key === 'ArrowLeft' ? -1 : 1));
        }
      }, { signal });
      this.viewer?.addEventListener('pointermove', (event) => {
        const img = event.target.closest('img[data-zoomed]');
        if (!img || !this.canZoom()) return;
        const box = img.parentElement.getBoundingClientRect();
        const x = Math.max(0, Math.min(100, (event.clientX - box.left) / box.width * 100));
        const y = Math.max(0, Math.min(100, (event.clientY - box.top) / box.height * 100));
        img.style.transformOrigin = `${x}% ${y}%`;
      }, { signal });
      this.viewer?.addEventListener('close', () => this.resetZoom(), { signal });
      window.addEventListener('resize', () => {
        if (this.viewer?.open) this.track.scrollTo({ left: this.index * this.track.clientWidth, behavior: 'instant' });
      }, { signal });
    }
    canZoom() {
      return this.root.dataset.zoom === 'true' && window.matchMedia('(min-width: 990px) and (hover: hover) and (pointer: fine)').matches;
    }
    click(event) {
      const image = event.target.closest('[data-custom-image]');
      if (image) {
        this.dialogs.open(this.viewer);
        this.navigate(Number(image.dataset.customImage), false);
      }
      const dot = event.target.closest('[data-custom-dot]');
      if (dot) this.goToMedia(Number(dot.dataset.customDot));
      if (event.target.closest('[data-custom-previous]')) this.navigate(this.index - 1);
      if (event.target.closest('[data-custom-next]')) this.navigate(this.index + 1);
      if (event.target.closest('[data-custom-retry]')) this.load(this.index, true);
      if (event.target.matches('.custom-main-product__viewer-stage img') && this.canZoom()) event.target.toggleAttribute('data-zoomed');
      if (event.target.matches('.custom-main-product__viewer-slide, .custom-main-product__viewer-track')) this.viewer.close();
    }
    resetZoom() {
      this.viewer?.querySelectorAll('[data-zoomed]').forEach((img) => {
        img.removeAttribute('data-zoomed');
        img.style.transformOrigin = '';
      });
    }
    setIndex(index) {
      this.index = Math.max(0, Math.min(this.media.length - 1, index));
      this.dots.forEach((dot, i) => {
        if (i === this.index) dot.setAttribute('aria-current', 'true');
        else dot.removeAttribute('aria-current');
      });
      const count = this.root.querySelector('[data-custom-viewer-count]');
      if (count) count.textContent = `${this.index + 1} / ${this.media.length}`;
    }
    goToMedia(index, scrollDesktop = false) {
      if (!this.media[index]) return;
      this.setIndex(index);
      if (window.matchMedia('(max-width: 749px)').matches && this.root.dataset.mobileSlider === 'true') {
        this.gallery.scrollTo({ left: index * this.gallery.clientWidth, behavior: motion() });
      } else if (scrollDesktop) {
        const rect = this.media[index].getBoundingClientRect();
        if (rect.top < 0 || rect.top > window.innerHeight * .75) this.media[index].scrollIntoView({ block: 'nearest', behavior: motion() });
      }
    }
    selectMedia(id, scrollDesktop = false) {
      const index = this.media.findIndex((media) => media.dataset.mediaId === String(id));
      if (index >= 0) this.goToMedia(index, scrollDesktop);
    }
    navigate(index, animate = true) {
      if (!this.slides.length) return;
      const next = (index + this.slides.length) % this.slides.length;
      this.resetZoom();
      this.setIndex(next);
      this.load(next);
      this.targetIndex = animate && !reducedMotion() ? next : null;
      this.track.scrollTo({ left: next * this.track.clientWidth, behavior: animate ? motion() : 'instant' });
    }
    load(index, retry = false) {
      const slide = this.slides[index];
      const source = this.images[index];
      if (!slide || !source || (slide.dataset.requested && !retry)) return;
      slide.dataset.requested = 'true';
      slide.dataset.loading = 'true';
      slide.querySelector('[data-custom-image-error]').hidden = true;
      let img = slide.querySelector('img');
      if (!img) {
        img = slide.querySelector('template').content.firstElementChild.cloneNode(true);
        slide.querySelector('.custom-main-product__viewer-stage').append(img);
      }
      const high = new Image();
      high.onload = () => {
        if (this.signal.aborted) return;
        img.src = high.src;
        slide.dataset.loading = 'false';
      };
      high.onerror = () => {
        if (this.signal.aborted) return;
        slide.dataset.loading = 'false';
        slide.querySelector('[data-custom-image-error]').hidden = false;
      };
      // Reuse the already downloaded responsive image while the full image loads.
      img.src = source.querySelector('img').currentSrc || source.querySelector('img').src;
      high.src = source.dataset.fullSrc;
    }
  }

  class CustomMainProduct extends HTMLElement {
    connectedCallback() {
      // Connected callbacks may run before children are parsed in editor-inserted HTML.
      if (this.lifecycle) return;
      if (!this.querySelector('[data-custom-state]')) return;
      this.lifecycle = new AbortController();
      const { signal } = this.lifecycle;
      this.setAttribute('data-enhanced', '');
      this.dialogs = new CustomDialogs(this, signal);
      this.gallery = new CustomGallery(this, this.dialogs, signal);
      this.addEventListener('change', (event) => {
        if (event.target.matches('[data-option-value-id]')) this.changeVariant(event.target);
      }, { signal });
      this.addEventListener('submit', (event) => {
        if (event.target.matches('[data-custom-buy-form]')) this.addToCart(event);
      }, { signal });
      this.addEventListener('click', (event) => {
        const toggle = event.target.closest('[data-custom-accordion-toggle]');
        if (!toggle) return;
        const open = toggle.getAttribute('aria-expanded') !== 'true';
        this.querySelectorAll('[data-custom-accordion-toggle]').forEach((button) => {
          this.setAccordion(button, button === toggle && open);
        });
      }, { signal });
      this.querySelectorAll('[data-custom-accordion-toggle]').forEach((button) => this.setAccordion(button, button.getAttribute('aria-expanded') === 'true'));
      this.gallery.selectMedia(this.querySelector('[data-custom-state]')?.dataset.mediaId);
      window.addEventListener('popstate', () => {
        if (location.pathname === new URL(this.dataset.productUrl, location.origin).pathname) this.updateVariant(new URL(location.href), null, false);
      }, { signal });
    }
    disconnectedCallback() {
      this.dialogs?.destroy();
      this.lifecycle?.abort();
      this.request?.abort();
      this.lifecycle = null;
    }
    setAccordion(button, open) {
      button.setAttribute('aria-expanded', String(open));
      const panel = this.querySelector(`#${CSS.escape(button.getAttribute('aria-controls'))}`);
      if (!panel) return;
      panel.dataset.open = String(open);
      panel.inert = !open;
    }
    error(message = '') {
      const target = this.querySelector('[data-custom-error]');
      if (!target) return;
      target.textContent = message;
      target.hidden = !message;
    }
    changeVariant(input) {
      const sibling = input.dataset.productUrl;
      if (sibling && new URL(sibling, location.origin).pathname !== new URL(this.dataset.productUrl, location.origin).pathname) {
        // Combined listings change product context; preserve app/SEO state through native navigation.
        window.location.assign(sibling);
        return;
      }
      const url = new URL(this.dataset.productUrl, location.origin);
      const ids = [...this.querySelectorAll('[data-option-value-id]:checked')].map((option) => option.dataset.optionValueId);
      url.searchParams.set('option_values', ids.join(','));
      this.updateVariant(url, input.id);
    }
    async updateVariant(url, focusId, updateUrl = true) {
      this.request?.abort();
      const request = new AbortController();
      this.request = request;
      url.searchParams.set('section_id', this.dataset.sectionId);
      this.setAttribute('data-loading', '');
      this.selectionFailed = false;
      this.querySelector('[data-custom-buy-form] button[type=submit]')?.setAttribute('disabled', '');
      this.querySelector('[data-custom-update=variants]')?.setAttribute('aria-busy', 'true');
      this.error();
      try {
        const response = await fetch(url, { signal: request.signal });
        if (!response.ok) throw new Error('Unable to load product options.');
        const html = new DOMParser().parseFromString(await response.text(), 'text/html');
        const next = html.getElementById(this.id);
        if (!next?.querySelector('[data-custom-state]')) throw new Error('Product options are unavailable.');
        if (request.signal.aborted) return;
        const restoreFocus = focusId && this.contains(document.activeElement) && document.activeElement.matches('[data-option-value-id]');
        for (const name of ['price', 'variants', 'inventory', 'buy']) {
          const target = this.querySelector(`[data-custom-update="${name}"]`);
          const source = next.querySelector(`[data-custom-update="${name}"]`);
          if (target && source) target.replaceChildren(...source.childNodes);
        }
        const state = next.querySelector('[data-custom-state]');
        this.querySelector('[data-custom-state]').replaceWith(state);
        this.querySelectorAll('input[name=id]').forEach((input) => input.dispatchEvent(new Event('change', { bubbles: true })));
        window.Shopify?.PaymentButton?.init();
        if (updateUrl) {
          const address = new URL(location.href);
          address.searchParams.delete('variant');
          address.searchParams.delete('option_values');
          if (state.dataset.variantId) address.searchParams.set('variant', state.dataset.variantId);
          else address.searchParams.set('option_values', url.searchParams.get('option_values') || '');
          window.history.replaceState(window.history.state, '', address);
        }
        this.gallery.selectMedia(state.dataset.mediaId, true);
        if (restoreFocus) this.querySelector(`#${CSS.escape(focusId)}`)?.focus({ preventScroll: true });
        this.querySelector('[data-custom-status]').textContent = state.dataset.variantId ? '' : 'This combination is unavailable. Please choose another option.';
      } catch (error) {
        if (error.name !== 'AbortError') this.selectionFailed = true;
        if (error.name !== 'AbortError') this.error('Could not update your selection. Choose an option again to retry.');
        // Keep purchase controls disabled after failure: never add a stale variant.
        if (error.name !== 'AbortError') this.querySelector('.custom-main-product__payment')?.setAttribute('hidden', '');
      } finally {
        if (this.request === request) {
          this.removeAttribute('data-loading');
          this.querySelector('[data-custom-update=variants]')?.removeAttribute('aria-busy');
        }
      }
    }
    async addToCart(event) {
      event.preventDefault();
      if (this.adding || this.selectionFailed || this.hasAttribute('data-loading')) return;
      const form = event.target;
      const button = form.querySelector('button[type=submit]');
      if (button.disabled || !form.querySelector('input[name=id]')?.value) return;
      this.adding = true;
      const label = button.textContent;
      button.disabled = true;
      button.textContent = 'Adding…';
      this.error();
      const cart = document.querySelector('cart-notification') || document.querySelector('cart-drawer');
      const data = new FormData(form);
      const sections = cart?.getSectionsToRender?.();
      if (sections) {
        data.set('sections', sections.map((section) => section.id).join(','));
        data.set('sections_url', location.pathname);
        cart.setActiveElement?.(button);
      }
      let added = false;
      try {
        const response = await fetch(this.dataset.cartAddUrl, {
          method: 'POST', headers: { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' }, body: data
        });
        const result = await response.json();
        if (!response.ok || result.status) throw new Error(result.description || 'Unable to add this item. Please try again.');
        added = true;
        if (!this.isConnected) return;
        this.querySelector('[data-custom-status]').textContent = 'Added to cart';
        if (typeof publish === 'function' && typeof PUB_SUB_EVENTS !== 'undefined') {
          publish(PUB_SUB_EVENTS.cartUpdate, { source: 'custom-main-product', productVariantId: data.get('id'), cartData: result });
        }
        if (sections && sections.every((section) => typeof result.sections?.[section.id] === 'string')) {
          cart.classList.remove('is-empty');
          cart.renderContents(result);
        } else window.location.assign(this.dataset.cartUrl);
      } catch (error) {
        if (added) window.location.assign(this.dataset.cartUrl);
        else this.error(error.message || 'Unable to add this item. Please try again.');
      } finally {
        this.adding = false;
        if (button.isConnected) {
          button.textContent = label;
          if (!this.hasAttribute('data-loading') && !this.selectionFailed) button.disabled = false;
        }
      }
    }
  }
  customElements.define('custom-main-product', CustomMainProduct);
  // Custom-element callbacks cover regular insertion/removal; explicit editor events
  // also support editor implementations that preserve section elements in place.
  document.addEventListener('shopify:section:unload', (event) => {
    event.target.querySelectorAll('custom-main-product').forEach((section) => section.disconnectedCallback());
  });
  document.addEventListener('shopify:section:load', (event) => {
    event.target.querySelectorAll('custom-main-product').forEach((section) => section.connectedCallback());
  });
})();

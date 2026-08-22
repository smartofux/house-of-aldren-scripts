/* ==========================================================================
   HOUSE OF ALDREN — Digital Dining Experience
   Full site logic: dish grid, filtering, favorites, search, highlights,
   dish detail + pairs, table-select + order summary + QR code, currency.

   Hosted externally (GitHub + jsDelivr) to get past Webflow's 50,000
   character limit on custom code embeds. Loaded via:
     <script src="[jsDelivr URL]"></script>
   in the page's footer custom code, placed AFTER the qr-code-styling
   CDN script tag so window.QRCodeStyling is available by the time this
   file runs.
   ========================================================================== */

document.addEventListener('DOMContentLoaded', function () {

  // ==========================================================================
  // SHARED STATE / ELEMENT REFERENCES
  // ==========================================================================
  var emptyCategory = document.querySelector('[dd-element="empty-category"]');
  var emptyFilter = document.querySelector('[dd-element="empty-filter"]');
  var dishListInner = document.querySelector('.dish_list');
  var allPills = Array.prototype.slice.call(document.querySelectorAll('[dd-item="category"]'));
  var allDishes = Array.prototype.slice.call(document.querySelectorAll('[dd-item="dish"]'));
  var DEFAULT_DISH_IMG = 'https://cdn.prod.website-files.com/6a7bcdf6968bd19a5ed5d5fc/6a7f5e9abb716a8548461374_default-dd-img.png';

  // ==========================================================================
  // CURRENCY: single source of truth read from one Embed element
  // (dd-currency-symbol). Change the symbol there and every price on the
  // site updates from one edit — no code touch needed.
  // ==========================================================================
  function getCurrencySymbol() {
    var symbolEl = document.querySelector('[dd-currency-symbol]');
    return symbolEl ? symbolEl.textContent.trim() : '€';
  }
  var CURRENCY_SYMBOL = getCurrencySymbol();

  // Stores the raw numeric value once (data-price-raw), so re-applying the
  // symbol never stacks (avoids "€€€6.90" on repeated calls).
  function setPriceText(el, rawValue) {
    if (!el) return;
    if (rawValue === null || rawValue === undefined || rawValue === '') {
      el.textContent = '';
      el.removeAttribute('data-price-raw');
      return;
    }
    el.setAttribute('data-price-raw', rawValue);
    el.textContent = CURRENCY_SYMBOL + rawValue;
  }

  // For static CMS-bound prices (grid/search/favorites cards): capture the
  // original number once, then render it with the current currency symbol.
  function applyCurrencyToStaticPrices() {
    document.querySelectorAll('[dd-price]').forEach(function (el) {
      var raw = el.getAttribute('data-price-raw');
      if (raw === null) {
        raw = el.textContent.trim();
        el.setAttribute('data-price-raw', raw);
      }
      el.textContent = CURRENCY_SYMBOL + raw;
    });
  }

  // ==========================================================================
  // SHARED HELPERS
  // ==========================================================================
  function setFallbackImage(img) {
    img.removeAttribute('srcset');
    img.removeAttribute('sizes');
    img.src = DEFAULT_DISH_IMG;
  }

  function isVisible(el) {
    return !!el && el.offsetParent !== null;
  }

  // Given one of two [dd-dish-field="image"] elements (CMS-bound + static
  // fallback), returns the OTHER one — used when the CMS image 404s.
  function getSiblingImageField(img) {
    var container = img.parentElement;
    if (!container) return null;
    var matches = container.querySelectorAll('[dd-dish-field="image"]');
    for (var i = 0; i < matches.length; i++) {
      if (matches[i] !== img) return matches[i];
    }
    return null;
  }

  // ==========================================================================
  // CATEGORY / MENU-TYPE FILTERING
  // ==========================================================================
  var selectedMenuType = 'Food';
  var selectedCategory = 'all';

  var categoryMenuTypeMap = {};
  allPills.forEach(function (pill) {
    var slug = pill.getAttribute('dd-category-slug');
    var type = pill.getAttribute('dd-menu-type');
    if (slug && type) categoryMenuTypeMap[slug] = type;
  });

  function setActivePill(clickedPill) {
    allPills.forEach(function (pill) {
      pill.classList.remove('is-active');
    });
    clickedPill.classList.add('is-active');
  }

  function setActiveMenuLabel(radio) {
    document.querySelectorAll('.bottom-menu-item.is-text-label').forEach(function (label) {
      label.classList.remove('is-active');
    });
    var currentLabel = radio.closest('.bottom-menu-item');
    if (currentLabel) currentLabel.classList.add('is-active');
  }

  function resetToAllCategories() {
    selectedCategory = 'all';
    var allPill = document.querySelector('[dd-category-slug="all"]');
    if (allPill) setActivePill(allPill);
  }

  function filterCategoryPills() {
    allPills.forEach(function (pill) {
      var type = pill.getAttribute('dd-menu-type');
      pill.style.display = (!type || type === selectedMenuType) ? '' : 'none';
    });
  }

  // Reads the text of every item inside a nested tag-group Collection List
  // (dd-tag-group="diet" / "religious" / "allergens" / "more") on a dish card.
  function getDishTagSlugs(dish, group) {
    var wrapper = dish.querySelector('[dd-tag-group="' + group + '"]');
    if (!wrapper) return [];
    var items = wrapper.querySelectorAll('.w-dyn-item, [role="listitem"]');
    var slugs = [];
    items.forEach(function (item) {
      var text = item.textContent.trim().toLowerCase();
      if (text) slugs.push(text);
    });
    return slugs;
  }

  function getActivePreferences() {
    var active = { diet: [], religious: [], allergens: [], more: [] };
    document.querySelectorAll('.menu_toggle.is-active').forEach(function (toggle) {
      var item = toggle.closest('.menu_preference-item');
      if (!item) return;
      var group = item.getAttribute('dd-pref-group');
      var slug = item.getAttribute('dd-pref-slug');
      if (group && slug && active[group]) active[group].push(slug);
    });
    return active;
  }

  function dishMatchesPreferences(dish, active) {
    var groups = ['diet', 'religious', 'allergens', 'more'];
    for (var i = 0; i < groups.length; i++) {
      var group = groups[i];
      var selected = active[group];
      if (selected.length === 0) continue;
      var dishValues = getDishTagSlugs(dish, group);
      var hasMatch = selected.some(function (slug) {
        return dishValues.indexOf(slug) !== -1;
      });
      if (!hasMatch) return false;
    }
    return true;
  }

  function filterDishes() {
    var activePrefs = getActivePreferences();
    var matchCount = 0;

    allDishes.forEach(function (dish) {
      var slug = dish.getAttribute('dd-category-slug');
      var dishType = categoryMenuTypeMap[slug];
      var matchesCategory = selectedCategory === 'all' || slug === selectedCategory;
      var matchesMenuType = dishType === selectedMenuType;
      var matchesPrefs = dishMatchesPreferences(dish, activePrefs);
      var isMatch = matchesCategory && matchesMenuType && matchesPrefs;
      dish.style.display = isMatch ? '' : 'none';
      if (isMatch) matchCount++;
    });

    if (matchCount === 0) {
      if (dishListInner) dishListInner.style.display = 'none';
      if (emptyCategory) emptyCategory.style.display = 'flex';
      if (emptyFilter) emptyFilter.style.display = 'none';
    } else {
      if (dishListInner) dishListInner.style.display = '';
      if (emptyCategory) emptyCategory.style.display = 'none';
      if (emptyFilter) emptyFilter.style.display = 'none';
    }
  }
  window.filterDishes = filterDishes;

  document.querySelectorAll('[dd-menu-toggle]').forEach(function (radio) {
    radio.addEventListener('change', function () {
      if (radio.checked) {
        selectedMenuType = radio.getAttribute('dd-menu-toggle');
        setActiveMenuLabel(radio);
        filterCategoryPills();
        resetToAllCategories();
        filterDishes();
      }
    });
  });

  allPills.forEach(function (pill) {
    pill.addEventListener('click', function (e) {
      e.preventDefault();
      selectedCategory = pill.getAttribute('dd-category-slug');
      setActivePill(pill);
      filterDishes();
    });
  });

  document.addEventListener('click', function (e) {
    var resetBtn = e.target.closest('[dd-action="back-to-categories"]');
    if (resetBtn) {
      e.preventDefault();
      resetToAllCategories();
      filterCategoryPills();
      filterDishes();
    }
  });

  // ==========================================================================
  // DIETARY PREFERENCES FILTER PANEL
  // ==========================================================================
  function updatePreferenceState() {
    var activeToggles = document.querySelectorAll('.menu_toggle.is-active');
    var count = activeToggles.length;

    document.querySelectorAll('[dish-preference="filter-count"]').forEach(function (el) {
      el.textContent = '(' + count + ' active)';
    });

    var indicator = document.querySelector('[dd-element="preferences-indicator"]');
    if (indicator) {
      indicator.classList.toggle('is-active', count > 0);
      indicator.style.display = count > 0 ? '' : 'none';
    }

    var applyBtn = document.querySelector('[dish-preference-action="apply-filters"]');
    if (applyBtn) {
      applyBtn.classList.toggle('is-disabled', count === 0);
    }
  }

  document.querySelectorAll('.menu_preference-item').forEach(function (item) {
    item.addEventListener('click', function () {
      var toggle = item.querySelector('.menu_toggle');
      if (toggle) {
        toggle.classList.toggle('is-active');
        updatePreferenceState();
      }
    });
  });

  document.addEventListener('click', function (e) {
    var applyBtn = e.target.closest('[dish-preference-action="apply-filters"]');
    if (applyBtn) {
      e.preventDefault();
      if (applyBtn.classList.contains('is-disabled')) return;
      filterDishes();
      closeModal('preferences');
      return;
    }

    var resetBtn = e.target.closest('[dish-preference-action="reset-filters"]');
    if (resetBtn) {
      e.preventDefault();
      document.querySelectorAll('.menu_toggle.is-active').forEach(function (toggle) {
        toggle.classList.remove('is-active');
      });
      updatePreferenceState();
      filterDishes();
    }
  });

  // ==========================================================================
  // MODAL SYSTEM (generic open/close for every named modal)
  // ==========================================================================
  var currentOpenModal = null;

  function updateNavFixedHeight() {
    // querySelectorAll (not querySelector) — same duplicate-element footgun
    // as closeModal() and renderFavoritesList(): if Webflow duplicated this
    // element per breakpoint, updating only the first match left a second
    // untouched copy at its normal height, leaving a gap that let clicks and
    // hovers pass through to elements behind the open modal.
    var navFixedEls = document.querySelectorAll('.nav-bottom-fixed');
    if (!navFixedEls.length) return;
    var expandModals = ['favorites', 'preferences'];
    var shouldExpand = currentOpenModal && expandModals.indexOf(currentOpenModal) !== -1;
    navFixedEls.forEach(function (navFixed) {
      navFixed.style.height = shouldExpand ? '100vh' : 'auto';
    });
  }

  window.openModal = function (name) {
    if (currentOpenModal && currentOpenModal !== name) {
      closeModal(currentOpenModal);
    }
    var modal = document.querySelector('[dd-modal="' + name + '"]');
    var trigger = document.querySelector('[dd-trigger="' + name + '"]');
    if (modal) {
      modal.classList.add('is-open');
      // dish-detail has multiple mutually-exclusive content panels
      // (dish_detail-panel / dish_table-form / order-summary_panel), each
      // explicitly managed by openDishDetail()/openTableForm()/openOrderSummary()
      // — so skip the generic auto-open here to avoid picking the wrong one.
      if (name !== 'dish-detail') {
        var content = modal.querySelector('[dd-modal-content]');
        if (content) content.classList.add('is-open');
      }
    }
    if (trigger) trigger.classList.add('is-open');
    currentOpenModal = name;
    document.body.classList.add('no-scroll');
    updateNavFixedHeight();

    if (name === 'search') {
      var input = document.querySelector('[dd-search-input]');
      if (input) {
        setTimeout(function () {
          input.focus();
        }, 50);
      }
    }

    if (name === 'highlight') {
      showHighlightSlide(currentHighlightIndex); // resume from last-viewed slide
    }
  };

  window.closeModal = function (name) {
    var modal = document.querySelector('[dd-modal="' + name + '"]');
    var trigger = document.querySelector('[dd-trigger="' + name + '"]');
    if (modal) {
      modal.classList.remove('is-open');
      // Clear is-open from EVERY content panel inside this modal (not just the
      // first match) — dish-detail has multiple panels sharing dd-modal-content,
      // and using querySelector alone left later panels (e.g. dish_table-form)
      // permanently stuck open.
      modal.querySelectorAll('[dd-modal-content]').forEach(function (content) {
        content.classList.remove('is-open');
      });
    }
    if (trigger) trigger.classList.remove('is-open');
    if (currentOpenModal === name) currentOpenModal = null;
    if (!currentOpenModal) document.body.classList.remove('no-scroll');
    updateNavFixedHeight();

    if (name === 'dish-detail') resetOrderQrState();

    if (name === 'highlight') {
      pauseAllHighlightVideos();
      clearActiveIndicatorAnimation();
    }
  };

  function toggleModal(name) {
    var modal = document.querySelector('[dd-modal="' + name + '"]');
    if (!modal) return;
    if (modal.classList.contains('is-open')) {
      closeModal(name);
    } else {
      openModal(name);
    }
  }

  document.querySelectorAll('[dd-trigger]').forEach(function (trigger) {
    trigger.addEventListener('click', function (e) {
      e.preventDefault();
      toggleModal(trigger.getAttribute('dd-trigger'));
    });
  });

  // ==========================================================================
  // ORDER FLOW: table-select form + order summary + QR code,
  // all inside dish-detail-wrapper as mutually-exclusive panels.
  // ==========================================================================
  function updateOrderSummaryState() {
    var tableSelect = document.querySelector('[dd-table-select]');
    var orderSummaryBtn = document.querySelector('.is-order-summary');
    if (!orderSummaryBtn) return;
    var hasSelection = !!(tableSelect && tableSelect.value && tableSelect.value.trim() !== '');
    orderSummaryBtn.classList.toggle('is-disabled', !hasSelection);
  }

  function updateShowQrButtonLabel(isShowingQr) {
    document.querySelectorAll('[dd-action="show-qr-code"]').forEach(function (btn) {
      // Prefers the text-holding child if this button follows the same
      // "hide-mobile-portrait" label pattern as other buttons in this app;
      // falls back to the whole button otherwise.
      var textEl = btn.querySelector('.hide-mobile-portrait') || btn;
      textEl.textContent = isShowingQr ? 'Show Summary' : 'Show QR Code';
    });
  }

  function resetOrderQrState() {
    document.querySelectorAll('.order-items-token-wrap').forEach(function (el) {
      el.classList.remove('is-close');
    });
    document.querySelectorAll('.order-summary_qr-code').forEach(function (el) {
      el.classList.remove('is-qr-code');
    });
    updateShowQrButtonLabel(false);
  }

  function toggleOrderQRView() {
    var isCurrentlyShowingQr = !!document.querySelector('.order-summary_qr-code.is-qr-code');
    if (isCurrentlyShowingQr) {
      resetOrderQrState(); // also resets the button label back to "Show QR Code"
    } else {
      showOrderQRCode();
      updateShowQrButtonLabel(true);
    }
  }

  function openTableForm() {
    openModal('dish-detail'); // ensures wrapper is open; content panel is managed explicitly below
    var detailPanel = document.querySelector('.dish_detail-panel');
    var tableForm = document.querySelector('.dish_table-form');
    var orderSummaryPanel = document.querySelector('.order-summary_panel');
    if (detailPanel) detailPanel.classList.remove('is-open');
    if (orderSummaryPanel) orderSummaryPanel.classList.remove('is-open');
    if (tableForm) tableForm.classList.add('is-open');
    // Without this, a QR view left open from a previous visit to the order
    // summary panel stays fully opaque and clickable (its combo-class sets
    // pointer-events: auto independent of the parent panel's own is-open
    // state), silently blocking clicks on the table-select dropdown beneath.
    resetOrderQrState();
    updateOrderSummaryState();
  }

  var tableSelectEl = document.querySelector('[dd-table-select]');
  if (tableSelectEl) {
    tableSelectEl.addEventListener('change', updateOrderSummaryState);
  }
  updateOrderSummaryState();

  // Items shown in the order summary: the manually-selected subset if the
  // person used Favorites' select mode, otherwise every current favorite.
  function getOrderItemIds() {
    var favorites = loadFavorites();
    if (selectModeActive && selectedFavorites.length > 0) return selectedFavorites.slice();
    return favorites.slice();
  }

  // Deterministic order token: same selection + table always produces the
  // same token; changes only when the actual order content changes.
  // Format: "HOA-" + letter + 3-digit number, derived from a simple hash.
  function generateOrderToken(itemIds, tableValue) {
    var base = itemIds.slice().sort().join('|') + '|' + (tableValue || '');
    var hash = 0;
    for (var i = 0; i < base.length; i++) {
      hash = (hash * 31 + base.charCodeAt(i)) >>> 0;
    }
    var letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    var letter = letters[hash % 26];
    var number = (hash % 900) + 100;
    return 'HOA-' + letter + number;
  }

  function findDishById(dishId) {
    return allDishes.filter(function (d) { return d.getAttribute('dd-dish-id') === dishId; })[0];
  }

  function populateOrderSummary() {
    var itemIds = getOrderItemIds();
    var tableSelect = document.querySelector('[dd-table-select]');
    var tableRaw = tableSelect ? tableSelect.value : '';
    var tableMatch = tableRaw ? tableRaw.match(/\d+/) : null;
    var tableDisplay = tableMatch ? tableMatch[0] : tableRaw;

    var tokenEl = document.querySelector('[dd-element="order-token"]');
    if (tokenEl) tokenEl.textContent = generateOrderToken(itemIds, tableRaw);

    var tableEl = document.querySelector('[dd-element="order-table"]');
    if (tableEl) tableEl.textContent = tableDisplay;

    var countEl = document.querySelector('[dd-element="order-items-count"]');
    if (countEl) countEl.textContent = '(' + itemIds.length + ' item' + (itemIds.length === 1 ? '' : 's') + ')';

    // Clone dd-order-item-template once per item; hide the template itself.
    var listWrapper = document.querySelector('[dd-component="order-items-list"]');
    var template = document.querySelector('[dd-order-item-template]');
    var total = 0;

    if (listWrapper && template) {
      listWrapper.querySelectorAll('[dd-order-item-clone]').forEach(function (el) { el.remove(); });
      template.style.display = 'none';

      itemIds.forEach(function (id) {
        var dish = findDishById(id);
        if (!dish) return;
        var clone = template.cloneNode(true);
        clone.removeAttribute('dd-order-item-template');
        clone.setAttribute('dd-order-item-clone', '');
        clone.style.display = '';

        var nameEl = clone.querySelector('[dd-order-field="name"]');
        var priceEl = clone.querySelector('[dd-order-field="price"]');
        var imageEl = clone.querySelector('[dd-order-field="image"]');

        var sourceName = dish.querySelector('[dd-dish-field="name"]');
        var sourcePrice = dish.getAttribute('dd-dish-price');
        var sourceImage = getDishDisplayImage(dish);

        if (nameEl) nameEl.textContent = sourceName ? sourceName.textContent.trim() : '';
        if (priceEl) setPriceText(priceEl, sourcePrice ? parseFloat(sourcePrice).toFixed(2) : '');
        if (imageEl && sourceImage && sourceImage.src) {
          imageEl.removeAttribute('srcset');
          imageEl.removeAttribute('sizes');
          imageEl.src = sourceImage.src;
        }

        total += sourcePrice ? parseFloat(sourcePrice) : 0;
        listWrapper.appendChild(clone);
      });
    }

    var totalEl = document.querySelector('[dd-element="order-total-price"]');
    if (totalEl) setPriceText(totalEl, total.toFixed(2));
  }

  function openOrderSummary() {
    openModal('dish-detail');
    var detailPanel = document.querySelector('.dish_detail-panel');
    var tableForm = document.querySelector('.dish_table-form');
    var orderSummaryPanel = document.querySelector('.order-summary_panel');
    if (detailPanel) detailPanel.classList.remove('is-open');
    if (tableForm) tableForm.classList.remove('is-open');
    if (orderSummaryPanel) orderSummaryPanel.classList.add('is-open');
    // Reset QR view state every time the summary opens fresh, so reopening
    // never starts mid-QR-view from a previous order flow.
    resetOrderQrState();
    populateOrderSummary();
    // Logged here — the moment the order summary exists with its token —
    // not when the QR is shown. Staff need the token searchable right away;
    // the QR is a separate concern (it'll link to the order-view page).
    submitOrderToSheet(buildOrderPayload());
  }

  // Builds the full JSON payload the QR code encodes, from the same data
  // already powering the visible order summary.
  function buildOrderPayload() {
    var itemIds = getOrderItemIds();
    var tableSelect = document.querySelector('[dd-table-select]');
    var tableRaw = tableSelect ? tableSelect.value : '';
    var tableMatch = tableRaw ? tableRaw.match(/\d+/) : null;
    var tableDisplay = tableMatch ? tableMatch[0] : tableRaw;
    var token = generateOrderToken(itemIds, tableRaw);

    // Optional — only present once a [dd-order-instructions] textarea is
    // added to the table-select step. Safe no-op until then.
    var instructionsEl = document.querySelector('[dd-order-instructions]');
    var instructions = instructionsEl ? instructionsEl.value.trim() : '';

    var items = [];
    var total = 0;
    itemIds.forEach(function (id) {
      var dish = findDishById(id);
      if (!dish) return;
      var nameEl = dish.querySelector('[dd-dish-field="name"]');
      var price = parseFloat(dish.getAttribute('dd-dish-price')) || 0;
      items.push({ name: nameEl ? nameEl.textContent.trim() : '', price: price });
      total += price;
    });

    return { token: token, table: tableDisplay, items: items, total: total.toFixed(2), instructions: instructions, currency: getCurrencySymbol() };
  }

  // ==========================================================================
  // ORDER LOGGING: fire-and-forget POST to a Google Apps Script Web App,
  // which appends one row per order to a Google Sheet. No backend service,
  // no monthly task/record cap — just Google's own generous free quotas.
  // ==========================================================================
  var ORDER_LOG_URL = 'https://script.google.com/macros/s/AKfycbx6NYX4vA49izNpixwlpzjNqb09SJU7e7a_XEYORQTXjsZY7ntV7MUKDqX2-ytlX5jGvQ/exec';

  // UTF-8-safe base64url — plain btoa() chokes on any non-Latin1 character
  // (accented names, curly quotes typed into instructions, etc). This
  // handles that, and produces URL-safe output (no +, /, or = padding)
  // so it drops cleanly into a URL hash with zero extra encoding.
  function toBase64Url(str) {
    var b64 = btoa(unescape(encodeURIComponent(str)));
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  // Persisted (not just in-memory) so refreshing the QR page doesn't create
  // a duplicate row for the same order token.
  function hasLoggedOrder(token) {
    try {
      var logged = JSON.parse(sessionStorage.getItem('hoa_logged_orders') || '[]');
      return logged.indexOf(token) !== -1;
    } catch (e) {
      return false;
    }
  }
  function markOrderLogged(token) {
    try {
      var logged = JSON.parse(sessionStorage.getItem('hoa_logged_orders') || '[]');
      if (logged.indexOf(token) === -1) {
        logged.push(token);
        sessionStorage.setItem('hoa_logged_orders', JSON.stringify(logged));
      }
    } catch (e) {
      // sessionStorage unavailable (e.g. private browsing edge case) — the
      // order still gets logged this one time, just without duplicate
      // protection across a refresh. Not worth blocking on.
    }
  }

  function submitOrderToSheet(payload) {
    if (!payload || !payload.token || hasLoggedOrder(payload.token)) return;
    markOrderLogged(payload.token);
    // text/plain + no-cors avoids a CORS preflight entirely, since Apps
    // Script Web Apps don't handle OPTIONS requests. We can't read the
    // response this way, but the write still happens — check the Sheet
    // itself to confirm rows are landing, not the browser console.
    fetch(ORDER_LOG_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(payload)
    }).catch(function () {
      // Silently ignore network failures — logging the order should never
      // block or interrupt the actual ordering flow for the person using it.
    });
  }

  // Reused across repeat opens via .update() instead of rebuilding, so it
  // stays fast if items/table change and the person reopens the QR view.
  // Keyed per-container since a duplicate breakpoint element means more
  // than one canvas can exist in the DOM at once.
  var qrCodeInstances = [];

  // Captured immediately here, at script load, and NEVER re-queried later —
  // because the <img dd-qr-logo> lives INSIDE the same [dd-element="qr-canvas"]
  // container that renderOrderQRCode() clears via innerHTML = '' on first
  // render. Reading it lazily (only when a QR is first shown) created a
  // race: read-and-cache had to win before the first wipe ever happened.
  // Reading it here, at the top of the script before any interaction is
  // even possible, makes that race impossible rather than merely unlikely.
  var qrLogoDataUrlPromise = (function () {
    var logoImg = document.querySelector('[dd-qr-logo]');
    var logoSrc = logoImg ? logoImg.src : null;
    if (!logoSrc) return Promise.resolve(undefined);
    return fetch(logoSrc)
      .then(function (res) { return res.blob(); })
      .then(function (blob) {
        return new Promise(function (resolve) {
          var reader = new FileReader();
          reader.onloadend = function () { resolve(reader.result); };
          reader.readAsDataURL(blob);
        });
      })
      .catch(function () {
        // Fall back to the raw URL if fetch/convert fails for any reason —
        // QRCodeStyling will still attempt to load it directly, just
        // subject to the original CORS risk this was meant to avoid.
        return logoSrc;
      });
  })();
  function getQrLogoDataUrl() {
    return qrLogoDataUrlPromise;
  }

  function renderOrderQRCode() {
    // querySelectorAll — a duplicate qr-canvas element for another
    // breakpoint would otherwise sit blank while only the first match
    // (possibly the hidden one) gets rendered into.
    var containers = document.querySelectorAll('[dd-element="qr-canvas"]');
    if (!containers.length || typeof QRCodeStyling === 'undefined') return;

    var payload = buildOrderPayload();
    // Compact keys + array-style items (not the same shape as the Sheet's
    // raw JSON, which keeps full field names for human readability there).
    // This directly reduces encoded length, which directly reduces QR
    // module count — the actual cause of the QR looking too fine-grained
    // for its own styling to read visually.
    var compact = {
      t: payload.token,
      tb: payload.table,
      i: (payload.items || []).map(function (item) { return [item.name, item.price]; }),
      to: payload.total,
      ins: payload.instructions,
      c: payload.currency
    };
    // The QR now encodes a URL, not raw JSON — scanning it opens the actual
    // order-view page, with the order data traveling in the hash fragment
    // (never sent to any server, decoded entirely client-side on that page).
    var qrData = window.location.origin + '/order-view#o=' + toBase64Url(JSON.stringify(compact));

    getQrLogoDataUrl().then(function (logoSrc) {
      containers.forEach(function (container, i) {
        if (!qrCodeInstances[i]) {
          qrCodeInstances[i] = new QRCodeStyling({
            width: 240,
            height: 240,
            type: 'svg',
            margin: 4,
            data: qrData,
            image: logoSrc,
            dotsOptions: { type: 'classy-rounded', color: '#1a1a1a' },
            cornersSquareOptions: { type: 'extra-rounded', color: '#1a1a1a' },
            cornersDotOptions: { type: 'extra-rounded', color: '#1a1a1a' },
            backgroundOptions: { color: '#ffffff' },
            // High error correction is what allows the center logo to sit on
            // top of the code while it stays reliably scannable. No
            // crossOrigin needed here — logoSrc is a data URL by this point.
            imageOptions: { margin: 8, imageSize: 0.35, hideBackgroundDots: true },
            // M (not H) — H's extra redundancy was the single biggest
            // contributor to module density. At M, the same data needs
            // meaningfully fewer, larger modules, which is what actually
            // lets "classy-rounded" styling read as rounded rather than
            // looking identical to plain squares.
            qrOptions: { errorCorrectionLevel: 'M' }
          });
          container.innerHTML = '';
          qrCodeInstances[i].append(container);
        } else {
          qrCodeInstances[i].update({ data: qrData, image: logoSrc });
        }
      });
    });
  }

  function showOrderQRCode() {
    // querySelectorAll — see note above; keeps every instance in sync.
    var tokenWraps = document.querySelectorAll('.order-items-token-wrap');
    var qrCodeEls = document.querySelectorAll('.order-summary_qr-code');
    tokenWraps.forEach(function (el) { el.classList.add('is-close'); });
    qrCodeEls.forEach(function (el) { el.classList.add('is-qr-code'); });
    renderOrderQRCode();
  }

  // ==========================================================================
  // HIGHLIGHTS: auto-advancing story slider (WhatsApp-style)
  // ==========================================================================
  var highlightSlides = Array.prototype.slice.call(document.querySelectorAll('.highlight_media[role="listitem"]'));
  var highlightIndicators = [];
  var currentHighlightIndex = 0;
  var activeIndicatorAnim = null;
  var highlightPaused = false;
  var IMAGE_DURATION_MS = 7000;
  var VIDEO_CAP_MS = 30000;

  // Maps each highlight's Slug (dd-highlight-id) to its slide index,
  // so other UI (like search avatars) can jump to the exact matching slide.
  var highlightIdToIndex = {};
  highlightSlides.forEach(function (slide, i) {
    var id = slide.getAttribute('dd-highlight-id');
    if (id) highlightIdToIndex[id] = i;
  });

  function pauseAllHighlightVideos() {
    document.querySelectorAll('.highlight_media video').forEach(function (v) {
      v.pause();
    });
  }

  // Bars are rebuilt from scratch each load to always match the real slide
  // count coming from the CMS Collection List.
  function buildHighlightBars() {
    var stepsWrapper = document.querySelector('.highlight_steps');
    if (!stepsWrapper || highlightSlides.length === 0) return;
    stepsWrapper.innerHTML = '';
    highlightIndicators = [];
    highlightSlides.forEach(function (slide, i) {
      var bar = document.createElement('div');
      bar.className = 'highlight_steps-bar';
      bar.setAttribute('dd-step-index', i);

      var indicator = document.createElement('div');
      indicator.className = 'highlight_steps-indicator';
      indicator.style.width = '100%';
      indicator.style.height = '100%';
      indicator.style.transformOrigin = 'left center';
      indicator.style.transform = 'scaleX(0)';

      bar.appendChild(indicator);
      stepsWrapper.appendChild(bar);
      highlightIndicators.push(indicator);
    });
  }
  buildHighlightBars();

  function ensureHighlightVideo(slide) {
    var slot = slide.querySelector('[dd-video-slot]');
    if (!slot) return null;
    var video = slot.querySelector('video');
    if (!video) {
      var url = slide.getAttribute('dd-video-url') || slot.getAttribute('dd-video-url');
      if (!url) return null;
      video = document.createElement('video');
      video.src = url;
      video.muted = true;
      video.playsInline = true;
      video.preload = 'auto';
      video.setAttribute('muted', ''); // belt-and-suspenders for autoplay policies
      video.setAttribute('playsinline', '');
      // Fill and crop the slot exactly like a background/story video should
      video.style.width = '100%';
      video.style.height = '100%';
      video.style.objectFit = 'cover';
      video.style.objectPosition = 'center';
      video.style.display = 'block';
      slot.style.overflow = 'hidden';
      slot.appendChild(video);
    }
    return video;
  }

  function clearActiveIndicatorAnimation() {
    if (activeIndicatorAnim) {
      activeIndicatorAnim.cancel();
      activeIndicatorAnim = null;
    }
  }

  // Uses the Web Animations API (not CSS transitions) so it can be paused
  // and resumed natively via hold-to-pause, and so we can drive advancing
  // to the next slide from its onfinish callback.
  function startIndicatorAnimation(index, durationMs) {
    clearActiveIndicatorAnimation();
    var indicator = highlightIndicators[index];
    if (!indicator || typeof indicator.animate !== 'function') return;
    activeIndicatorAnim = indicator.animate(
      [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }],
      { duration: durationMs, easing: 'linear', fill: 'forwards' }
    );
    activeIndicatorAnim.onfinish = function () {
      advanceHighlight();
    };
    if (highlightPaused) activeIndicatorAnim.pause();
  }

  // Images get a flat 7s. Videos sync to their real duration, capped at 30s
  // (if a video is longer than 30s, the bar still finishes and advances at
  // the cap, cutting the clip short).
  function playSlide(index) {
    var slide = highlightSlides[index];
    if (!slide) return;
    var mediaType = (slide.getAttribute('dd-media-type') || '').toLowerCase();

    if (mediaType === 'video') {
      var video = ensureHighlightVideo(slide);
      if (!video) {
        startIndicatorAnimation(index, IMAGE_DURATION_MS);
        return;
      }
      video.currentTime = 0;
      var begin = function () {
        var durationMs = (isFinite(video.duration) && video.duration > 0)
          ? Math.min(video.duration * 1000, VIDEO_CAP_MS)
          : VIDEO_CAP_MS;
        startIndicatorAnimation(index, durationMs);
        if (!highlightPaused) video.play().catch(function () {});
      };
      if (video.readyState >= 1) {
        begin();
      } else {
        video.addEventListener('loadedmetadata', begin, { once: true });
      }
    } else {
      startIndicatorAnimation(index, IMAGE_DURATION_MS);
    }
  }

  function advanceHighlight() {
    var nextIndex = currentHighlightIndex + 1;
    if (nextIndex > highlightSlides.length - 1) nextIndex = 0; // loop back to slide 1
    showHighlightSlide(nextIndex);
  }

  function showHighlightSlide(index) {
    if (highlightSlides.length === 0) return;
    if (index < 0) index = highlightSlides.length - 1; // loop backward
    if (index > highlightSlides.length - 1) index = 0; // loop forward
    currentHighlightIndex = index;

    highlightSlides.forEach(function (slide, i) {
      var img = slide.querySelector('.highlight_img');
      var videoSlot = slide.querySelector('[dd-video-slot]');
      var mediaType = (slide.getAttribute('dd-media-type') || '').toLowerCase();

      if (i === index) {
        slide.style.display = '';
        slide.style.opacity = '0';
        slide.style.transition = 'opacity 0.25s ease';
        requestAnimationFrame(function () {
          slide.style.opacity = '1';
        });

        if (mediaType === 'video') {
          if (img) img.style.display = 'none';
          if (videoSlot) videoSlot.style.display = '';
        } else {
          if (videoSlot) videoSlot.style.display = 'none';
          if (img) img.style.display = '';
        }
      } else {
        slide.style.display = 'none';
        var vid = slide.querySelector('video');
        if (vid) vid.pause();
      }
    });

    highlightIndicators.forEach(function (indicator, i) {
      if (!indicator) return;
      if (i === index) return; // handled by startIndicatorAnimation
      indicator.getAnimations().forEach(function (a) { a.cancel(); });
      indicator.style.transform = i < index ? 'scaleX(1)' : 'scaleX(0)';
    });

    playSlide(index);
  }

  function pauseHighlight() {
    if (highlightPaused) return;
    highlightPaused = true;
    if (activeIndicatorAnim) activeIndicatorAnim.pause();
    var activeSlide = highlightSlides[currentHighlightIndex];
    var activeVideo = activeSlide ? activeSlide.querySelector('video') : null;
    if (activeVideo) activeVideo.pause();
  }

  function resumeHighlight() {
    if (!highlightPaused) return;
    highlightPaused = false;
    if (activeIndicatorAnim) activeIndicatorAnim.play();
    var activeSlide = highlightSlides[currentHighlightIndex];
    var activeVideo = activeSlide ? activeSlide.querySelector('video') : null;
    if (activeVideo) activeVideo.play().catch(function () {});
  }

  // Hold-to-pause: desktop hover, mobile touch/press
  document.addEventListener('mouseenter', function (e) {
    if (e.target.closest && e.target.closest('.highlight_media')) pauseHighlight();
  }, true);
  document.addEventListener('mouseleave', function (e) {
    if (e.target.closest && e.target.closest('.highlight_media')) resumeHighlight();
  }, true);
  document.addEventListener('touchstart', function (e) {
    if (e.target.closest('.highlight_media')) pauseHighlight();
  }, { passive: true });
  document.addEventListener('touchend', function (e) {
    resumeHighlight();
  }, { passive: true });
  document.addEventListener('touchcancel', function () {
    resumeHighlight();
  }, { passive: true });

  // Arrows never disable — clicking past the last slide loops to the first,
  // and vice versa (handled inside showHighlightSlide's wraparound logic).
  document.addEventListener('click', function (e) {
    var prevBtn = e.target.closest('[hightlight-button="previous"]');
    if (prevBtn) {
      e.preventDefault();
      showHighlightSlide(currentHighlightIndex - 1);
      return;
    }
    var nextBtn = e.target.closest('[hightlight-button="next"]');
    if (nextBtn) {
      e.preventDefault();
      showHighlightSlide(currentHighlightIndex + 1);
    }
  });

  // Search's "Menu Highlights" avatars: open the highlight modal at the exact matching slide
  document.addEventListener('click', function (e) {
    var avatar = e.target.closest('[dd-action="open-highlight"]');
    if (!avatar) return;
    e.preventDefault();
    var id = avatar.getAttribute('dd-highlight-id');
    var index = highlightIdToIndex.hasOwnProperty(id) ? highlightIdToIndex[id] : 0;
    currentHighlightIndex = index;
    openModal('highlight'); // auto-closes search since it's already the open modal
  });

  // ==========================================================================
  // FAVORITES SYSTEM (sessionStorage-backed)
  // ==========================================================================
  var toastTimeout = null;

  function showToast() {
    var toast = document.querySelector('.toast_notification');
    if (!toast) return;

    toast.classList.add('is-added');

    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(function () {
      toast.classList.remove('is-added');
    }, 2500);
  }

  var FAVORITES_KEY = 'hoa_favorites';

  function loadFavorites() {
    try {
      return JSON.parse(sessionStorage.getItem(FAVORITES_KEY)) || [];
    } catch (e) {
      return [];
    }
  }

  function saveFavorites(list) {
    sessionStorage.setItem(FAVORITES_KEY, JSON.stringify(list));
  }

  // Generic lookup: works for ANY element carrying dd-dish-id + dd-dish-price,
  // regardless of which CMS collection it came from (dishes, highlights, etc).
  function getDishPrice(dishId) {
    var card = document.querySelector('[dd-dish-id="' + dishId + '"][dd-dish-price]');
    if (!card) return 0;
    var price = parseFloat(card.getAttribute('dd-dish-price'));
    return isNaN(price) ? 0 : price;
  }

  function updateDetailModalState() {
    var modal = document.querySelector('[dd-modal="dish-detail"]');
    if (!modal) return;
    var currentDishId = modal.getAttribute('dd-dish-id');
    var favorites = loadFavorites();
    var isFav = !!currentDishId && favorites.indexOf(currentDishId) !== -1;

    var favBtn = modal.querySelector('[dd-action="toggle-favorite-detail"]');
    if (favBtn) {
      favBtn.classList.toggle('is-active', isFav);
    }

    var favLabel = modal.querySelector('[dd-detail-field="favorite-label"]');
    if (favLabel) {
      favLabel.textContent = isFav ? 'Remove from Favorite' : 'Add to Favorite';
    }

    var total = favorites.reduce(function (sum, id) {
      return sum + getDishPrice(id);
    }, 0);
    modal.querySelectorAll('[dd-element="detail-total-price"]').forEach(function (el) {
      setPriceText(el, total.toFixed(2));
    });

    // Only show the "(€X.XX)" total once at least one dish is favorited
    modal.querySelectorAll('[dd-element="detail-total-wrapper"]').forEach(function (el) {
      el.style.display = favorites.length > 0 ? '' : 'none';
    });

    // "Ready to Order" in the detail modal stays disabled until something is favorited
    var readyDetailToggleBtn = modal.querySelector('[dd-action="ready-to-order-detail"]');
    if (readyDetailToggleBtn) {
      readyDetailToggleBtn.classList.toggle('is-disabled', favorites.length === 0);
    }
  }

  function toggleFavorite(dishId) {
    var favorites = loadFavorites();
    var index = favorites.indexOf(dishId);
    if (index === -1) {
      favorites.push(dishId);
      showToast();
    } else {
      favorites.splice(index, 1);
    }
    saveFavorites(favorites);
    syncFavoriteIcons();
    updateFavoriteIndicator();
    renderFavoritesList();
    updateFavoritesSummary();
    updateDiningMode();
    updateDetailModalState();
  }

  function syncFavoriteIcons() {
    var favorites = loadFavorites();
    document.querySelectorAll('[dd-dish-id]').forEach(function (card) {
      var dishId = card.getAttribute('dd-dish-id');
      var icon = card.querySelector('.favorite_icon');
      if (icon) {
        icon.classList.toggle('is-active', favorites.indexOf(dishId) !== -1);
      }
    });
  }

  function updateFavoriteIndicator() {
    var count = loadFavorites().length;
    var indicator = document.querySelector('[dd-trigger="favorites"] .indicator');
    if (indicator) {
      indicator.classList.toggle('is-active', count > 0);
      indicator.style.display = count > 0 ? '' : 'none';
    }
  }

  function updateFavoritesSummary() {
    var favoritesModal = document.querySelector('[dd-modal="favorites"]');
    if (!favoritesModal) return;

    var favorites = loadFavorites();
    var count, ids;

    if (selectModeActive) {
      count = selectedFavorites.length;
      ids = selectedFavorites;
    } else {
      count = favorites.length;
      ids = favorites;
    }

    var total = ids.reduce(function (sum, id) {
      return sum + getDishPrice(id);
    }, 0);

    favoritesModal.querySelectorAll('[dish-favorites="item-count"]').forEach(function (el) {
      el.textContent = '(' + count + ' item' + (count === 1 ? '' : 's') + ')';
    });

    favoritesModal.querySelectorAll('[dd-element="total-price"]').forEach(function (el) {
      setPriceText(el, total.toFixed(2));
    });
  }

  function updateDiningMode() {
    var favorites = loadFavorites();
    var count = favorites.length;
    var diningMode = document.querySelector('.dining_mode');
    if (!diningMode) return;

    diningMode.classList.toggle('is-open', count > 0);

    var total = favorites.reduce(function (sum, dishId) {
      return sum + getDishPrice(dishId);
    }, 0);

    var countEl = diningMode.querySelector('[dd-element="item-count"]');
    var priceEl = diningMode.querySelector('[dd-element="total-price"]');
    if (countEl) countEl.textContent = count + ' item' + (count === 1 ? '' : 's');
    if (priceEl) setPriceText(priceEl, total.toFixed(2));
  }

  function updateClearFavoriteVisibility() {
    var favoriteBottom = document.querySelector('.favorite_bottom');
    if (!favoriteBottom) return;
    var count = loadFavorites().length;
    favoriteBottom.classList.toggle('is-favorite', count > 0);
  }

  function renderFavoritesList() {
    var favorites = loadFavorites();
    // querySelectorAll (not querySelector) — Webflow can duplicate this
    // structure per breakpoint, and a singular match only fixes the first
    // instance, leaving a second untouched copy showing raw CMS items
    // behind the empty state. Same footgun as closeModal(); same fix.
    var favoriteListWrappers = document.querySelectorAll('[dd-component="favorite-list"]');
    var emptyFavoritesEls = document.querySelectorAll('[dd-element="empty-favorites"]');
    var favoritesModals = document.querySelectorAll('[dd-modal="favorites"]');
    if (!favoriteListWrappers.length) return;

    var visibleCount = 0;
    favoriteListWrappers.forEach(function (favoriteListWrapper) {
      var cards = favoriteListWrapper.querySelectorAll('[dd-dish-id]');
      cards.forEach(function (card) {
        var dishId = card.getAttribute('dd-dish-id');
        var isFav = favorites.indexOf(dishId) !== -1;
        card.style.display = isFav ? '' : 'none';
        if (isFav) visibleCount++;
      });
    });

    var isEmpty = visibleCount === 0;

    // Hide the wrapper itself too, not just its child cards — a wrapper with
    // min-height/padding in the Designer can leave visible empty space (or
    // worse, bleed through) even when every card inside it is display:none.
    favoriteListWrappers.forEach(function (favoriteListWrapper) {
      favoriteListWrapper.style.display = isEmpty ? 'none' : '';
    });

    emptyFavoritesEls.forEach(function (emptyFavorites) {
      emptyFavorites.style.display = isEmpty ? 'flex' : 'none';
    });

    favoritesModals.forEach(function (favoritesModal) {
      var header = favoritesModal.querySelector('.menu_bottom-header');
      var overlay = favoritesModal.querySelector('.favorite_overlay');
      [header, overlay].forEach(function (el) {
        if (!el) return;
        el.style.opacity = isEmpty ? '0' : '';
        el.style.pointerEvents = isEmpty ? 'none' : '';
      });
    });

    updateClearFavoriteVisibility();
  }

  document.addEventListener('click', function (e) {
    var icon = e.target.closest('.favorite_icon');
    if (!icon) return;
    e.preventDefault();
    var card = icon.closest('[dd-dish-id]');
    if (!card) return;
    var dishId = card.getAttribute('dd-dish-id');
    toggleFavorite(dishId);
  });

  // ==========================================================================
  // FAVORITES: select mode (choose a subset to order, rather than everything)
  // ==========================================================================
  var selectModeActive = false;
  var selectedFavorites = [];

  function toggleSelectMode() {
    selectModeActive = !selectModeActive;
    var favoritesModal = document.querySelector('[dd-modal="favorites"]');
    if (!favoritesModal) return;

    favoritesModal.querySelectorAll('.favorite_tick').forEach(function (tick) {
      tick.style.opacity = selectModeActive ? '1' : '0';
      tick.style.pointerEvents = selectModeActive ? 'auto' : 'none';
    });

    var selectBtn = favoritesModal.querySelector('[dd-action="toggle-select"]');
    var cancelBtn = favoritesModal.querySelector('[dd-action="toggle-cancel"]');
    var clearFavoriteBtn = favoritesModal.querySelector('[dd-action="clear-favorite"]');

    if (selectBtn) selectBtn.style.display = selectModeActive ? 'none' : '';
    if (cancelBtn) cancelBtn.classList.toggle('is-open', selectModeActive);
    if (clearFavoriteBtn) clearFavoriteBtn.classList.toggle('is-select', selectModeActive);

    if (!selectModeActive) {
      selectedFavorites = [];
      favoritesModal.querySelectorAll('.favorite_tick.is-selected').forEach(function (tick) {
        tick.classList.remove('is-selected');
      });
    }
    updateReadyToOrderState();
    updateFavoritesSummary();
  }

  function updateReadyToOrderState() {
    var readyBtn = document.querySelector('[dd-action="ready-to-order-favorites"]');
    if (readyBtn) {
      readyBtn.classList.toggle('is-disabled', selectModeActive && selectedFavorites.length === 0);
    }
  }

  document.addEventListener('click', function (e) {
    var selectBtn = e.target.closest('[dd-action="toggle-select"]');
    if (selectBtn) {
      e.preventDefault();
      toggleSelectMode();
      return;
    }

    var cancelBtn = e.target.closest('[dd-action="toggle-cancel"]');
    if (cancelBtn) {
      e.preventDefault();
      toggleSelectMode();
      return;
    }

    var tick = e.target.closest('.favorite_tick');
    if (tick && selectModeActive) {
      e.preventDefault();
      var card = tick.closest('[dd-dish-id]');
      if (!card) return;
      var dishId = card.getAttribute('dd-dish-id');
      tick.classList.toggle('is-selected');
      var index = selectedFavorites.indexOf(dishId);
      if (tick.classList.contains('is-selected')) {
        if (index === -1) selectedFavorites.push(dishId);
      } else {
        if (index !== -1) selectedFavorites.splice(index, 1);
      }
      updateReadyToOrderState();
      updateFavoritesSummary();
      return;
    }

    var clearFavoriteBtn = e.target.closest('[dd-action="clear-favorite"]');
    if (clearFavoriteBtn) {
      e.preventDefault();
      if (selectModeActive) {
        if (selectedFavorites.length === 0) return;
        var remaining = loadFavorites().filter(function (id) {
          return selectedFavorites.indexOf(id) === -1;
        });
        saveFavorites(remaining);
        selectedFavorites = [];
      } else {
        saveFavorites([]);
      }
      syncFavoriteIcons();
      updateFavoriteIndicator();
      renderFavoritesList();
      updateFavoritesSummary();
      updateDiningMode();
      updateDetailModalState();
      if (selectModeActive) toggleSelectMode();
      return;
    }

    var discoverBtn = e.target.closest('[dd-action="discover-dishes"]');
    if (discoverBtn) {
      e.preventDefault();
      closeModal('favorites');
      resetToAllCategories();
      filterCategoryPills();
      filterDishes();
      return;
    }

    var closeDetailBtn = e.target.closest('[dd-action="close-dish-detail"]');
    if (closeDetailBtn) {
      e.preventDefault();
      closeModal('dish-detail');
      return;
    }

    var favDetailBtn = e.target.closest('[dd-action="toggle-favorite-detail"]');
    if (favDetailBtn) {
      e.preventDefault();
      var modal = document.querySelector('[dd-modal="dish-detail"]');
      var dishId2 = modal ? modal.getAttribute('dd-dish-id') : null;
      if (dishId2) toggleFavorite(dishId2);
      return;
    }

    var readyFavBtn = e.target.closest('[dd-action="ready-to-order-favorites"]');
    if (readyFavBtn) {
      e.preventDefault();
      if (readyFavBtn.classList.contains('is-disabled')) return;
      openTableForm();
      return;
    }

    var readyDetailBtn = e.target.closest('[dd-action="ready-to-order-detail"]');
    if (readyDetailBtn) {
      e.preventDefault();
      if (readyDetailBtn.classList.contains('is-disabled')) return;
      openTableForm();
      return;
    }

    var readyDiningBtn = e.target.closest('[dd-action="ready-to-order-dining"]');
    if (readyDiningBtn) {
      e.preventDefault();
      openTableForm();
      return;
    }

    // IMPORTANT: these two specific checks must run BEFORE the generic
    // .is-order-summary check below. That class is meant to mark only the
    // single "Ready to Order" trigger button, but it's also present (likely
    // a Designer markup duplication) on the .dish_actions wrapper that
    // contains both buttons below — so closest('.is-order-summary') was
    // matching on every click here and returning early, before these two
    // handlers ever ran. Checking dd-action first avoids the collision
    // entirely regardless of what the wrapper's class list contains.
    var editSelectionBtn = e.target.closest('[dd-action="edit-selection"]');
    if (editSelectionBtn) {
      e.preventDefault();
      closeModal('dish-detail');
      openModal('favorites');
      return;
    }

    var showQrBtn = e.target.closest('[dd-action="show-qr-code"]');
    if (showQrBtn) {
      e.preventDefault();
      toggleOrderQRView();
      return;
    }

    var orderSummaryBtn = e.target.closest('.is-order-summary');
    if (orderSummaryBtn) {
      e.preventDefault();
      if (orderSummaryBtn.classList.contains('is-disabled')) return;
      openOrderSummary();
      return;
    }

    // Order summary panel's dedicated close icon — the only thing that may
    // close this panel (see OUTSIDE-CLICK-CLOSE exclusion below).
    var orderCancelBtn = e.target.closest('[dd-order-trigger="cancel"]');
    if (orderCancelBtn) {
      e.preventDefault();
      closeModal('dish-detail');
    }
  });

  // ==========================================================================
  // DISH DETAIL MODAL
  // ==========================================================================
  function setDetailField(field, value) {
    document.querySelectorAll('[dd-modal="dish-detail"] [dd-detail-field="' + field + '"]').forEach(function (el) {
      el.textContent = value;
    });
  }

  // Two [dd-dish-field="image"] elements exist per card (CMS-bound + static
  // fallback); returns whichever one is actually visible via Conditional
  // Visibility, falling back to the first if neither resolved yet.
  function getDishDisplayImage(dishEl) {
    var candidates = dishEl.querySelectorAll('[dd-dish-field="image"]');
    var chosen = null;
    candidates.forEach(function (candidate) {
      if (!chosen && isVisible(candidate)) chosen = candidate;
    });
    if (!chosen && candidates.length > 0) chosen = candidates[0];
    return chosen;
  }

  function populatePairSlot(slot, dishEl) {
    if (!slot || !dishEl) return;
    var nameEl = slot.querySelector('[dd-pair-field="name"]');
    var priceEl = slot.querySelector('[dd-pair-field="price"]');
    var imageEl = slot.querySelector('[dd-pair-field="image"]');

    var sourceName = dishEl.querySelector('[dd-dish-field="name"]');
    var sourcePrice = dishEl.getAttribute('dd-dish-price');
    var sourceImage = getDishDisplayImage(dishEl);
    var sourceDishId = dishEl.getAttribute('dd-dish-id');

    if (nameEl) nameEl.textContent = sourceName ? sourceName.textContent.trim() : '';
    if (priceEl) setPriceText(priceEl, sourcePrice ? parseFloat(sourcePrice).toFixed(2) : '');
    if (imageEl && sourceImage && sourceImage.src) {
      imageEl.removeAttribute('srcset');
      imageEl.removeAttribute('sizes');
      imageEl.src = sourceImage.src;
    }

    slot.setAttribute('dd-dish-id', sourceDishId);
    slot.setAttribute('dd-dish-price', sourcePrice || '0');

    var icon = slot.querySelector('.favorite_icon');
    if (icon) {
      var favorites = loadFavorites();
      icon.classList.toggle('is-active', favorites.indexOf(sourceDishId) !== -1);
    }
  }

  // Reads paired dish slugs directly from dd-pair-1-slug / dd-pair-2-slug
  // attributes — no nested Collection List required, which avoids
  // Webflow's 10-nested-Collection-List-per-page cap entirely.
  function getPairedSlugsFromAttrs(sourceCard) {
    var slugs = [];
    var p1 = sourceCard.getAttribute('dd-pair-1-slug');
    var p2 = sourceCard.getAttribute('dd-pair-2-slug');
    if (p1 && p1.trim() !== '') slugs.push(p1.trim().toLowerCase());
    if (p2 && p2.trim() !== '') slugs.push(p2.trim().toLowerCase());
    return slugs;
  }

  function populatePairsSection(sourceCard) {
    var pairsSection = document.querySelector('[dd-element="pairs-section"]');
    var slot1 = document.querySelector('[dd-pair-slot="1"]');
    var slot2 = document.querySelector('[dd-pair-slot="2"]');
    if (!pairsSection) return;

    var currentDishId = sourceCard.getAttribute('dd-dish-id');
    var pairedSlugs = getPairedSlugsFromAttrs(sourceCard);

    var matches = [];
    var seenIds = {};
    pairedSlugs.forEach(function (slug) {
      if (slug === currentDishId) return;
      if (seenIds[slug]) return;
      var match = allDishes.filter(function (d) {
        return d.getAttribute('dd-dish-id') === slug;
      })[0];
      if (match) {
        seenIds[slug] = true;
        matches.push(match);
      }
    });

    // Hide only when there are zero matches — show with either 1 or 2 results
    if (matches.length === 0) {
      pairsSection.style.display = 'none';
      return;
    }

    pairsSection.style.display = 'flex';

    populatePairSlot(slot1, matches[0]);
    if (slot1) slot1.style.display = '';

    if (matches.length > 1) {
      populatePairSlot(slot2, matches[1]);
      if (slot2) slot2.style.display = '';
    } else if (slot2) {
      slot2.style.display = 'none';
    }
  }

  function openDishDetail(sourceCard) {
    var modal = document.querySelector('[dd-modal="dish-detail"]');
    if (!sourceCard || !modal) return;

    var dishId = sourceCard.getAttribute('dd-dish-id');
    var nameEl = sourceCard.querySelector('[dd-dish-field="name"]');
    var descEl = sourceCard.querySelector('[dd-dish-field="description"]');
    var portionEl = sourceCard.querySelector('[dd-dish-field="portion"]');
    var calories = sourceCard.getAttribute('dd-dish-calories');
    var price = sourceCard.getAttribute('dd-dish-price');
    var ingredients = sourceCard.getAttribute('dd-dish-ingredients');
    var contains = sourceCard.getAttribute('dd-dish-contains');

    var imageEl = getDishDisplayImage(sourceCard);

    setDetailField('name', nameEl ? nameEl.textContent.trim() : '');
    setDetailField('description', descEl ? descEl.textContent.trim() : '');
    setDetailField('portion', portionEl ? portionEl.textContent.trim() : '');
    setDetailField('calories', calories ? calories + ' kcal' : '');
    document.querySelectorAll('[dd-modal="dish-detail"] [dd-detail-field="price"]').forEach(function (el) {
      setPriceText(el, price ? parseFloat(price).toFixed(2) : '');
    });
    setDetailField('ingredients', ingredients && ingredients.trim() !== '' ? ingredients : '—');
    setDetailField('contains', contains && contains.trim() !== '' ? contains : '—');

    var detailImage = modal.querySelector('[dd-detail-field="image"]');
    if (detailImage) {
      if (imageEl && imageEl.src) {
        detailImage.removeAttribute('srcset');
        detailImage.removeAttribute('sizes');
        detailImage.src = imageEl.src;
      } else {
        setFallbackImage(detailImage);
      }
    }

    modal.setAttribute('dd-dish-id', dishId);

    // Returning to a specific dish always resets back to the detail view,
    // in case the table-select form (or order summary) was left open from a
    // previous order flow.
    var tableForm = document.querySelector('.dish_table-form');
    var orderSummaryPanel = document.querySelector('.order-summary_panel');
    var detailPanel = document.querySelector('.dish_detail-panel');
    if (tableForm) tableForm.classList.remove('is-open');
    if (orderSummaryPanel) orderSummaryPanel.classList.remove('is-open');
    if (detailPanel) detailPanel.classList.add('is-open');

    syncFavoriteIcons();
    populatePairsSection(sourceCard);
    updateDetailModalState();

    openModal('dish-detail');
  }

  document.addEventListener('click', function (e) {
    if (e.target.closest('.favorite_icon') || e.target.closest('.favorite_tick') || e.target.closest('[dd-action]')) return;
    if (e.target.closest('[dd-modal="dish-detail"]')) return;
    if (e.target.closest('[dd-modal="highlight"]')) return; // highlight slides must never open the dish detail modal
    var card = e.target.closest('[dd-dish-id]');
    if (!card) return;
    openDishDetail(card);
  });

  document.addEventListener('click', function (e) {
    if (e.target.closest('.favorite_icon')) return;
    var pairSlot = e.target.closest('[dd-pair-slot]');
    if (!pairSlot) return;
    e.preventDefault();
    var targetId = pairSlot.getAttribute('dd-dish-id');
    if (!targetId) return;
    var targetCard = document.querySelector('[dd-item="dish"][dd-dish-id="' + targetId + '"]');
    if (targetCard) openDishDetail(targetCard);
  });

  // ==========================================================================
  // OUTSIDE-CLICK-CLOSE
  // Closes the currently open modal on any click that lands outside its
  // recognized content — with explicit exclusions for every entry point
  // that legitimately lives outside [dd-modal-content] but must not
  // self-close the modal it just opened in the same click event.
  // ==========================================================================
  document.addEventListener('click', function (e) {
    if (!currentOpenModal) return;
    if (e.target.closest('[dd-trigger]')) return;
    if (e.target.closest('[dd-item="dish"]')) return;
    if (e.target.closest('[dd-pair-slot]')) return;
    if (e.target.closest('[dd-action="open-highlight"]')) return;
    if (e.target.closest('[dd-action^="ready-to-order-"]')) return; // these live outside modal-content and open the modal in the same click
    if (e.target.closest('.dish_table-form')) return; // table-select form is legitimate modal content, not "outside"
    // Order summary panel: outside clicks (backdrop, header, anywhere) must
    // NEVER close it — only the explicit [dd-order-trigger="cancel"] icon may.
    if (document.querySelector('.order-summary_panel.is-open')) return;
    if (e.target.closest('[dd-modal-content]')) return;
    closeModal(currentOpenModal);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && currentOpenModal) {
      // Same rule as outside-click-close: order summary only closes via its icon.
      if (document.querySelector('.order-summary_panel.is-open')) return;
      closeModal(currentOpenModal);
    }
  });

  document.addEventListener('keydown', function (e) {
    var isSearchShortcut = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k';
    if (isSearchShortcut) {
      e.preventDefault();
      openModal('search');
    }
  });

  // ==========================================================================
  // SEARCH
  // ==========================================================================
  function filterSearchResults(query) {
    var resultsList = document.querySelector('[dd-component="search-results"]');
    var resultsWrapper = document.querySelector('[dd-element="search-results-wrapper"]');
    var defaultView = document.querySelector('[dd-element="search-default"]');
    var emptyView = document.querySelector('[dd-element="empty-search"]');
    var searchCountEl = document.querySelector('[dish-preference="search-count"]');
    if (!resultsList) return;

    var trimmedQuery = query.trim().toLowerCase();

    document.querySelectorAll('[dd-element="search-query"]').forEach(function (el) {
      el.textContent = '"' + query.trim() + '"';
    });

    if (trimmedQuery === '') {
      if (resultsWrapper) resultsWrapper.style.display = 'none';
      if (emptyView) emptyView.style.display = 'none';
      if (defaultView) defaultView.style.display = '';
      if (searchCountEl) searchCountEl.style.display = 'none';
      return;
    }

    if (defaultView) defaultView.style.display = 'none';

    var cards = resultsList.querySelectorAll('[dd-dish-id]');
    var matchCount = 0;

    cards.forEach(function (card) {
      var nameEl = card.querySelector('[dd-dish-field="name"]');
      var nameText = nameEl ? nameEl.textContent.toLowerCase() : '';
      var isMatch = nameText.indexOf(trimmedQuery) !== -1;
      card.style.display = isMatch ? '' : 'none';
      if (isMatch) matchCount++;
    });

    // Search count text starts hidden by default and only shows with a live
    // match count once there's an actual query.
    if (searchCountEl) {
      searchCountEl.style.display = '';
      searchCountEl.textContent = '(' + matchCount + ' item' + (matchCount === 1 ? '' : 's') + ' found)';
    }

    if (matchCount === 0) {
      if (resultsWrapper) resultsWrapper.style.display = 'none';
      if (emptyView) emptyView.style.display = 'flex';
    } else {
      if (resultsWrapper) resultsWrapper.style.display = 'flex';
      if (emptyView) emptyView.style.display = 'none';
    }
  }

  var searchInput = document.querySelector('[dd-search-input]');
  var clearSearchIcon = document.querySelector('[dd-action="clear-search"]');

  function updateClearIconVisibility(value) {
    if (!clearSearchIcon) return;
    clearSearchIcon.style.display = value.length > 0 ? '' : 'none';
  }

  if (searchInput) {
    searchInput.addEventListener('input', function () {
      filterSearchResults(searchInput.value);
      updateClearIconVisibility(searchInput.value);
    });
  }

  document.addEventListener('click', function (e) {
    var clearBtn = e.target.closest('[dd-action="clear-search"]');
    if (clearBtn) {
      e.preventDefault();
      if (searchInput) {
        searchInput.value = '';
        filterSearchResults('');
        updateClearIconVisibility('');
        searchInput.focus();
      }
      return;
    }

    var retryBtn = e.target.closest('[dd-action="retry-search"]');
    if (retryBtn) {
      e.preventDefault();
      if (searchInput) {
        searchInput.value = '';
        filterSearchResults('');
        updateClearIconVisibility('');
        searchInput.focus();
      }
    }
  });

  // ==========================================================================
  // MISC: text truncation + broken-image fallback
  // ==========================================================================
  function applyTruncation() {
    document.querySelectorAll('[dd-truncate-lines]').forEach(function (el) {
      var lines = parseInt(el.getAttribute('dd-truncate-lines'), 10);
      if (!lines || lines < 1) return;
      el.style.display = '-webkit-box';
      el.style.webkitBoxOrient = 'vertical';
      el.style.webkitLineClamp = lines;
      el.style.overflow = 'hidden';
    });
  }

  function applyDefaultDishImages() {
    document.querySelectorAll('[dd-dish-field="image"]').forEach(function (img) {
      img.addEventListener('error', function () {
        var sibling = getSiblingImageField(img);
        img.style.display = 'none';
        if (sibling) sibling.style.display = '';
      });
    });
  }

  // ==========================================================================
  // INITIALIZATION
  // ==========================================================================
  var foodRadio = document.querySelector('[dd-menu-toggle="Food"]');
  if (foodRadio) {
    foodRadio.checked = true;
    setActiveMenuLabel(foodRadio);
  }
  resetToAllCategories();
  filterCategoryPills();
  filterDishes();
  updatePreferenceState();
  syncFavoriteIcons();
  updateFavoriteIndicator();
  renderFavoritesList();
  updateFavoritesSummary();
  updateDiningMode();
  updateClearFavoriteVisibility();
  updateReadyToOrderState();
  applyTruncation();
  applyDefaultDishImages();
  applyCurrencyToStaticPrices();
  updateClearIconVisibility(searchInput ? searchInput.value : '');

  // Search count text starts hidden until a query exists
  var initialSearchCountEl = document.querySelector('[dish-preference="search-count"]');
  if (initialSearchCountEl) initialSearchCountEl.style.display = 'none';

});

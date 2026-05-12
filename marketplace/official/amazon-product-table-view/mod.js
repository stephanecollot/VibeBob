export function apply(ctx) {
  const slot = document.querySelector('.s-main-slot');
  if (!slot) return;

  function scrapeProducts() {
    const cards = slot.querySelectorAll('[data-component-type="s-search-result"]');
    const products = [];
    cards.forEach(card => {
      const titleEl = card.querySelector('h2');
      const title = titleEl?.textContent?.trim();
      const link = card.querySelector('h2 a')?.href;
      const img = card.querySelector('img.s-image')?.src;
      const asin = card.getAttribute('data-asin');
      if (!title || !asin) return;

      const price = card.querySelector('.a-price .a-offscreen')?.textContent?.trim() || '—';

      let pricePerUnit = '—';
      let pricePerUnitValue = null;
      let pricePerUnitUnit = null;
      const unitSpans = Array.from(card.querySelectorAll('span.a-size-base.a-color-base')).filter(s => {
        const t = s.textContent.trim();
        return t.startsWith('(') && t.includes('/');
      });
      if (unitSpans.length) {
        const unitSpan = unitSpans[0];
        const cleanPrice = unitSpan.querySelector('.a-offscreen')?.textContent?.trim() || '';
        const fullText = unitSpan.textContent.trim();
        const unitMatch = fullText.match(/\/([^)]+)\)/);
        const unit = unitMatch ? unitMatch[1].trim() : '';
        if (cleanPrice && unit) {
          pricePerUnit = `${cleanPrice}/${unit}`;
          const numMatch = cleanPrice.replace(/[^\d.]/g, '');
          pricePerUnitValue = numMatch ? parseFloat(numMatch) : null;
          pricePerUnitUnit = unit.toLowerCase();
        } else if (cleanPrice) {
          pricePerUnit = cleanPrice;
        }
      }

      const ratingEl = card.querySelector('[aria-label*="stars"]');
      const ratingRaw = ratingEl?.getAttribute('aria-label');
      const rating = ratingRaw?.match(/^[\d.]+/)?.[0] || null;

      const reviewCountEl = Array.from(card.querySelectorAll('[aria-label]')).find(
        el => /^[\d,]+ ratings?$/.test(el.getAttribute('aria-label') || '')
      );
      const reviewCount = reviewCountEl?.getAttribute('aria-label')?.replace(/\s*ratings?$/, '') || '—';

      const isPrime = !!card.querySelector('[aria-label*="Prime"]');

      const deliveryEl = card.querySelector('.s-align-children-center .a-color-base');
      const delivery = deliveryEl?.textContent?.trim()?.split('\n')[0]?.trim() || '—';

      const isSponsored = !!card.querySelector('.puis-sponsored-label-text, [aria-label*="Sponsored"]');

      const discountEls = Array.from(card.querySelectorAll('.a-color-price'));
      const savings = discountEls
        .map(el => el.textContent.trim())
        .filter(t => t && t !== price && !/^[£$€]?\d+[,.]?\d*$/.test(t))
        .join(' ') || '—';

      const coupon = card.querySelector('.s-coupon-highlight-color, .a-badge-text')?.textContent?.trim() || '';

      products.push({
        title, link, img, price,
        pricePerUnit, pricePerUnitValue, pricePerUnitUnit,
        rating, reviewCount, isPrime, delivery, isSponsored, savings, coupon,
      });
    });
    return products;
  }

  function buildTable(products) {
    const unitCounts = {};
    products.forEach(p => {
      if (p.pricePerUnitUnit) {
        unitCounts[p.pricePerUnitUnit] = (unitCounts[p.pricePerUnitUnit] || 0) + 1;
      }
    });
    const dominantUnit = Object.keys(unitCounts).sort((a, b) => unitCounts[b] - unitCounts[a])[0] || null;

    // IQR-based outlier removal for per-unit bar scaling
    let unitMin = 0, unitMax = 1;
    if (dominantUnit) {
      const allVals = products
        .filter(p => p.pricePerUnitUnit === dominantUnit && p.pricePerUnitValue != null)
        .map(p => p.pricePerUnitValue)
        .sort((a, b) => a - b);

      let filteredVals = allVals;
      if (allVals.length >= 4) {
        const q1 = allVals[Math.floor(allVals.length * 0.25)];
        const q3 = allVals[Math.floor(allVals.length * 0.75)];
        const iqr = q3 - q1;
        const lower = q1 - 1.5 * iqr;
        const upper = q3 + 1.5 * iqr;
        filteredVals = allVals.filter(v => v >= lower && v <= upper);
      }

      unitMin = filteredVals.length ? Math.min(...filteredVals) : 0;
      unitMax = filteredVals.length ? Math.max(...filteredVals) : 1;
    }
    const unitRange = unitMax - unitMin;

    const rows = products.map((p, i) => {
      const ratingBarHtml = p.rating
        ? `<div class="${ctx.scope}-rating-bar-wrap" title="${p.rating}/5">
             <div class="${ctx.scope}-rating-bar-fill" style="width:${(parseFloat(p.rating) / 5 * 100).toFixed(1)}%"></div>
           </div>
           <span class="${ctx.scope}-rating-num">${p.rating}</span>`
        : `<span class="${ctx.scope}-rating-num">—</span>`;

      let unitBarHtml = '';
      if (dominantUnit && p.pricePerUnitUnit === dominantUnit && p.pricePerUnitValue != null) {
        const pct = unitRange > 0
          ? Math.min(100, Math.max(0, ((p.pricePerUnitValue - unitMin) / unitRange * 100))).toFixed(1)
          : 50;
        unitBarHtml = `<div class="${ctx.scope}-unit-bar-wrap" title="${p.pricePerUnit}">
             <div class="${ctx.scope}-unit-bar-fill" style="width:${pct}%"></div>
           </div>`;
      }

      const imgHtml = p.img
        ? `<img src="${p.img}" alt="" style="display:block;height:40px;width:auto;max-height:none;max-width:none;object-fit:contain;">`
        : '';

      return `
        <tr class="${ctx.scope}-row">
          <td class="${ctx.scope}-num">${i + 1}</td>
          <td class="${ctx.scope}-img-cell">${imgHtml}</td>
          <td class="${ctx.scope}-title-cell">
            <a href="${p.link || '#'}" target="_blank" class="${ctx.scope}-link">${p.title}</a>
          </td>
          <td class="${ctx.scope}-price-cell">${p.price}</td>
          <td class="${ctx.scope}-unit-price-cell">
            ${unitBarHtml}
            <span class="${ctx.scope}-unit-price-label">${p.pricePerUnit}</span>
          </td>
          <td class="${ctx.scope}-savings-cell">${p.savings}</td>
          <td class="${ctx.scope}-rating-cell">${ratingBarHtml}</td>
          <td class="${ctx.scope}-reviews-cell">${p.reviewCount}</td>
          <td class="${ctx.scope}-delivery-cell">${p.delivery}</td>
          <td class="${ctx.scope}-prime-col">${p.isPrime ? '✓' : ''}</td>
          <td class="${ctx.scope}-ad-col">${p.isSponsored ? '✓' : ''}</td>
        </tr>`;
    }).join('');

    return `
      <div class="${ctx.scope}-header">
        <span class="${ctx.scope}-count">${products.length} products</span>
      </div>
      <div class="${ctx.scope}-scroll">
        <table class="${ctx.scope}-table">
          <thead>
            <tr>
              <th>#</th>
              <th></th>
              <th>Product</th>
              <th>Price</th>
              <th>Per unit</th>
              <th>Savings</th>
              <th>Rating</th>
              <th>Reviews</th>
              <th>Delivery</th>
              <th>Prime</th>
              <th>Ad</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  const styleEl = document.createElement('style');
  styleEl.textContent = `
    .${ctx.scope}-wrapper {
      width: 100%;
      font-family: "Amazon Ember", Arial, sans-serif;
      font-size: 12px;
      padding: 0 0 40px;
      box-sizing: border-box;
    }
    .${ctx.scope}-header {
      display: flex;
      align-items: center;
      padding: 8px 4px 10px;
      border-bottom: 2px solid #e3e6e6;
    }
    .${ctx.scope}-count {
      font-size: 12px;
      font-weight: 600;
      color: #565959;
    }
    .${ctx.scope}-scroll {
      width: 100%;
      overflow-x: auto;
    }
    .${ctx.scope}-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: auto;
      white-space: nowrap;
    }
    .${ctx.scope}-table thead tr {
      background: #f0f2f2;
      border-bottom: 2px solid #d5d9d9;
    }
    .${ctx.scope}-table thead th {
      position: sticky;
      top: 0;
      background: #f0f2f2;
      z-index: 10;
      padding: 7px 8px;
      text-align: left;
      font-weight: 700;
      color: #0f1111;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      white-space: nowrap;
    }
    .${ctx.scope}-row {
      border-bottom: 1px solid #e3e6e6;
      transition: background 0.1s;
    }
    .${ctx.scope}-row:hover {
      background: #fafafa;
    }
    .${ctx.scope}-row td {
      padding: 6px 8px;
      vertical-align: middle;
    }
    .${ctx.scope}-num {
      color: #888;
      font-size: 11px;
      min-width: 22px;
      text-align: right;
    }
    .${ctx.scope}-img-cell {
      width: 50px;
      text-align: center;
      padding: 4px !important;
    }
    .${ctx.scope}-title-cell {
      min-width: 220px;
      max-width: 380px;
      white-space: normal;
    }
    .${ctx.scope}-link {
      color: #0f1111;
      text-decoration: none;
      line-height: 1.3;
      display: block;
      font-size: 12px;
      font-weight: 500;
      white-space: normal;
    }
    .${ctx.scope}-link:hover {
      color: #c7511f;
      text-decoration: underline;
    }
    .${ctx.scope}-price-cell {
      font-weight: 700;
      color: #b12704;
      white-space: nowrap;
      font-size: 13px;
    }
    .${ctx.scope}-unit-price-cell {
      white-space: nowrap;
      min-width: 110px;
    }
    .${ctx.scope}-unit-bar-wrap {
      display: inline-block;
      vertical-align: middle;
      width: 60px;
      height: 7px;
      background: #e0e0e0;
      border-radius: 3px;
      overflow: hidden;
      margin-right: 5px;
    }
    .${ctx.scope}-unit-bar-fill {
      height: 100%;
      background: #c0392b;
      border-radius: 3px;
    }
    .${ctx.scope}-unit-price-label {
      display: inline-block;
      vertical-align: middle;
      font-size: 11px;
      color: #555;
    }
    .${ctx.scope}-savings-cell {
      font-size: 11px;
      color: #cc0c39;
      white-space: nowrap;
    }
    .${ctx.scope}-rating-cell {
      white-space: nowrap;
      min-width: 80px;
    }
    .${ctx.scope}-rating-bar-wrap {
      display: inline-block;
      vertical-align: middle;
      width: 60px;
      height: 7px;
      background: #e0e0e0;
      border-radius: 3px;
      overflow: hidden;
      margin-right: 5px;
    }
    .${ctx.scope}-rating-bar-fill {
      height: 100%;
      background: #3a9c3f;
      border-radius: 3px;
    }
    .${ctx.scope}-rating-num {
      display: inline-block;
      vertical-align: middle;
      color: #555;
      font-size: 11px;
    }
    .${ctx.scope}-reviews-cell {
      font-size: 11px;
      color: #007185;
      white-space: nowrap;
    }
    .${ctx.scope}-delivery-cell {
      font-size: 11px;
      color: #007600;
      white-space: nowrap;
    }
    .${ctx.scope}-prime-col,
    .${ctx.scope}-ad-col {
      text-align: center;
      font-size: 12px;
      color: #007600;
    }
  `;
  document.head.appendChild(styleEl);

  const products = scrapeProducts();

  const wrapper = document.createElement('div');
  wrapper.className = `${ctx.scope}-wrapper`;
  wrapper.innerHTML = buildTable(products);

  slot.style.display = 'none';
  slot.parentNode.insertBefore(wrapper, slot);

  ctx.onCleanup(() => {
    slot.style.display = '';
    wrapper.remove();
    styleEl.remove();
  });
}

export function cleanup() {}

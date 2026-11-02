/* index.html: FEATURED PROJECT rendering, scroll-linked caption, Lightbox.
 * overview.js bundles the JL grid and the Lightbox in one page-specific IIFE, so it is
 * not loaded here. The Lightbox section below is copied from overview.js unchanged in
 * behaviour; only the page hooks differ (sequence source, what lock() inerts).
 */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const modal = $('modal'), stage = $('stage'), page = $('page');
  const list = $('fp-projects'), railCaption = $('fp-caption');

  // featured-data.js references portfolio-data.js projects by id; resolve them here.
  const projectsById = new Map(window.PORTFOLIO_PROJECTS.map(p => [p.id, p]));
  const featured = window.FEATURED_PROJECTS.map(entry => {
    const project = projectsById.get(entry.id);
    if (!project) { console.warn(`featured-data.js: unknown project id "${entry.id}"`); return null; }
    const order = entry.media || project.media.map((_, i) => i);
    const media = order.map(i => project.media[i]).filter(Boolean);
    // 'side-by-side' applies to two-image projects only; anything else keeps the default.
    const sideBySide = entry.layout === 'side-by-side' && media.length === 2;
    if (entry.layout && !sideBySide) console.warn(`featured-data.js: layout "${entry.layout}" ignored for "${entry.id}" (needs 'side-by-side' with exactly 2 images)`);
    return {project, media, sideBySide};
  }).filter(Boolean);
  // Lightbox sequence: every featured image, top to bottom, in display order.
  const sequence = featured.flatMap(({project, media}) => media.map(m => ({project, media: m})));

  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  let current = -1, active = null, returnFocus, scrollY = 0;
  let wheelSum = 0, wheelLast = 0, wheelCooldown = 0, gesture = null;
  const videos = new Set(), visibleVideos = new Set();

  // ---- FEATURED PROJECT ----
  function featuredCaption(target, project) {
    target.replaceChildren();
    [['fp-kicker', 'FEATURED PROJECT'], ['fp-title', project.title], ['fp-credit', project.line1]].forEach(([cls, text]) => {
      if (!text) return;
      const line = document.createElement('span'); line.className = cls; line.textContent = text; target.append(line);
    });
  }
  const observer = new IntersectionObserver(entries => {
    entries.forEach(e => e.isIntersecting ? visibleVideos.add(e.target) : visibleVideos.delete(e.target));
    syncVideos();
  });
  let seqIndex = 0;
  const projectEls = featured.map(({project, media, sideBySide}, pi) => {
    const article = document.createElement('article');
    article.className = sideBySide ? 'fp-project fp-project--side' : 'fp-project'; article.dataset.index = pi;
    const stack = document.createElement('div'); stack.className = 'fp-stack';
    const row = document.createElement('div'); row.className = 'fp-row';
    media.forEach((m, i) => {
      const index = seqIndex++;
      const button = document.createElement('button');
      // Default: first image is the large main one, the rest form the row below.
      // Side-by-side: both images share the row.
      const inRow = sideBySide || i > 0;
      button.type = 'button'; button.className = inRow ? 'fp-item' : 'fp-item fp-main';
      button.setAttribute('aria-label', `${project.title}, image ${i + 1}: open media`);
      // Row images share one height: grow in proportion to their aspect ratio.
      if (inRow) button.style.flex = `${m.dataW / m.dataH} 1 0`;
      const node = document.createElement(m.type === 'video' ? 'video' : 'img');
      if (m.type === 'video') {
        node.muted = true; node.loop = true; node.playsInline = true; node.preload = 'metadata';
        node.src = m.src; videos.add(node); observer.observe(node);
      } else {
        node.src = m.full; node.alt = m.alt || project.title;
        node.width = m.dataW; node.height = m.dataH; node.decoding = 'async';
        if (pi > 0) node.loading = 'lazy';
      }
      node.draggable = false; button.append(node);
      button.addEventListener('click', e => openModal(index, e.detail === 0));
      (inRow ? row : stack).append(button);
    });
    if (row.children.length) stack.append(row);
    article.append(stack);
    list.append(article);
    return article;
  });

  // Scroll-linked rail caption (all widths). The caption belongs to the last project
  // whose top (its main image) has passed the vertical centre of the viewport, so it
  // switches when the next main image reaches the centre and switches back when it
  // leaves it, whatever the scroll direction. Deciding from the layout (not from which
  // block happens to be at the centre) also keeps it right after a reload or a jump that
  // lands between projects. The observer only signals "a block crossed the centre".
  // Same project -> no update. Never moves the scroll.
  let activeProject = -1;
  function setActiveProject(i) {
    if (i === activeProject || !featured[i]) return;
    activeProject = i;
    featuredCaption(railCaption, featured[i].project);
  }
  // The observer watches a thin band at 50-51% of the viewport height; the decision line
  // is the band's lower edge, so a block that has just entered the band counts as passed.
  const CENTRE_BAND_BOTTOM = 0.51;
  function projectAtCentre() {
    const line = innerHeight * CENTRE_BAND_BOTTOM;
    let index = 0;
    projectEls.forEach((el, i) => { if (el.getBoundingClientRect().top <= line) index = i; });
    return index;
  }
  setActiveProject(0);
  const centreObserver = new IntersectionObserver(() => setActiveProject(projectAtCentre()),
    {rootMargin: `-50% 0px -${Math.round((1 - CENTRE_BAND_BOTTOM) * 100)}% 0px`});
  projectEls.forEach(el => centreObserver.observe(el));

  // ---- Lightbox (from overview.js) ----
  // Two-node slide transition state: `liveNode` is the settled, currently-visible media
  // element (the one drag/keyboard/wheel act on); `transitioning` locks out new navigation
  // input for the duration of a committed slide so inputs never overlap animations.
  let liveNode = null, transitioning = false, activeAnimations = [];
  const SLIDE_MS = 280, SLIDE_EASING = 'ease-out';
  // Neighbor preloading: warms the cache for the media one step ahead/behind.
  const preloadedSrcs = new Set();
  function preloadMedia(index) {
    const m = sequence[index]?.media;
    if (!m || m.type === 'video' || preloadedSrcs.has(m.full)) return;
    preloadedSrcs.add(m.full);
    const img = new Image();
    img.src = m.full;
    img.decode?.().catch(() => {});
  }
  function preloadNeighbors(index) {
    const n = sequence.length;
    preloadMedia((index + 1) % n);
    preloadMedia((index - 1 + n) % n);
  }
  function caption(target, index) {
    target.replaceChildren();
    if (index < 0) return;
    const p = sequence[index].project;
    [p.title, p.line1, p.line2].filter(Boolean).forEach(text => {
      const line = document.createElement('span'); line.textContent = text; target.append(line);
    });
  }
  function syncVideos() {
    videos.forEach(v => {
      if (!active && !document.hidden && visibleVideos.has(v)) v.play().catch(() => {});
      else v.pause();
    });
    if (document.hidden) stage.querySelector('video')?.pause();
  }
  // The site header stays visible above the Lightbox (index.css z-index), so only the
  // page content is inerted here.
  function lock(panel) {
    returnFocus = document.activeElement; scrollY = window.scrollY; active = panel;
    Object.assign(document.body.style, {position:'fixed', top:-scrollY+'px', width:'100%'});
    page.inert = true;
    panel.hidden = false; syncVideos();
  }
  function releaseVideo(node) {
    if (node && node.tagName === 'VIDEO') { node.pause(); node.removeAttribute('src'); node.load(); }
  }
  function disposeAll() {
    activeAnimations.forEach(a => a.cancel()); activeAnimations = []; transitioning = false;
    [...stage.children].forEach(n => { releaseVideo(n); n.remove(); });
    liveNode = null;
  }
  function close() {
    if (!active) return;
    disposeAll(); active.hidden = true; active = null; current = -1; gesture = null;
    page.inert = false;
    Object.assign(document.body.style, {position:'', top:'', width:''});
    window.scrollTo(0,scrollY); returnFocus?.focus({preventScroll:true}); syncVideos();
  }
  function createNode(index) {
    const {project, media:m} = sequence[index];
    const node = document.createElement(m.type === 'video' ? 'video' : 'img');
    node.className = 'modal-media'; node.draggable = false;
    if (m.type === 'video') {
      node.playsInline = true; node.muted = true; node.controls = true; node.preload = 'auto';
      node.addEventListener('loadedmetadata', () => {
        if (node.isConnected) { node.currentTime = 0; node.play().catch(() => {}); }
      }, {once:true});
      node.src = m.src;
    } else { node.alt = m.alt || project.title; node.src = m.full; node.decoding = 'async'; }
    return node;
  }
  function settle(index) {
    disposeAll(); current = index;
    const node = createNode(index);
    stage.append(node); liveNode = node;
    caption($('modal-caption'), index);
    preloadNeighbors(index);
  }
  // Committed next/prev transition: outgoing and incoming slide together horizontally.
  // direction: +1 = Next (outgoing exits left), -1 = Previous (mirrored).
  function slide(nextIndex, direction) {
    if (transitioning) return false;
    const outgoing = liveNode;
    const incoming = createNode(nextIndex);
    stage.append(incoming);
    current = nextIndex; liveNode = incoming;
    caption($('modal-caption'), nextIndex);
    preloadNeighbors(nextIndex);
    if (reduced()) { if (outgoing) { releaseVideo(outgoing); outgoing.remove(); } return true; }
    transitioning = true;
    incoming.style.willChange = 'transform';
    if (outgoing) outgoing.style.willChange = 'transform';
    const fromOut = outgoing ? (outgoing.style.transform || 'translateX(0%)') : null;
    const inAnim = incoming.animate(
      [{transform:`translateX(${direction * 100}%)`}, {transform:'translateX(0%)'}],
      {duration:SLIDE_MS, easing:SLIDE_EASING, fill:'forwards'}
    );
    const outAnim = outgoing ? outgoing.animate(
      [{transform:fromOut}, {transform:`translateX(${-direction * 100}%)`}],
      {duration:SLIDE_MS, easing:SLIDE_EASING, fill:'forwards'}
    ) : null;
    activeAnimations = [inAnim, outAnim].filter(Boolean);
    Promise.all(activeAnimations.map(a => a.finished.catch(() => {}))).then(() => {
      if (outgoing) { releaseVideo(outgoing); outgoing.remove(); }
      incoming.style.willChange = ''; incoming.style.transform = '';
      activeAnimations.forEach(a => a.cancel()); activeAnimations = [];
      transitioning = false;
    });
    return true;
  }
  // Loops across all featured images (all projects back-to-back), wrapping at the ends.
  function step(direction) {
    if (transitioning || current < 0) return false;
    let next = current + direction;
    if (next >= sequence.length) next = 0; else if (next < 0) next = sequence.length - 1;
    return slide(next, direction);
  }
  // Safari reports :focus-visible on script focus after a mouse click; suppress explicitly.
  function focusInitial(el, viaKeyboard) {
    el.classList.toggle('no-ring', !viaKeyboard);
    el.focus({preventScroll:true});
  }
  function openModal(index, viaKeyboard = false) {
    lock(modal); wheelSum = 0; wheelLast = 0; wheelCooldown = 0;
    settle(index); focusInitial($('modal-close'), viaKeyboard);
  }
  $('modal-close').addEventListener('click', close);
  // Background-click close: a click on the letterboxed margin of the media box closes,
  // a click on actual image pixels does not (see overview.js for the full rationale).
  function inContentRect(el, x, y) {
    const rect = el.getBoundingClientRect();
    const naturalW = el.tagName === 'VIDEO' ? el.videoWidth : el.naturalWidth;
    const naturalH = el.tagName === 'VIDEO' ? el.videoHeight : el.naturalHeight;
    if (!naturalW || !naturalH) return true;
    const renderedW = Math.min(rect.width, rect.height * (naturalW / naturalH));
    const renderedH = renderedW * (naturalH / naturalW);
    const left = rect.left + (rect.width - renderedW) / 2, top = rect.top + (rect.height - renderedH) / 2;
    return x >= left && x <= left + renderedW && y >= top && y <= top + renderedH;
  }
  modal.addEventListener('click', e => {
    if (e.target === modal || e.target === stage) { close(); return; }
    if ((e.target.tagName === 'IMG' || e.target.tagName === 'VIDEO') && !inContentRect(e.target, e.clientX, e.clientY)) close();
  });
  document.addEventListener('visibilitychange', syncVideos);
  document.addEventListener('keydown', e => {
    if (!active) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (active === modal && (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      // All four keys drive the same horizontal slide - Up/Left = Previous, Down/Right = Next.
      e.preventDefault();
      if (!e.repeat) { const d = (e.key === 'ArrowDown' || e.key === 'ArrowRight') ? 1 : -1; step(d); }
    }
    if (e.key === 'Tab') {
      const focusable = [...active.querySelectorAll('button, a[href], video[controls]')];
      focusable.forEach(el => el.classList.remove('no-ring'));
      const first = focusable[0], last = focusable.at(-1);
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
  modal.addEventListener('wheel', e => {
    e.preventDefault(); const now = performance.now(), idle = now-wheelLast; wheelLast = now;
    // Require both a cooldown and an idle gap: one step per inertial wheel burst.
    if (now < wheelCooldown || (wheelCooldown && idle < 180)) return;
    if (idle > 180) { wheelSum = 0; wheelCooldown = 0; }
    const delta = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? innerHeight : 1);
    wheelSum += delta;
    if (Math.abs(wheelSum) >= 60) {
      const d = Math.sign(wheelSum); step(d); wheelSum = 0; wheelCooldown = now+450;
    }
  }, {passive:false});
  stage.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' || !e.isPrimary || transitioning) return;
    // Leave the native video control strip available for playback interaction.
    if (e.target.tagName === 'VIDEO' && e.clientY > stage.getBoundingClientRect().bottom - 48) return;
    gesture = {id:e.pointerId, x:e.clientX, y:e.clientY, dx:0};
    stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener('pointermove', e => {
    if (!gesture || gesture.id !== e.pointerId) return;
    gesture.dx = e.clientX - gesture.x;
    if (liveNode) liveNode.style.transform = `translateX(${gesture.dx}px)`;
  });
  function endGesture(e, cancelled = false) {
    if (!gesture || gesture.id !== e.pointerId) return;
    const {dx,y} = gesture; gesture = null;
    // Left swipe (dx<0) = Next (+1); right swipe (dx>0) = Previous (-1).
    const d = dx < 0 ? 1 : -1;
    if (!cancelled && Math.abs(dx) > Math.max(40,stage.clientWidth*.12) && Math.abs(dx) > Math.abs(e.clientY-y) && step(d)) return;
    if (liveNode) liveNode.style.transform = '';
  }
  stage.addEventListener('pointerup', e => endGesture(e));
  stage.addEventListener('pointercancel', e => endGesture(e,true));
})();

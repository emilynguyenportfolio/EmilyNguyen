/**
 * Visual Editor — access via ?edit in the URL
 *
 * Tools:
 *  Rects  — drag/resize/rotate sheer rects, + add anywhere, × delete
 *  Text   — click any text, drag handle up/down to resize
 *  Splits — drag dividers on every column split across the page
 */
(function () {
  'use strict';

  // ── State ─────────────────────────────────────────────────────────────
  const rectState = new WeakMap();
  let editMode  = false;
  let activeTool = 'rects'; // 'rects' | 'text'
  let toggleBtn = null;
  let panel     = null;

  const VAR_MAP = {
    'hero-veil': ['--hv-left','--hv-bottom','--hv-width','--hv-height','--hv-rotate'],
    'page-veil': ['--sv-left','--sv-bottom','--sv-width','--sv-height','--sv-rotate'],
  };
  let newRectCount = 0;

  // All known splits — vertical (columns) and horizontal (section heights)
  const SPLITTERS = [
    // ── vertical ──────────────────────────────────────────────────────
    { axis:'v', sectionSel:'.hero',             varName:'--hero-split',      side:'right', defaultPct:70.2, label:'hero block'     },
    { axis:'v', sectionSel:'.page-hero',        varName:'--page-hero-split', side:'right', defaultPct:58,   label:'page hero'      },
    { axis:'v', sectionSel:'.projects-section', varName:'--proj-split',      side:'left',  defaultPct:21.6, label:'projects split' },
    // ── horizontal (section heights) ──────────────────────────────────
    { axis:'h', sectionSel:'.hero',             varName:'--hero-h',      defaultVh:100, label:'hero height'      },
    { axis:'h', sectionSel:'.about-strip',      varName:'--about-h',     defaultVh:null,label:'about height'     },
    { axis:'h', sectionSel:'.projects-section', varName:'--projects-h',  defaultVh:100, label:'projects height'  },
    { axis:'h', sectionSel:'.page-hero',        varName:'--page-hero-h', defaultVh:50,  label:'page hero height' },
  ];
  const splitterHandles = []; // { el, varName }

  // Text tool
  let selectedText   = null;
  let textHandleEl   = null;

  // font-size drag
  let textSizeDragY0    = 0;
  let textSizeDragSize0 = 0;
  let textSizeDragActive = false;

  // position drag
  let textMoveEl      = null;
  let textMoveX0      = 0, textMoveY0 = 0;
  let textMoveLeft0   = 0, textMoveTop0 = 0;
  let textMoving      = false;
  let textMoveOffX    = 0, textMoveOffY = 0;

  // Place-rect mode
  let placeModeActive = false;
  let placeGhost      = null;

  // Logo handle
  let logoEl        = null;
  let logoTextEl    = null; // .hero-text container
  let logoHandleS   = null;
  let logoHandleM   = null; // move handle
  let logoH0, logoHY0;
  let logoMoveX0, logoMoveY0, logoMoveL0, logoMoveT0, logoMoving = false;

  // Photo handles
  let photoEl       = null;
  let photoHandleW  = null;
  let photoHandleV  = null;
  let photoHandleO  = null;
  let photoW0, photoWX0, photoMT0, photoVY0, photoOp0, photoOY0;

  const UNLOCKED = location.search.includes('edit');

  // ── Boot ─────────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', boot);

  function boot() {
    toggleBtn = makeToggleBtn();
    panel     = makePanel();
    if (!UNLOCKED) toggleBtn.style.display = 'none';
    document.body.append(toggleBtn, panel);
  }

  // ── Main toggle ───────────────────────────────────────────────────────
  function toggle() {
    editMode = !editMode;
    toggleBtn.dataset.active = editMode ? '1' : '0';
    toggleBtn.textContent    = editMode ? '✕ done' : '⊹ edit';
    panel.style.display      = editMode ? 'block' : 'none';

    if (editMode) {
      setTool('rects');
      enableSplitters();
      enablePhotoHandles();
      enableLogoHandle();
      updatePanel();
    } else {
      disableSplitters();
      disableTextMode();
      disablePhotoHandles();
      disableLogoHandle();
      exitPlaceMode();
      document.querySelectorAll('.sheer-rect, .kw-free-img').forEach(disableRect);
    }
  }

  // ── Tool switching ────────────────────────────────────────────────────
  function setTool(tool) {
    activeTool = tool;

    // Update button states
    document.getElementById('re-tool-rects') &&
      (document.getElementById('re-tool-rects').style.opacity = tool === 'rects' ? '1' : '0.45');
    document.getElementById('re-tool-text') &&
      (document.getElementById('re-tool-text').style.opacity  = tool === 'text'  ? '1' : '0.45');

    if (tool === 'rects') {
      disableTextMode();
      document.querySelectorAll('.sheer-rect, .kw-free-img').forEach(enableRect);
    } else if (tool === 'text') {
      document.querySelectorAll('.sheer-rect, .kw-free-img').forEach(disableRect);
      enableTextMode();
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  //  RECT TOOL
  // ══════════════════════════════════════════════════════════════════════

  function enableRect(el) {
    if (!el.offsetWidth && !el.offsetHeight) return; // skip hidden (display:none panel)
    captureRectState(el);
    el.style.pointerEvents = 'auto';
    el.style.cursor        = 'grab';
    el.style.outline       = '1px dashed rgba(140,129,149,0.55)';
    el.addEventListener('mousedown', onMoveStart);
    addRectHandles(el);
  }

  function disableRect(el) {
    el.style.pointerEvents = 'none';
    el.style.cursor        = '';
    el.style.outline       = '';
    el.removeEventListener('mousedown', onMoveStart);
    el.querySelectorAll('.re-h, .re-rot, .re-del').forEach(h => h.remove());
  }

  // ── Place a new rect anywhere ─────────────────────────────────────────
  function enterPlaceMode() {
    placeModeActive = true;
    document.body.style.cursor = 'crosshair';

    // Ghost preview
    placeGhost = document.createElement('div');
    css(placeGhost, {
      position:'fixed', pointerEvents:'none', zIndex:'10001',
      width:'160px', height:'120px',
      background:'rgba(242,241,238,0.45)',
      border:'1px dashed rgba(140,129,149,0.7)',
      transform:'translate(-50%,-50%)',
    });
    document.body.appendChild(placeGhost);

    document.addEventListener('mousemove', onPlaceMove);
    document.addEventListener('click',     onPlaceClick, { capture: true });
    document.addEventListener('keydown',   onPlaceCancel);
  }

  function exitPlaceMode() {
    placeModeActive = false;
    document.body.style.cursor = '';
    if (placeGhost) { placeGhost.remove(); placeGhost = null; }
    document.removeEventListener('mousemove', onPlaceMove);
    document.removeEventListener('click',     onPlaceClick, { capture: true });
    document.removeEventListener('keydown',   onPlaceCancel);
  }

  function onPlaceMove(e) {
    if (placeGhost) {
      placeGhost.style.left = e.clientX + 'px';
      placeGhost.style.top  = e.clientY + 'px';
    }
  }

  function onPlaceClick(e) {
    e.preventDefault(); e.stopPropagation();
    const container = findDropContainer(e.target);
    dropRect(container, e.clientX, e.clientY);
    exitPlaceMode();
  }

  function onPlaceCancel(e) { if (e.key === 'Escape') exitPlaceMode(); }

  function findDropContainer(el) {
    // Walk up to find a positioned (non-static) ancestor
    let cur = el;
    while (cur && cur !== document.documentElement) {
      if (cur.classList && (
        cur.classList.contains('re-h')   ||
        cur.classList.contains('re-rot') ||
        cur.classList.contains('re-del') ||
        cur.id === 'panel' || cur === panel || cur === toggleBtn
      )) return document.body;
      const pos = getComputedStyle(cur).position;
      if (['relative','absolute','fixed','sticky'].includes(pos)) return cur;
      cur = cur.parentElement;
    }
    return document.body;
  }

  function dropRect(container, clientX, clientY) {
    newRectCount++;
    const id  = `new-veil-${newRectCount}`;
    const pfx = `--nv${newRectCount}`;
    VAR_MAP[id] = [`${pfx}-left`,`${pfx}-bottom`,`${pfx}-width`,`${pfx}-height`,`${pfx}-rotate`];

    const cr       = container.getBoundingClientRect();
    const initLeft = clientX - cr.left - 80;
    const initTop  = clientY - cr.top  - 60;

    const el = document.createElement('div');
    el.className = `sheer-rect ${id}`;
    css(el, {
      position:       'absolute',
      background:     'var(--sheer, rgba(242,241,238,0.62))',
      backdropFilter: 'blur(2px)',
      border:         '1px solid rgba(200,193,186,0.28)',
      pointerEvents:  'none',
      left:   Math.max(0, initLeft) + 'px',
      top:    Math.max(0, initTop)  + 'px',
      width:  '160px',
      height: '120px',
      zIndex: '3',
    });

    if (getComputedStyle(container).position === 'static') {
      container.style.position = 'relative';
    }
    container.appendChild(el);
    enableRect(el);
    updatePanel();
  }

  // ── Capture / apply rect state ────────────────────────────────────────
  function captureRectState(el) {
    const par   = el.offsetParent || el.parentElement;
    const mat   = new DOMMatrix(getComputedStyle(el).transform);
    const angle = Math.atan2(mat.b, mat.a) * (180 / Math.PI);
    rectState.set(el, {
      left: el.offsetLeft, top: el.offsetTop,
      width: el.offsetWidth, height: el.offsetHeight,
      angle, pW: par.offsetWidth, pH: par.offsetHeight,
    });
  }

  function applyRectState(el) {
    const s = rectState.get(el);
    el.style.left      = s.left   + 'px';
    el.style.top       = s.top    + 'px';
    el.style.bottom    = '';
    el.style.width     = s.width  + 'px';
    el.style.height    = s.height + 'px';
    el.style.transform = `rotate(${s.angle.toFixed(2)}deg)`;
    updatePanel();
  }

  // ── Move ──────────────────────────────────────────────────────────────
  let moveEl=null, mx0, my0, ms0;

  function onMoveStart(e) {
    if (e.target.classList.contains('re-h')   ||
        e.target.classList.contains('re-rot')  ||
        e.target.classList.contains('re-del')) return;
    e.preventDefault();
    moveEl = e.currentTarget;
    mx0 = e.clientX; my0 = e.clientY;
    ms0 = { ...rectState.get(moveEl) };
    moveEl.style.cursor = 'grabbing';
    on(window, 'mousemove', onMoveMove);
    on(window, 'mouseup',   onMoveEnd);
  }
  function onMoveMove(e) {
    if (!moveEl) return;
    const s = { ...ms0 };
    s.left = ms0.left + (e.clientX - mx0);
    s.top  = ms0.top  + (e.clientY - my0);
    rectState.set(moveEl, s);
    applyRectState(moveEl);
  }
  function onMoveEnd() {
    if (moveEl) moveEl.style.cursor = 'grab';
    moveEl = null;
    off(window, 'mousemove', onMoveMove);
    off(window, 'mouseup',   onMoveEnd);
  }

  // ── Resize ────────────────────────────────────────────────────────────
  const DIRS = [
    {d:'n', t:'0',l:'50%'},{d:'ne',t:'0',l:'100%'},{d:'e',t:'50%',l:'100%'},
    {d:'se',t:'100%',l:'100%'},{d:'s',t:'100%',l:'50%'},{d:'sw',t:'100%',l:'0'},
    {d:'w',t:'50%',l:'0'},{d:'nw',t:'0',l:'0'},
  ];
  const CURSORS = {n:'ns-resize',s:'ns-resize',e:'ew-resize',w:'ew-resize',
    ne:'nesw-resize',sw:'nesw-resize',nw:'nwse-resize',se:'nwse-resize'};

  let resEl=null, resDir, rx0, ry0, rs0;

  function onResizeStart(e, el, dir) {
    e.stopPropagation(); e.preventDefault();
    resEl=el; resDir=dir; rx0=e.clientX; ry0=e.clientY;
    rs0 = { ...rectState.get(el) };
    on(window, 'mousemove', onResizeMove);
    on(window, 'mouseup',   onResizeEnd);
  }
  function onResizeMove(e) {
    if (!resEl) return;
    const dx=e.clientX-rx0, dy=e.clientY-ry0;
    const s={...rs0}, d=resDir;
    if (d.includes('e')) s.width  = Math.max(20, rs0.width  + dx);
    if (d.includes('s')) s.height = Math.max(20, rs0.height + dy);
    if (d.includes('w')) { s.width=Math.max(20,rs0.width-dx); s.left=rs0.left+dx; }
    if (d.includes('n')) { s.height=Math.max(20,rs0.height-dy); s.top=rs0.top+dy; }
    rectState.set(resEl, s);
    applyRectState(resEl);
  }
  function onResizeEnd() {
    resEl=null;
    off(window,'mousemove',onResizeMove);
    off(window,'mouseup',  onResizeEnd);
  }

  // ── Rotate ────────────────────────────────────────────────────────────
  let rotEl=null, rotCX, rotCY;

  function onRotateStart(e, el) {
    e.stopPropagation(); e.preventDefault();
    rotEl=el;
    const r=el.getBoundingClientRect();
    rotCX=r.left+r.width/2; rotCY=r.top+r.height/2;
    on(window,'mousemove',onRotateMove);
    on(window,'mouseup',  onRotateEnd);
  }
  function onRotateMove(e) {
    if (!rotEl) return;
    const angle=Math.atan2(e.clientY-rotCY,e.clientX-rotCX)*(180/Math.PI)+90;
    rectState.set(rotEl, {...rectState.get(rotEl), angle});
    applyRectState(rotEl);
  }
  function onRotateEnd() {
    rotEl=null;
    off(window,'mousemove',onRotateMove);
    off(window,'mouseup',  onRotateEnd);
  }

  // ── Rect handles ──────────────────────────────────────────────────────
  function addRectHandles(el) {
    DIRS.forEach(({d,t,l}) => {
      const h=document.createElement('div');
      h.className='re-h'; h.dataset.d=d;
      css(h,{position:'absolute',width:'9px',height:'9px',
        background:'rgba(248,246,243,0.95)',
        border:'1px solid rgba(140,129,149,0.8)',
        borderRadius:'2px',transform:'translate(-50%,-50%)',
        top:t,left:l,cursor:CURSORS[d],zIndex:'10'});
      h.addEventListener('mousedown', e=>onResizeStart(e,el,d));
      el.appendChild(h);
    });

    const rot=document.createElement('div');
    rot.className='re-rot';
    css(rot,{position:'absolute',width:'11px',height:'11px',
      background:'rgba(140,129,149,0.45)',
      border:'1px solid rgba(140,129,149,0.85)',
      borderRadius:'50%',top:'-30px',left:'50%',
      transform:'translateX(-50%)',cursor:'crosshair',zIndex:'10'});
    rot.addEventListener('mousedown',e=>onRotateStart(e,el));
    el.appendChild(rot);

    const del=document.createElement('div');
    del.className='re-del';
    css(del,{position:'absolute',width:'16px',height:'16px',
      background:'rgba(180,140,140,0.85)',
      border:'1px solid rgba(140,129,149,0.7)',
      borderRadius:'50%',top:'-30px',right:'0',left:'auto',
      cursor:'pointer',zIndex:'10',
      fontSize:'11px',color:'#fff',lineHeight:'14px',textAlign:'center'});
    del.textContent='×';
    del.addEventListener('mousedown', e=>{e.stopPropagation();e.preventDefault();});
    del.addEventListener('click', e=>{e.stopPropagation(); el.remove(); updatePanel();});
    el.appendChild(del);
  }

  // ══════════════════════════════════════════════════════════════════════
  //  TEXT TOOL
  // ══════════════════════════════════════════════════════════════════════

  function enableTextMode() {
    document.addEventListener('mouseover',  onTextHover);
    document.addEventListener('mousedown',  onTextPointerDown, { capture: true });
  }

  function disableTextMode() {
    document.removeEventListener('mouseover',  onTextHover);
    document.removeEventListener('mousedown',  onTextPointerDown, { capture: true });
    off(window, 'mousemove', onTextPointerMove);
    off(window, 'mouseup',   onTextPointerUp);
    if (selectedText) { selectedText.style.outline = ''; selectedText.style.cursor = ''; selectedText = null; }
    removeTextHandle();
  }

  function isTextTarget(el) {
    if (!el || el === document.body || el === document.documentElement) return false;
    if (el.closest('#re-panel, #re-text-handle, .re-splitter, .re-h, .re-rot, .re-del')) return false;
    if (el === toggleBtn || el === panel) return false;
    const SKIP = new Set(['sheer-rect','re-h','re-rot','re-del','fade-up','active']);
    const hasContentClass = [...el.classList].some(c => !SKIP.has(c));
    if (!hasContentClass && el.classList.length > 0) return false;
    return [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
  }

  function onTextHover(e) {
    if (!isTextTarget(e.target)) return;
    e.target.style.outline = '1px dashed rgba(140,129,149,0.4)';
    e.target.style.cursor  = 'grab';
    e.target.addEventListener('mouseleave', () => {
      if (e.target !== selectedText) { e.target.style.outline = ''; e.target.style.cursor = ''; }
    }, { once: true });
  }

  // ── Unified pointer handler: drag = move, click = resize handle ──────
  function onTextPointerDown(e) {
    if (!isTextTarget(e.target)) return;
    textMoveEl = e.target;
    textMoveX0 = e.clientX;
    textMoveY0 = e.clientY;
    textMoving = false;
    on(window, 'mousemove', onTextPointerMove);
    on(window, 'mouseup',   onTextPointerUp);
  }

  function onTextPointerMove(e) {
    if (!textMoveEl) return;
    const dx = e.clientX - textMoveX0, dy = e.clientY - textMoveY0;
    if (!textMoving && Math.sqrt(dx*dx + dy*dy) > 4) {
      textMoving = true;
      startTextMove(textMoveEl, textMoveX0, textMoveY0);
    }
    if (textMoving) doTextMove(e.clientX, e.clientY);
  }

  function onTextPointerUp(e) {
    if (!textMoving && textMoveEl) {
      // plain click — select for font-size resize
      e.stopPropagation();
      if (selectedText && selectedText !== textMoveEl) {
        selectedText.style.outline = '';
        selectedText.style.cursor  = '';
      }
      selectedText = textMoveEl;
      selectedText.style.outline = '1px dashed rgba(140,129,149,0.55)';
      showTextHandle(selectedText);
    }
    if (textMoving && textMoveEl) textMoveEl.style.cursor = 'grab';
    textMoveEl = null; textMoving = false;
    off(window, 'mousemove', onTextPointerMove);
    off(window, 'mouseup',   onTextPointerUp);
  }

  // ── Text move ─────────────────────────────────────────────────────────
  function startTextMove(el, clientX, clientY) {
    const cs      = getComputedStyle(el);
    const rect    = el.getBoundingClientRect();
    const par     = el.offsetParent || el.parentElement;
    const parRect = par.getBoundingClientRect();

    if (cs.position !== 'absolute') {
      if (getComputedStyle(par).position === 'static') par.style.position = 'relative';
      el.style.margin   = '0';
      el.style.position = 'absolute';
      el.style.left     = (rect.left - parRect.left + par.scrollLeft) + 'px';
      el.style.top      = (rect.top  - parRect.top  + par.scrollTop)  + 'px';
    }

    textMoveOffX  = clientX - el.getBoundingClientRect().left;
    textMoveOffY  = clientY - el.getBoundingClientRect().top;
    el.style.cursor = 'grabbing';
  }

  function doTextMove(clientX, clientY) {
    if (!textMoveEl) return;
    const par     = textMoveEl.offsetParent || textMoveEl.parentElement;
    const parRect = par.getBoundingClientRect();
    textMoveEl.style.left = (clientX - textMoveOffX - parRect.left + par.scrollLeft) + 'px';
    textMoveEl.style.top  = (clientY - textMoveOffY - parRect.top  + par.scrollTop)  + 'px';
    if (textHandleEl && selectedText === textMoveEl) {
      const r = textMoveEl.getBoundingClientRect();
      textHandleEl.style.top  = (r.top - 36) + 'px';
      textHandleEl.style.left = r.left + 'px';
    }
    updatePanel();
  }

  // ── Font-size handle ──────────────────────────────────────────────────
  function showTextHandle(el) {
    removeTextHandle();
    const r      = el.getBoundingClientRect();
    const rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const curPx  = parseFloat(getComputedStyle(el).fontSize);
    const sizeRem = (curPx / rootPx).toFixed(2);

    const h = document.createElement('div');
    h.id = 're-text-handle';
    css(h, {
      position:'fixed', zIndex:'10001',
      top:(r.top - 36) + 'px', left:r.left + 'px',
      background:'rgba(242,241,238,0.97)',
      border:'1px solid rgba(180,172,165,0.4)',
      borderRadius:'3px', padding:'0.25rem 0.6rem',
      fontFamily:"'Outfit',sans-serif",
      fontSize:'0.7rem', fontWeight:'200',
      letterSpacing:'0.08em', color:'#7c7876',
      cursor:'ns-resize', userSelect:'none',
      backdropFilter:'blur(8px)',
      display:'flex', alignItems:'center', gap:'0.4rem', whiteSpace:'nowrap',
    });
    h.innerHTML = `<span style="color:#c2bdb7;font-size:.65rem;">↕</span><span id="re-text-size">${sizeRem}rem</span>`;
    h.title = 'drag up = bigger · drag down = smaller';

    h.addEventListener('mousedown', e => {
      e.preventDefault(); e.stopPropagation();
      textSizeDragY0    = e.clientY;
      textSizeDragSize0 = parseFloat(getComputedStyle(el).fontSize);
      textSizeDragActive = true;
      on(window, 'mousemove', onTextSizeDragMove);
      on(window, 'mouseup',   onTextSizeDragEnd);
    });

    document.body.appendChild(h);
    textHandleEl = h;
  }

  function onTextSizeDragMove(e) {
    if (!textSizeDragActive || !selectedText) return;
    const dy     = textSizeDragY0 - e.clientY;
    const rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const newRem = (Math.max(6, textSizeDragSize0 + dy * 0.5) / rootPx).toFixed(2);
    selectedText.style.fontSize = newRem + 'rem';
    const sizeEl = document.getElementById('re-text-size');
    if (sizeEl) sizeEl.textContent = newRem + 'rem';
    if (textHandleEl) {
      const r = selectedText.getBoundingClientRect();
      textHandleEl.style.top  = (r.top - 36) + 'px';
      textHandleEl.style.left = r.left + 'px';
    }
    updatePanel();
  }

  function onTextSizeDragEnd() {
    textSizeDragActive = false;
    off(window, 'mousemove', onTextSizeDragMove);
    off(window, 'mouseup',   onTextSizeDragEnd);
  }

  function removeTextHandle() {
    if (textHandleEl) { textHandleEl.remove(); textHandleEl = null; }
  }

  // ══════════════════════════════════════════════════════════════════════
  //  LOGO HANDLE
  // ══════════════════════════════════════════════════════════════════════

  function enableLogoHandle() {
    logoEl     = document.querySelector('.logo-img--hero');
    logoTextEl = document.querySelector('.hero-name'); // just the logo, not the subtitle
    if (!logoEl || !logoTextEl) return;
    logoEl.style.outline = '1px dashed rgba(140,129,149,0.4)';

    // Use transform: translate so we don't need to reparent or recalculate offsets
    if (!logoTextEl._dragTx) { logoTextEl._dragTx = 0; logoTextEl._dragTy = 0; }

    function syncHandles() {
      const r2 = logoEl.getBoundingClientRect();
      css(logoHandleS, {
        left: (r2.left + r2.width / 2 - 5) + 'px',
        top:  (r2.bottom - 5) + 'px',
      });
      css(logoHandleM, {
        left: (r2.left + r2.width / 2 - 14) + 'px',
        top:  (r2.top - 22) + 'px',
      });
    }

    // Size handle — bottom centre dot (drag up = bigger)
    logoHandleS = document.createElement('div');
    css(logoHandleS, {
      position:'fixed', width:'10px', height:'10px',
      cursor:'ns-resize', zIndex:'9997',
      background:'rgba(140,129,149,0.15)',
      border:'2px dashed rgba(140,129,149,0.6)',
      borderRadius:'50%',
    });
    const sLbl = makeSplitterLabel('size ↕');
    css(sLbl, { bottom:'14px', left:'50%', transform:'translateX(-50%)' });
    logoHandleS.appendChild(sLbl);
    logoHandleS.addEventListener('mouseenter', () => { logoHandleS.style.background='rgba(140,129,149,0.28)'; });
    logoHandleS.addEventListener('mouseleave', () => { logoHandleS.style.background='rgba(140,129,149,0.15)'; });
    logoHandleS.addEventListener('mousedown', onLogoSizeStart);

    // Move handle — top centre bar (drag to reposition)
    logoHandleM = document.createElement('div');
    css(logoHandleM, {
      position:'fixed', width:'28px', height:'10px',
      cursor:'move', zIndex:'9997',
      background:'rgba(140,129,149,0.15)',
      border:'2px dashed rgba(140,129,149,0.6)',
      borderRadius:'3px',
    });
    const mLbl = makeSplitterLabel('move');
    css(mLbl, { top:'14px', left:'50%', transform:'translateX(-50%)' });
    logoHandleM.appendChild(mLbl);
    logoHandleM.addEventListener('mouseenter', () => { logoHandleM.style.background='rgba(140,129,149,0.28)'; });
    logoHandleM.addEventListener('mouseleave', () => { logoHandleM.style.background='rgba(140,129,149,0.15)'; });
    logoHandleM.addEventListener('mousedown', onLogoMoveStart);

    logoHandleS._sync = syncHandles;
    logoHandleM._sync = syncHandles;
    syncHandles();

    document.body.appendChild(logoHandleS);
    document.body.appendChild(logoHandleM);
  }

  function disableLogoHandle() {
    if (logoHandleS) { logoHandleS.remove(); logoHandleS = null; }
    if (logoHandleM) { logoHandleM.remove(); logoHandleM = null; }
    if (logoEl)      { logoEl.style.outline = ''; logoEl = null; }
    if (logoTextEl)  { logoTextEl = null; }
  }

  function onLogoMoveStart(e) {
    e.preventDefault(); e.stopPropagation();
    logoMoveX0 = e.clientX;
    logoMoveY0 = e.clientY;
    logoMoveL0 = logoTextEl._dragTx || 0;
    logoMoveT0 = logoTextEl._dragTy || 0;
    logoMoving = true;
    on(window, 'mousemove', onLogoMoveMove);
    on(window, 'mouseup',   onLogoMoveEnd);
  }
  function onLogoMoveMove(e) {
    if (!logoMoving) return;
    logoTextEl._dragTx = logoMoveL0 + (e.clientX - logoMoveX0);
    logoTextEl._dragTy = logoMoveT0 + (e.clientY - logoMoveY0);
    logoTextEl.style.transform = `translate(${logoTextEl._dragTx.toFixed(1)}px, ${logoTextEl._dragTy.toFixed(1)}px)`;
    if (logoHandleS && logoHandleS._sync) logoHandleS._sync();
    updatePanel();
  }
  function onLogoMoveEnd() {
    logoMoving = false;
    off(window, 'mousemove', onLogoMoveMove);
    off(window, 'mouseup',   onLogoMoveEnd);
  }

  function onLogoSizeStart(e) {
    e.preventDefault(); e.stopPropagation();
    const cur = getComputedStyle(document.documentElement).getPropertyValue('--logo-hero-h').trim();
    const rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize);
    logoH0  = parseFloat(cur) * (cur.endsWith('rem') ? rootPx : 1);
    logoHY0 = e.clientY;
    on(window, 'mousemove', onLogoSizeMove);
    on(window, 'mouseup',   onLogoSizeEnd);
  }
  function onLogoSizeMove(e) {
    const rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const dy     = logoHY0 - e.clientY; // drag up = bigger
    const newPx  = Math.max(12, logoH0 + dy * 0.8);
    const newRem = (newPx / rootPx).toFixed(2);
    document.documentElement.style.setProperty('--logo-hero-h', newRem + 'rem');
    if (logoHandleS && logoHandleS._positionHandle) logoHandleS._positionHandle();
    updatePanel();
  }
  function onLogoSizeEnd() {
    off(window, 'mousemove', onLogoSizeMove);
    off(window, 'mouseup',   onLogoSizeEnd);
  }

  // ══════════════════════════════════════════════════════════════════════
  //  PHOTO HANDLES
  // ══════════════════════════════════════════════════════════════════════

  function enablePhotoHandles() {
    photoEl = document.querySelector('.about-photo');
    if (!photoEl) return;
    if (getComputedStyle(photoEl).position === 'static') photoEl.style.position = 'relative';
    photoEl.style.outline = '1px dashed rgba(140,129,149,0.4)';

    // Right edge — width
    photoHandleW = document.createElement('div');
    css(photoHandleW, {
      position:'absolute', top:'0', bottom:'0', right:'-5px', width:'10px',
      cursor:'ew-resize', zIndex:'9997',
      background:'rgba(140,129,149,0.15)',
      borderRight:'2px dashed rgba(140,129,149,0.6)',
    });
    const wLbl = makeSplitterLabel('width');
    css(wLbl, { top:'8px', left:'50%', transform:'translateX(-50%)' });
    photoHandleW.appendChild(wLbl);
    photoHandleW.addEventListener('mousedown', onPhotoWidthStart);
    photoHandleW.addEventListener('mouseenter', () => { photoHandleW.style.background='rgba(140,129,149,0.28)'; });
    photoHandleW.addEventListener('mouseleave', () => { photoHandleW.style.background='rgba(140,129,149,0.15)'; });

    // Top edge — vertical offset
    photoHandleV = document.createElement('div');
    css(photoHandleV, {
      position:'absolute', left:'0', right:'0', top:'-5px', height:'10px',
      cursor:'ns-resize', zIndex:'9997',
      background:'rgba(140,129,149,0.15)',
      borderTop:'2px dashed rgba(140,129,149,0.6)',
    });
    const vLbl = makeSplitterLabel('offset ↕');
    css(vLbl, { bottom:'12px', left:'50%', transform:'translateX(-50%)' });
    photoHandleV.appendChild(vLbl);
    photoHandleV.addEventListener('mousedown', onPhotoTopStart);
    photoHandleV.addEventListener('mouseenter', () => { photoHandleV.style.background='rgba(140,129,149,0.28)'; });
    photoHandleV.addEventListener('mouseleave', () => { photoHandleV.style.background='rgba(140,129,149,0.15)'; });

    // Left edge — opacity
    photoHandleO = document.createElement('div');
    css(photoHandleO, {
      position:'absolute', top:'0', bottom:'0', left:'-5px', width:'10px',
      cursor:'ns-resize', zIndex:'9997',
      background:'rgba(140,129,149,0.15)',
      borderLeft:'2px dashed rgba(140,129,149,0.6)',
    });
    const oLbl = makeSplitterLabel('opacity ↕');
    css(oLbl, { top:'8px', left:'50%', transform:'translateX(-50%)' });
    photoHandleO.appendChild(oLbl);
    photoHandleO.addEventListener('mousedown', onPhotoOpacityStart);
    photoHandleO.addEventListener('mouseenter', () => { photoHandleO.style.background='rgba(140,129,149,0.28)'; });
    photoHandleO.addEventListener('mouseleave', () => { photoHandleO.style.background='rgba(140,129,149,0.15)'; });

    photoEl.appendChild(photoHandleW);
    photoEl.appendChild(photoHandleV);
    photoEl.appendChild(photoHandleO);
  }

  function disablePhotoHandles() {
    if (photoHandleW) { photoHandleW.remove(); photoHandleW = null; }
    if (photoHandleV) { photoHandleV.remove(); photoHandleV = null; }
    if (photoHandleO) { photoHandleO.remove(); photoHandleO = null; }
    if (photoEl) { photoEl.style.outline = ''; photoEl.style.position = ''; photoEl = null; }
  }

  function makeSplitterLabel(text) {
    const lbl = document.createElement('span');
    css(lbl, {
      position:'absolute',
      background:'rgba(242,241,238,0.9)', border:'1px solid rgba(180,172,165,0.35)',
      borderRadius:'2px', padding:'0.15rem 0.4rem',
      fontFamily:"'Outfit',sans-serif", fontSize:'0.4rem', fontWeight:'200',
      letterSpacing:'0.12em', color:'#aba6a2', textTransform:'uppercase',
      whiteSpace:'nowrap', pointerEvents:'none',
    });
    lbl.textContent = text;
    return lbl;
  }

  function onPhotoWidthStart(e) {
    e.preventDefault(); e.stopPropagation();
    photoW0  = photoEl.offsetWidth;
    photoWX0 = e.clientX;
    on(window, 'mousemove', onPhotoWidthMove);
    on(window, 'mouseup',   onPhotoWidthEnd);
  }
  function onPhotoWidthMove(e) {
    const newW = Math.max(60, photoW0 + (e.clientX - photoWX0));
    document.documentElement.style.setProperty('--about-photo-w', newW.toFixed(0) + 'px');
    updatePanel();
  }
  function onPhotoWidthEnd() {
    off(window, 'mousemove', onPhotoWidthMove);
    off(window, 'mouseup',   onPhotoWidthEnd);
  }

  function onPhotoTopStart(e) {
    e.preventDefault(); e.stopPropagation();
    const cur = getComputedStyle(document.documentElement).getPropertyValue('--about-photo-mt').trim();
    photoMT0 = parseFloat(cur) || 0;
    photoVY0 = e.clientY;
    on(window, 'mousemove', onPhotoTopMove);
    on(window, 'mouseup',   onPhotoTopEnd);
  }
  function onPhotoTopMove(e) {
    const newMT = photoMT0 + (e.clientY - photoVY0);
    document.documentElement.style.setProperty('--about-photo-mt', newMT.toFixed(0) + 'px');
    updatePanel();
  }
  function onPhotoTopEnd() {
    off(window, 'mousemove', onPhotoTopMove);
    off(window, 'mouseup',   onPhotoTopEnd);
  }

  function onPhotoOpacityStart(e) {
    e.preventDefault(); e.stopPropagation();
    const cur = getComputedStyle(document.documentElement).getPropertyValue('--about-photo-opacity').trim();
    photoOp0 = parseFloat(cur) || 1;
    photoOY0 = e.clientY;
    on(window, 'mousemove', onPhotoOpacityMove);
    on(window, 'mouseup',   onPhotoOpacityEnd);
  }
  function onPhotoOpacityMove(e) {
    const dy    = photoOY0 - e.clientY; // drag up = more opaque
    const newOp = Math.min(1, Math.max(0, photoOp0 + dy * 0.005));
    document.documentElement.style.setProperty('--about-photo-opacity', newOp.toFixed(2));
    updatePanel();
  }
  function onPhotoOpacityEnd() {
    off(window, 'mousemove', onPhotoOpacityMove);
    off(window, 'mouseup',   onPhotoOpacityEnd);
  }

  // ══════════════════════════════════════════════════════════════════════
  //  SPLITTERS
  // ══════════════════════════════════════════════════════════════════════

  function enableSplitters() {
    SPLITTERS.forEach(cfg => {
      const section = document.querySelector(cfg.sectionSel);
      if (!section) return;

      if (getComputedStyle(section).position === 'static') section.style.position = 'relative';

      const handle = document.createElement('div');
      handle.className = 're-splitter';
      handle.dataset.var = cfg.varName;

      if (cfg.axis === 'v') {
        // ── Vertical (column) handle ─────────────────────────────────
        const currentPct = parseFloat(
          getComputedStyle(document.documentElement).getPropertyValue(cfg.varName) || cfg.defaultPct
        );
        const handleLeft = cfg.side === 'right'
          ? (100 - currentPct).toFixed(1) + '%'
          : currentPct.toFixed(1) + '%';

        css(handle, {
          position:'absolute', top:'0', bottom:'0', width:'10px',
          background:'rgba(140,129,149,0.12)',
          borderLeft:'2px dashed rgba(140,129,149,0.5)',
          cursor:'col-resize', zIndex:'9997',
          transform:'translateX(-50%)',
          left: handleLeft, transition:'background 0.15s',
        });
      } else {
        // ── Horizontal (row height) handle ───────────────────────────
        css(handle, {
          position:'absolute', left:'0', right:'0', bottom:'0', height:'10px',
          background:'rgba(140,129,149,0.12)',
          borderBottom:'2px dashed rgba(140,129,149,0.5)',
          cursor:'ns-resize', zIndex:'9997',
          transform:'translateY(50%)',
          transition:'background 0.15s',
        });
      }

      // Label chip
      const lbl = makeSplitterLabel(cfg.label);
      if (cfg.axis === 'v') {
        css(lbl, { top:'8px', left:'50%', transform:'translateX(-50%)' });
      } else {
        css(lbl, { bottom:'12px', left:'50%', transform:'translateX(-50%)' });
      }
      handle.appendChild(lbl);

      handle.addEventListener('mouseenter', () => { handle.style.background='rgba(140,129,149,0.28)'; });
      handle.addEventListener('mouseleave', () => { handle.style.background='rgba(140,129,149,0.12)'; });
      handle.addEventListener('mousedown',  e  => onSplitStart(e, section, handle, cfg));

      section.appendChild(handle);
      splitterHandles.push({ el: handle, varName: cfg.varName });
    });
  }

  function disableSplitters() {
    splitterHandles.forEach(({ el }) => el.remove());
    splitterHandles.length = 0;
    SPLITTERS.forEach(cfg => {
      const section = document.querySelector(cfg.sectionSel);
      if (section) section.style.position = '';
    });
  }

  let splitCfg=null, splitHandle=null, splitSection=null, splitX0, splitY0, splitW0, splitH0;

  function onSplitStart(e, section, handle, cfg) {
    e.preventDefault();
    splitCfg     = cfg;
    splitHandle  = handle;
    splitSection = section;
    splitX0      = e.clientX;
    splitY0      = e.clientY;

    if (cfg.axis === 'v') {
      splitW0 = parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue(cfg.varName) || cfg.defaultPct
      );
    } else {
      splitH0 = section.getBoundingClientRect().height;
    }
    on(window, 'mousemove', onSplitMove);
    on(window, 'mouseup',   onSplitEnd);
  }

  function onSplitMove(e) {
    if (!splitCfg) return;

    if (splitCfg.axis === 'v') {
      const sectionW = splitSection.getBoundingClientRect().width;
      const dx       = e.clientX - splitX0;
      const deltaPct = (dx / sectionW) * 100;
      const newPct   = splitCfg.side === 'right'
        ? Math.max(10, Math.min(90, splitW0 - deltaPct))
        : Math.max(10, Math.min(90, splitW0 + deltaPct));

      document.documentElement.style.setProperty(splitCfg.varName, newPct.toFixed(1) + '%');
      splitHandle.style.left = splitCfg.side === 'right'
        ? (100 - newPct).toFixed(1) + '%'
        : newPct.toFixed(1) + '%';

    } else {
      const dy    = e.clientY - splitY0;
      const newH  = Math.max(100, splitH0 + dy);
      const newVh = (newH / window.innerHeight * 100).toFixed(1);
      // Apply directly to the section so it responds immediately
      splitSection.style.height    = newH + 'px';
      splitSection.style.minHeight = newH + 'px';
      document.documentElement.style.setProperty(splitCfg.varName, newVh + 'vh');
    }

    updatePanel();
  }

  function onSplitEnd() {
    splitCfg = splitHandle = splitSection = null;
    off(window, 'mousemove', onSplitMove);
    off(window, 'mouseup',   onSplitEnd);
  }

  // ══════════════════════════════════════════════════════════════════════
  //  PANEL
  // ══════════════════════════════════════════════════════════════════════

  function makePanel() {
    const p = document.createElement('div');
    p.id = 're-panel';
    css(p, {
      position:'fixed', bottom:'3.8rem', right:'1.4rem',
      zIndex:'9998', display:'none', width:'275px',
      background:'rgba(242,241,238,0.97)',
      border:'1px solid rgba(180,172,165,0.35)',
      padding:'1rem 1.1rem',
      fontFamily:"'Outfit',sans-serif",
      fontSize:'0.48rem', fontWeight:'200',
      letterSpacing:'0.1em', color:'#4a4746',
      backdropFilter:'blur(12px)',
      boxShadow:'0 4px 24px rgba(0,0,0,0.06)',
      maxHeight:'80vh', overflowY:'auto',
    });

    const btnStyle = `background:none;border:1px solid rgba(180,172,165,.4);color:#7c7876;` +
      `font-family:'Outfit',sans-serif;font-size:.44rem;letter-spacing:.14em;` +
      `text-transform:uppercase;padding:.28rem .55rem;cursor:pointer;`;

    p.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.7rem;">
        <span style="letter-spacing:.2em;text-transform:uppercase;color:#aba6a2;font-size:.46rem;">editor</span>
        <button id="re-copy" style="${btnStyle}">copy css</button>
      </div>

      <div style="display:flex;gap:.4rem;margin-bottom:.8rem;">
        <button id="re-tool-rects" style="${btnStyle}opacity:1;">⊹ rects</button>
        <button id="re-tool-text"  style="${btnStyle}opacity:.45;">↕ text</button>
        <button id="re-add"        style="${btnStyle}">+ add rect</button>
      </div>

      <pre id="re-out" style="font-size:.44rem;line-height:1.9;color:#7c7876;white-space:pre-wrap;margin:0;"></pre>

      <p id="re-hint" style="margin-top:.75rem;color:#c2bdb7;font-size:.42rem;line-height:1.7;
        border-top:1px solid rgba(180,172,165,.2);padding-top:.65rem;">
        <b style="color:#aba6a2;">rects mode</b><br>
        drag body → move · corners → resize<br>
        drag ● → rotate · × → delete<br>
        + add rect → click anywhere to place<br><br>
        <b style="color:#aba6a2;">text mode</b><br>
        drag any text → move it anywhere<br>
        click any text → drag ↕ handle to resize<br><br>
        <b style="color:#aba6a2;">splits</b><br>
        drag ┃ vertical divider → resize columns<br>
        drag ━ horizontal divider → resize section height<br><br>
        copy css → paste into style.css
      </p>`;

    return p;
  }

  document.addEventListener('click', e => {
    if (e.target.id === 're-copy') {
      const out = document.getElementById('re-out');
      if (!out) return;
      navigator.clipboard.writeText(out.textContent).then(() => {
        e.target.textContent = 'copied ✓';
        setTimeout(() => { e.target.textContent = 'copy css'; }, 1800);
      });
    }
    if (e.target.id === 're-tool-rects') setTool('rects');
    if (e.target.id === 're-tool-text')  setTool('text');
    if (e.target.id === 're-add')        enterPlaceMode();
  });

  function updatePanel() {
    const out = document.getElementById('re-out');
    if (!out) return;
    const lines = [];

    // Rects
    document.querySelectorAll('.sheer-rect').forEach(el => {
      const s = rectState.get(el);
      if (!s) return;
      const varKey = Object.keys(VAR_MAP).find(k => el.classList.contains(k));
      if (!varKey) return;
      const [vl,vb,vw,vh,vr] = VAR_MAP[varKey];
      lines.push(
        `/* ${varKey} */\n` +
        `${vl}: ${pct(s.left, s.pW)};\n` +
        `${vb}: ${pct(s.pH - s.top - s.height, s.pH)};\n` +
        `${vw}: ${pct(s.width, s.pW)};\n` +
        `${vh}: ${pct(s.height, s.pH)};\n` +
        `${vr}: ${s.angle.toFixed(1)}deg;`
      );
    });

    // Splitters — vertical
    const vLines = [], hLines = [];
    SPLITTERS.forEach(({ axis, varName }) => {
      const val = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
      if (!val) return;
      (axis === 'v' ? vLines : hLines).push(`${varName}: ${val};`);
    });
    if (vLines.length) lines.push('/* column splits */\n' + vLines.join('\n'));
    if (hLines.length) lines.push('/* section heights */\n' + hLines.join('\n'));

    // Text — size + position, only real content classes
    const CONTENT_CLASSES = new Set([
      'hero-name','hero-sub','proj-name','proj-num','page-title','page-subtitle',
      'eyebrow','about-bio','footer-name','sidebar-name','g-caption',
    ]);
    const textProps = new Map(); // cls → { fontSize?, left?, top? }
    document.querySelectorAll('*').forEach(el => {
      if (el.closest('#re-panel, #re-text-handle, .re-splitter')) return;
      if (el === toggleBtn || el === panel) return;
      const hasFontSize = !!el.style.fontSize;
      const hasMoved    = el.style.position === 'absolute';
      if (!hasFontSize && !hasMoved) return;
      const cls = [...el.classList].find(c => CONTENT_CLASSES.has(c));
      if (!cls) return;
      if (!textProps.has(cls)) textProps.set(cls, {});
      const p = textProps.get(cls);
      if (hasFontSize) p.fontSize = el.style.fontSize;
      if (hasMoved) {
        const par = el.offsetParent || el.parentElement;
        p.position = 'absolute';
        p.left = (el.offsetLeft / par.offsetWidth  * 100).toFixed(1) + '%';
        p.top  = (el.offsetTop  / par.offsetHeight * 100).toFixed(1) + '%';
      }
    });
    const textLines = [];
    textProps.forEach((p, cls) => {
      const parts = [];
      if (p.position) parts.push(`position: ${p.position}`, `left: ${p.left}`, `top: ${p.top}`);
      if (p.fontSize) parts.push(`font-size: ${p.fontSize}`);
      textLines.push(`.${cls} {\n  ${parts.join(';\n  ')};\n}`);
    });
    if (textLines.length) lines.push('/* text */\n' + textLines.join('\n'));

    // Logo
    const logoHVal = getComputedStyle(document.documentElement).getPropertyValue('--logo-hero-h').trim();
    const heroTextEl = document.querySelector('.hero-text');
    const logoLines = [];
    if (logoHVal) logoLines.push(`--logo-hero-h: ${logoHVal};`);
    const heroNameEl = document.querySelector('.hero-name');
    if (heroNameEl && (heroNameEl._dragTx || heroNameEl._dragTy)) {
      const tx = (heroNameEl._dragTx || 0).toFixed(1);
      const ty = (heroNameEl._dragTy || 0).toFixed(1);
      logoLines.push(`.hero-name {\n  transform: translate(${tx}px, ${ty}px);\n}`);
    }
    if (logoLines.length) lines.push('/* logo */\n' + logoLines.join('\n'));

    // About photo
    const photoWVal  = getComputedStyle(document.documentElement).getPropertyValue('--about-photo-w').trim();
    const photoMTVal = getComputedStyle(document.documentElement).getPropertyValue('--about-photo-mt').trim();
    const photoOpVal = getComputedStyle(document.documentElement).getPropertyValue('--about-photo-opacity').trim();
    if (photoWVal || photoMTVal || photoOpVal) {
      lines.push(
        `/* about photo */\n` +
        `--about-photo-w: ${photoWVal || '323px'};\n` +
        `--about-photo-mt: ${photoMTVal || '0px'};\n` +
        `--about-photo-opacity: ${photoOpVal || '1'};`
      );
    }

    out.textContent = lines.join('\n\n');
  }

  // ── Toggle button ─────────────────────────────────────────────────────
  function makeToggleBtn() {
    const b = document.createElement('button');
    b.textContent = '⊹ edit';
    b.dataset.active = '0';
    css(b, {
      position:'fixed', bottom:'1.4rem', right:'1.4rem',
      zIndex:'9999', background:'rgba(242,241,238,0.92)',
      border:'1px solid rgba(180,172,165,.35)', color:'#7c7876',
      fontFamily:"'Outfit',sans-serif",
      fontSize:'0.5rem', fontWeight:'200',
      letterSpacing:'0.18em', textTransform:'uppercase',
      padding:'0.48rem 0.85rem', cursor:'pointer',
      backdropFilter:'blur(8px)', transition:'background 0.2s',
    });
    b.addEventListener('mouseenter', () => { b.style.background='rgba(232,229,224,0.97)'; });
    b.addEventListener('mouseleave', () => {
      b.style.background = b.dataset.active === '1'
        ? 'rgba(210,205,215,0.92)' : 'rgba(242,241,238,0.92)';
    });
    b.onclick = toggle;
    return b;
  }

  // ── Helpers ───────────────────────────────────────────────────────────
  function css(el, props) { Object.assign(el.style, props); }
  function on(t, e, fn)   { t.addEventListener(e, fn); }
  function off(t, e, fn)  { t.removeEventListener(e, fn); }
  function pct(px, total) { return ((px / total) * 100).toFixed(1) + '%'; }

  // Called by knitwear tab-switch when the 2000 panel becomes visible in edit mode
  window._editorEnableFreeImgs = function () {
    if (!editMode || activeTool !== 'rects') return;
    document.querySelectorAll('.kw-free-img').forEach(enableRect);
  };

})();

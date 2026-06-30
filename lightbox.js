/**
 * lightbox.js — shared-element lightbox for Emily Nguyen's portfolio
 *
 * Usage: add  data-lb-group="group-name"  to any <img> you want clickable.
 * Images sharing the same group name cycle together with ← →.
 * Add  data-lb-no-scroll="true"  to the <body> to disable scroll-to-close.
 *
 * Do NOT include on speak-nearby-photos.html (has its own bespoke lightbox).
 */
(function () {
  'use strict';

  function init() {
    // ── 1. Collect groups ─────────────────────────────────────────────
    var groups = {};
    document.querySelectorAll('img[data-lb-group]').forEach(function (img) {
      var g = img.getAttribute('data-lb-group');
      if (!groups[g]) groups[g] = [];
      groups[g].push(img);
    });
    if (Object.keys(groups).length === 0) return;

    var noScroll = document.body.getAttribute('data-lb-no-scroll') === 'true';

    // ── 2. Build control elements — all direct <body> children ───────
    var backdrop = document.createElement('div');
    backdrop.className = 'glb-backdrop';
    document.body.appendChild(backdrop);

    var btnPrev = document.createElement('button');
    btnPrev.className = 'glb-btn glb-prev';
    btnPrev.innerHTML = '&#8592;';
    btnPrev.setAttribute('aria-label', 'Previous');
    document.body.appendChild(btnPrev);

    var btnNext = document.createElement('button');
    btnNext.className = 'glb-btn glb-next';
    btnNext.innerHTML = '&#8594;';
    btnNext.setAttribute('aria-label', 'Next');
    document.body.appendChild(btnNext);

    var btnClose = document.createElement('button');
    btnClose.className = 'glb-btn glb-close';
    btnClose.textContent = 'close';
    document.body.appendChild(btnClose);

    var lbCounter = document.createElement('span');
    lbCounter.className = 'glb-counter';
    document.body.appendChild(lbCounter);

    // ── 3. State ──────────────────────────────────────────────────────
    var lbFloatImg  = null;
    var lbSourceImg = null;
    var lbClosing   = false;
    var curGroup    = null;
    var curIdx      = 0;
    var isOpen      = false;

    // Stored per-open so close can reverse exactly
    var storedRot   = 0;
    var storedCX    = 0;
    var storedCY    = 0;
    var storedW     = 0;
    var storedH     = 0;

    // ── 4. Helpers ────────────────────────────────────────────────────
    function computeSize(natW, natH) {
      var vw = window.innerWidth, vh = window.innerHeight;
      var maxW = vw * 0.86, maxH = vh * 0.88;
      if (natW <= 0 || natH <= 0) return { w: maxW * 0.7, h: maxH * 0.7 };
      var ar = natW / natH;
      var w, h;
      if (natW <= maxW && natH <= maxH) {
        w = natW; h = natH;
      } else if ((natW / maxW) > (natH / maxH)) {
        w = maxW; h = maxW / ar;
      } else {
        h = maxH; w = maxH * ar;
      }
      return { w: w, h: h };
    }

    // Walk up DOM to find nearest CSS-rotated ancestor and extract its angle
    function getAncestorRotation(el) {
      var node = el.parentElement;
      while (node && node !== document.body) {
        var t = window.getComputedStyle(node).transform;
        if (t && t !== 'none' && t !== 'matrix(1, 0, 0, 1, 0, 0)') {
          var m = t.match(/^matrix\(([^)]+)\)/);
          if (m) {
            var v = m[1].split(',');
            var a = parseFloat(v[0]), b = parseFloat(v[1]);
            return Math.atan2(b, a) * (180 / Math.PI);
          }
        }
        node = node.parentElement;
      }
      return 0;
    }

    function showControls(on) {
      var o = on ? '1' : '0', pe = on ? 'all' : 'none';
      [btnPrev, btnNext, btnClose].forEach(function (b) {
        b.style.opacity = o; b.style.pointerEvents = pe;
      });
      lbCounter.style.opacity = o;
      backdrop.style.opacity  = o; backdrop.style.pointerEvents = pe;
      isOpen = on;
    }

    // ── 5. Open ───────────────────────────────────────────────────────
    function open(groupName, idx) {
      if (lbClosing || lbFloatImg) return;
      var group  = groups[groupName];
      var srcImg = group[idx];

      curGroup = groupName;
      curIdx   = idx;

      // Suppress any hover/scale transforms on the img itself before measuring
      var prevTransform = srcImg.style.transform;
      var prevTransition = srcImg.style.transition;
      srcImg.style.transition = 'none';
      srcImg.style.transform  = 'none';
      srcImg.offsetHeight; // force reflow

      var rect = srcImg.getBoundingClientRect();

      // Use layout dimensions (not AABB) for the start size
      var startW = srcImg.offsetWidth;
      var startH = srcImg.offsetHeight;

      // Rotation from nearest transformed ancestor
      var rotation = getAncestorRotation(srcImg);

      // Visual centre of the rotated element on screen
      var cx = rect.left + rect.width  / 2;
      var cy = rect.top  + rect.height / 2;

      // Where to fly to
      var natW  = srcImg.naturalWidth  > 0 ? srcImg.naturalWidth  : startW;
      var natH  = srcImg.naturalHeight > 0 ? srcImg.naturalHeight : startH;
      var size  = computeSize(natW, natH);
      var vw = window.innerWidth, vh = window.innerHeight;
      var destL = (vw - size.w) / 2;
      var destT = (vh - size.h) / 2;

      // Hide original
      lbSourceImg = srcImg;
      srcImg.style.opacity = '0';
      // Keep transform suppressed while open

      // Store for close
      storedRot = rotation;
      storedCX  = cx;
      storedCY  = cy;
      storedW   = startW;
      storedH   = startH;

      // Create float img centred over the visual element, with matching rotation
      lbFloatImg = document.createElement('img');
      lbFloatImg.src = srcImg.src;
      lbFloatImg.style.cssText =
        'position:fixed;z-index:1001;margin:0;padding:0;border:none;display:block;' +
        'object-fit:contain;transform-origin:center center;' +
        'left:'      + (cx - startW / 2) + 'px;' +
        'top:'       + (cy - startH / 2) + 'px;' +
        'width:'     + startW + 'px;' +
        'height:'    + startH + 'px;' +
        'transform:rotate(' + rotation + 'deg);' +
        'transition:none;';
      document.body.appendChild(lbFloatImg);

      lbCounter.textContent = (idx + 1) + ' / ' + group.length;
      showControls(true);

      // Animate to centre
      lbFloatImg.offsetHeight;
      var ease  = '0.5s cubic-bezier(0.4,0,0.2,1)';
      var trans = 'left ' + ease + ',top ' + ease + ',width ' + ease + ',height ' + ease;
      if (rotation) trans += ',transform ' + ease;
      lbFloatImg.style.transition = trans;
      lbFloatImg.style.left      = destL  + 'px';
      lbFloatImg.style.top       = destT  + 'px';
      lbFloatImg.style.width     = size.w + 'px';
      lbFloatImg.style.height    = size.h + 'px';
      if (rotation) lbFloatImg.style.transform = 'rotate(0deg)';
    }

    // ── 6. Close ──────────────────────────────────────────────────────
    function close() {
      if (lbClosing || !lbFloatImg) return;
      lbClosing = true;
      showControls(false);

      var srcImg   = lbSourceImg;
      var floatImg = lbFloatImg;
      var rotation = storedRot;

      if (srcImg) {
        // Current on-screen position of the source (may have scrolled)
        var rect = srcImg.getBoundingClientRect();
        var cx   = rect.left + rect.width  / 2;
        var cy   = rect.top  + rect.height / 2;

        var ease  = '0.44s cubic-bezier(0.4,0,0.2,1)';
        var trans = 'left ' + ease + ',top ' + ease + ',width ' + ease + ',height ' + ease;
        if (rotation) trans += ',transform ' + ease;

        floatImg.style.transition = trans;
        floatImg.style.left       = (cx - storedW / 2) + 'px';
        floatImg.style.top        = (cy - storedH / 2) + 'px';
        floatImg.style.width      = storedW + 'px';
        floatImg.style.height     = storedH + 'px';
        if (rotation) floatImg.style.transform = 'rotate(' + rotation + 'deg)';

        var props   = { left: false, top: false, width: false, height: false };
        if (rotation) props.transform = false;
        var needed  = Object.keys(props).length;
        var done    = 0;
        var swapped = false;

        function doSwap() {
          if (swapped) return;
          swapped = true;
          floatImg.removeEventListener('transitionend', onProp);

          // Atomic swap — same paint frame
          floatImg.style.transition = 'none';
          floatImg.style.opacity    = '0';
          srcImg.style.transition   = 'none';
          srcImg.style.opacity      = '1';

          requestAnimationFrame(function () {
            if (floatImg.parentNode) floatImg.parentNode.removeChild(floatImg);
            if (lbFloatImg === floatImg) lbFloatImg = null;
            lbSourceImg = null;
            lbClosing   = false;
            requestAnimationFrame(function () {
              srcImg.style.opacity    = '';
              srcImg.style.transition = '';
              srcImg.style.transform  = '';
            });
          });
        }

        function onProp(e) {
          if (props.hasOwnProperty(e.propertyName) && !props[e.propertyName]) {
            props[e.propertyName] = true;
            done++;
            if (done >= needed) doSwap();
          }
        }
        floatImg.addEventListener('transitionend', onProp);
        setTimeout(doSwap, 550);
      } else {
        if (floatImg.parentNode) floatImg.parentNode.removeChild(floatImg);
        lbFloatImg  = null;
        lbSourceImg = null;
        lbClosing   = false;
      }
    }

    // ── 7. Navigate ───────────────────────────────────────────────────
    function navigate(dir) {
      if (!lbFloatImg || lbClosing) return;
      var group = groups[curGroup];

      // Restore previous thumbnail
      if (lbSourceImg) {
        lbSourceImg.style.opacity    = '';
        lbSourceImg.style.transition = '';
        lbSourceImg.style.transform  = '';
      }

      curIdx = (curIdx + dir + group.length) % group.length;
      var newImg = group[curIdx];
      lbSourceImg = newImg;
      newImg.style.transition = 'none';
      newImg.style.transform  = 'none';
      newImg.style.opacity    = '0';

      // Update stored values for the new source
      var rect   = newImg.getBoundingClientRect();
      storedRot  = getAncestorRotation(newImg);
      storedCX   = rect.left + rect.width  / 2;
      storedCY   = rect.top  + rect.height / 2;
      storedW    = newImg.offsetWidth;
      storedH    = newImg.offsetHeight;

      // Crossfade float to new image
      var floatImg = lbFloatImg;
      floatImg.style.transition = 'opacity 0.15s ease';
      floatImg.style.opacity    = '0';
      var nextSrc = newImg.src;

      setTimeout(function () {
        if (floatImg !== lbFloatImg) return;
        floatImg.src = nextSrc;
        floatImg.style.opacity = '1';
        // Recentre for new image's aspect ratio
        var natW  = newImg.naturalWidth  > 0 ? newImg.naturalWidth  : storedW;
        var natH  = newImg.naturalHeight > 0 ? newImg.naturalHeight : storedH;
        var size  = computeSize(natW, natH);
        var vw = window.innerWidth, vh = window.innerHeight;
        floatImg.style.transition = 'none';
        floatImg.style.transform  = 'rotate(0deg)';
        floatImg.style.left   = ((vw - size.w) / 2) + 'px';
        floatImg.style.top    = ((vh - size.h) / 2) + 'px';
        floatImg.style.width  = size.w + 'px';
        floatImg.style.height = size.h + 'px';
      }, 150);

      lbCounter.textContent = (curIdx + 1) + ' / ' + group.length;
    }

    // ── 8. Wire controls ──────────────────────────────────────────────
    btnClose.addEventListener('click',  close);
    backdrop.addEventListener('click',  close);
    btnPrev.addEventListener('click',   function (e) { e.stopPropagation(); navigate(-1); });
    btnNext.addEventListener('click',   function (e) { e.stopPropagation(); navigate(1);  });

    document.addEventListener('keydown', function (e) {
      if (!isOpen) return;
      if (e.key === 'Escape')     close();
      if (e.key === 'ArrowLeft')  navigate(-1);
      if (e.key === 'ArrowRight') navigate(1);
    });

    if (!noScroll) {
      window.addEventListener('scroll', function () {
        if (isOpen) close();
      }, { passive: true });
    }

    // ── 9. Register image click handlers ─────────────────────────────
    Object.keys(groups).forEach(function (groupName) {
      groups[groupName].forEach(function (img, idx) {
        (function (g, i) {
          img.addEventListener('click', function () { open(g, i); });
        }(groupName, idx));
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}());

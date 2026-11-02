/*!
 * justified-layout 3.0.0 – UMD版
 * https://github.com/flickr/justified-layout
 */
(function (global, factory) {
  if (typeof module === "object" && typeof module.exports === "object") {
    module.exports = factory();
  } else {
    global.justifiedLayout = factory();
  }
})(typeof window !== "undefined" ? window : this, function () {

  function computeLayout(items, config) {
    const defaults = {
      containerWidth: 1060,
      targetRowHeight: 380,
      boxSpacing: 10,
    };
    const opt = Object.assign({}, defaults, config);
    const rows = [];
    let row = [];
    let rowAspect = 0;

    items.forEach((it, idx) => {
      row.push(it);
      rowAspect += it.aspectRatio;

      const rowWidth = rowAspect * opt.targetRowHeight + opt.boxSpacing * (row.length - 1);

      if (rowWidth >= opt.containerWidth) {
        rows.push(layoutRow(row, rowAspect, opt));
        row = [];
        rowAspect = 0;
      }
    });

    if (row.length) {
      rows.push(layoutRow(row, rowAspect, opt, true));
    }

    let y = 0;
    const boxes = [];

    rows.forEach(r => {
      r.boxes.forEach(b => {
        b.top = y;
        boxes.push(b);
      });
      y += r.height + opt.boxSpacing;
    });

    return {
      boxes,
      containerHeight: y - opt.boxSpacing
    };
  }

  function layoutRow(row, rowAspect, opt, isLast = false) {
    let height = opt.targetRowHeight;
    if (!isLast) {
      height = (opt.containerWidth - opt.boxSpacing * (row.length - 1)) / rowAspect;
    }
    const boxes = [];
    let x = 0;

    row.forEach(it => {
      const width = height * it.aspectRatio;
      boxes.push({
        left: x,
        top: 0,
        width,
        height
      });
      x += width + opt.boxSpacing;
    });

    return {
      boxes,
      height
    };
  }

  return computeLayout;
});

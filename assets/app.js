/* global Plotly */
const $ = (id) => document.getElementById(id);
const indCache = {};

function fmt(n, d = 2) {
  if (n == null || Number.isNaN(Number(n))) return "—";
  return Number(n).toLocaleString("zh-CN", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
}
function chgClass(v) {
  return Number(v) >= 0 ? "up" : "down";
}
function chgText(v) {
  if (v == null || Number.isNaN(Number(v))) return "—";
  const n = Number(v);
  return (n >= 0 ? "+" : "") + fmt(n, 2) + "%";
}
function dayStr(d) {
  const s = String(d);
  if (s.length === 8) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  return s;
}

let dataVer = String(Date.now()); // 会话级防缓存；拿到数据日后会改成交易日

async function loadJSON(path) {
  const url = path.includes("?") ? `${path}&v=${dataVer}` : `${path}?v=${dataVer}`;
  const r = await fetch(url, { cache: "no-cache" });
  if (!r.ok) throw new Error("load fail " + path);
  return r.json();
}
async function loadIndustryBars(code) {
  if (indCache[code]) return indCache[code];
  const data = await loadJSON(`./data/ind/${encodeURIComponent(code)}.json`);
  indCache[code] = data;
  return data;
}

/** 与本地 Streamlit 页同一套 Plotly K 线交互 */
function renderKline(el, bars, opts) {
  const {
    title,
    enableWheelSwitch = false,
    switchCodes = [],
    currentCode = "",
    onSwitch = null,
  } = opts;

  const xs = bars.map((b) => dayStr(b.d));
  const n = xs.length;
  const last = bars[n - 1] || {};
  const lastChg = Number(last.chg);
  const titleColor = Number.isFinite(lastChg) && lastChg >= 0 ? "#c23b22" : "#1f8a4c";
  const fullTitle = `${title}　${fmt(last.c, 2)}  ${chgText(last.chg)}`;

  let view0 = Math.max(0, n - Math.min(n, 500));
  let view1 = Math.max(0, n - 1);

  const open = bars.map((b) => b.o);
  const high = bars.map((b) => b.h);
  const low = bars.map((b) => b.l);
  const close = bars.map((b) => b.c);

  function clampView() {
    view0 = Math.max(0, Math.min(view0, n - 1));
    view1 = Math.max(0, Math.min(view1, n - 1));
    if (view1 <= view0) view1 = Math.min(n - 1, view0 + 1);
  }

  function hoverTexts() {
    return xs.map((x, i) => {
      const b = bars[i];
      const chgTxt = chgText(b.chg);
      const sh =
        b.share == null || Number.isNaN(Number(b.share))
          ? null
          : fmt(b.share, 2) + "%";
      let t =
        "日期：" +
        x +
        "<br>开盘：" +
        fmt(b.o, 2) +
        "<br>最高：" +
        fmt(b.h, 2) +
        "<br>最低：" +
        fmt(b.l, 2) +
        "<br>收盘：" +
        fmt(b.c, 2) +
        "<br>涨跌幅：" +
        chgTxt;
      if (sh != null) t += "<br>相对成交占大盘比例：" + sh;
      return t;
    });
  }

  function draw() {
    clampView();
    const texts = hoverTexts();
    const trace = {
      type: "candlestick",
      x: xs,
      open,
      high,
      low,
      close,
      text: texts,
      hovertext: texts,
      hoverinfo: "text",
      increasing: { line: { color: "#c23b22" }, fillcolor: "#c23b22" },
      decreasing: { line: { color: "#1f8a4c" }, fillcolor: "#1f8a4c" },
      name: "热点指数",
    };
    const layout = {
      title: {
        text: fullTitle,
        font: {
          size: 15,
          color: titleColor,
          family: "Microsoft YaHei, PingFang SC, sans-serif",
        },
        x: 0.01,
        xanchor: "left",
      },
      margin: { l: 16, r: 56, t: 44, b: 12 },
      dragmode: "pan",
      hovermode: "x",
      showlegend: false,
      font: {
        color: "#c4c7cc",
        family: "Microsoft YaHei, PingFang SC, sans-serif",
      },
      xaxis: {
        type: "category",
        categoryorder: "array",
        categoryarray: xs,
        range: [view0 - 0.5, view1 + 0.5],
        rangeslider: { visible: false },
        showticklabels: false,
        showgrid: false,
        zeroline: false,
        showline: false,
        ticks: "",
        title: "",
        showspikes: true,
        spikemode: "across",
        spikecolor: "rgba(255,80,80,0.85)",
        spikedash: "dot",
        spikethickness: 1,
        fixedrange: false,
      },
      yaxis: {
        side: "right",
        fixedrange: true,
        tickformat: ",.2f",
        title: "",
        range: yRangeForView(),
        showspikes: true,
        spikecolor: "rgba(255,80,80,0.55)",
        gridcolor: "rgba(255,255,255,0.08)",
        zeroline: false,
        tickfont: { color: "#9aa0a6" },
      },
      paper_bgcolor: "#0f1115",
      plot_bgcolor: "#0f1115",
      hoverlabel: {
        bgcolor: "#1c1f26",
        font: {
          color: "#e8eaed",
          family: "Microsoft YaHei, PingFang SC, sans-serif",
        },
        bordercolor: "#3c4048",
      },
    };
    const cfg = {
      scrollZoom: false,
      displayModeBar: false,
      displaylogo: false,
      responsive: true,
    };
    return Plotly.react(el, [trace], layout, cfg).then(() => {
      bindAutoY();
      return syncYOnly();
    });
  }

  /** 可视窗口内高低点 → Y 轴：拖到 07–08 等早年时自动放大形态 */
  function yRangeForView(v0 = view0, v1 = view1) {
    const i0 = Math.max(0, Math.floor(Math.min(v0, v1)));
    const i1 = Math.min(n - 1, Math.ceil(Math.max(v0, v1)));
    let ymin = Infinity;
    let ymax = -Infinity;
    for (let i = i0; i <= i1; i++) {
      ymin = Math.min(ymin, low[i], open[i], close[i]);
      ymax = Math.max(ymax, high[i], open[i], close[i]);
    }
    if (!Number.isFinite(ymin) || !Number.isFinite(ymax)) return [0, 1];
    if (ymax - ymin < 1e-6) {
      const mid = (ymin + ymax) / 2;
      return [mid - 0.5, mid + 0.5];
    }
    const pad = (ymax - ymin) * 0.1;
    return [ymin - pad, ymax + pad];
  }

  function readXRangeFromEvent(ev) {
    if (!ev) return null;
    if (Array.isArray(ev["xaxis.range"]) && ev["xaxis.range"].length === 2) {
      return [Number(ev["xaxis.range"][0]), Number(ev["xaxis.range"][1])];
    }
    const a = ev["xaxis.range[0]"];
    const b = ev["xaxis.range[1]"];
    if (a != null && b != null) return [Number(a), Number(b)];
    return null;
  }

  function readXRangeFromLayout() {
    const xa = el._fullLayout && el._fullLayout.xaxis;
    if (!xa || !xa.range || xa.range.length < 2) return null;
    return [Number(xa.range[0]), Number(xa.range[1])];
  }

  /** 只改 Y，不回写 X，避免拖拽时视野被越改越小 */
  function syncYOnly(xRange) {
    const xr = xRange || readXRangeFromLayout();
    if (xr) {
      view0 = xr[0] + 0.5;
      view1 = xr[1] - 0.5;
      clampView();
    } else {
      clampView();
    }
    const yr = yRangeForView();
    el._hotSkipRelayout = true;
    const done = () => {
      el._hotSkipRelayout = false;
    };
    return Plotly.relayout(el, {
      "yaxis.autorange": false,
      "yaxis.range": yr,
    }).then(done, done);
  }

  function bindAutoY() {
    if (el._hotRelayoutHandler) {
      try {
        el.removeListener("plotly_relayout", el._hotRelayoutHandler);
      } catch (_) {}
      try {
        el.removeListener("plotly_relayouting", el._hotRelayoutHandler);
      } catch (_) {}
    }
    let raf = 0;
    el._hotRelayoutHandler = (ev) => {
      if (!ev || el._hotSkipRelayout) return;
      // 拖拽过程/结束：只要 X 变了就按窗口重算 Y
      const xr = readXRangeFromEvent(ev) || readXRangeFromLayout();
      if (!xr && !ev["xaxis.range[0]"] && !ev["xaxis.range"] && !ev["xaxis.autorange"]) {
        return;
      }
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        raf = 0;
        syncYOnly(xr);
      });
    };
    el.on("plotly_relayout", el._hotRelayoutHandler);
    el.on("plotly_relayouting", el._hotRelayoutHandler);
  }

  function indexAtPointer(clientX) {
    const xaxis = el._fullLayout && el._fullLayout.xaxis;
    const rect = el.getBoundingClientRect();
    let left = rect.left;
    let width = Math.max(1, rect.width);
    if (xaxis && (xaxis._offset || xaxis._offset === 0) && xaxis._length) {
      left = rect.left + xaxis._offset;
      width = xaxis._length;
    }
    const r = Math.min(1, Math.max(0, (clientX - left) / width));
    return view0 + r * (view1 - view0);
  }

  function applyRange() {
    clampView();
    el._hotSkipRelayout = true;
    const done = () => {
      el._hotSkipRelayout = false;
    };
    Plotly.relayout(el, {
      "xaxis.range": [view0 - 0.5, view1 + 0.5],
      "yaxis.autorange": false,
      "yaxis.range": yRangeForView(),
    }).then(done, done);
  }

  function zoomStockStyle(zoomIn, clientX) {
    const MIN_BARS = 20;
    const MAX_BARS = n;
    let span = Math.max(1, view1 - view0);
    let newSpan = zoomIn ? span / 1.25 : span * 1.25;
    newSpan = Math.max(MIN_BARS, Math.min(MAX_BARS, Math.round(newSpan)));
    const atRightEdge = view1 >= n - 1.05;
    if (atRightEdge) {
      view1 = n - 1;
      view0 = view1 - newSpan;
      if (view0 < 0) {
        view0 = 0;
        view1 = Math.min(n - 1, view0 + newSpan);
      }
    } else {
      const c = indexAtPointer(clientX);
      const oldSpan = Math.max(1e-9, span);
      const rel = (c - view0) / oldSpan;
      view0 = c - rel * newSpan;
      view1 = view0 + newSpan;
      if (view0 < 0) {
        view0 = 0;
        view1 = newSpan;
      }
      if (view1 > n - 1) {
        view1 = n - 1;
        view0 = Math.max(0, view1 - newSpan);
      }
    }
    applyRange();
  }

  function panBy(barsN) {
    view0 += barsN;
    view1 += barsN;
    if (view0 < 0) {
      view1 -= view0;
      view0 = 0;
    }
    if (view1 > n - 1) {
      view0 -= view1 - (n - 1);
      view1 = n - 1;
    }
    applyRange();
  }

  function switchIndustry(delta) {
    if (!enableWheelSwitch || !switchCodes.length || !onSwitch) return;
    let i = switchCodes.indexOf(currentCode);
    if (i < 0) i = 0;
    i = (i + delta + switchCodes.length) % switchCodes.length;
    onSwitch(switchCodes[i]);
  }

  if (el._hotWheel) el.removeEventListener("wheel", el._hotWheel);
  el._hotWheel = function (e) {
    e.preventDefault();
    e.stopPropagation();
    if (e.ctrlKey) {
      zoomStockStyle(e.deltaY < 0, e.clientX);
    } else if (e.shiftKey) {
      const step = Math.max(2, Math.round((view1 - view0) * 0.12));
      panBy(e.deltaY < 0 ? step : -step);
    } else if (enableWheelSwitch) {
      switchIndustry(e.deltaY > 0 ? 1 : -1);
    }
  };
  el.addEventListener("wheel", el._hotWheel, { passive: false });

  return draw();
}

function labelOf(r) {
  const share = r.share != null ? fmt(r.share, 1) + "%" : "—";
  return `${r.code} ${r.name} | ${chgText(r.chg)} | ${share}`;
}

function radioHTML(rows, current, title) {
  if (!rows.length) return "";
  return `
    <div class="list-title">${title}</div>
    <div class="radio-list">
      ${rows
        .map(
          (r) => `
        <label class="radio-item ${r.code === current ? "active" : ""}" data-code="${r.code}">
          <input type="radio" name="ind" ${r.code === current ? "checked" : ""} />
          <span class="lbl">${labelOf(r)}</span>
        </label>`
        )
        .join("")}
    </div>`;
}

async function main() {
  const [market, indLite] = await Promise.all([
    loadJSON("./data/market.json"),
    loadJSON("./data/industries.json"),
  ]);
  dataVer = String(indLite.day || market.end || dataVer);
  const all = indLite.industries.slice();
  const last = market.last;

  // 全历史约 8600+ 根；偏少说明吃到了旧截断文件
  if (!market.bars || market.bars.length < 8000) {
    throw new Error(
      `大盘数据不完整：仅 ${market.bars ? market.bars.length : 0} 根，期望全历史约 8684 根`
    );
  }

  $("mktMetrics").innerHTML = `
    <div class="metric">
      <div class="label">最新交易日</div>
      <div class="value">${last.d}</div>
    </div>
    <div class="metric">
      <div class="label">大盘热点指数</div>
      <div class="value">${fmt(last.c, 1)}</div>
      <div class="delta ${chgClass(last.chg)}">${chgText(last.chg)}</div>
    </div>
  `;

  await renderKline($("mktChart"), market.bars, {
    title: "全市场热点指数",
    enableWheelSwitch: false,
  });

  $("topTitle").textContent = `② 当日最强热点前三名（${indLite.day}）`;
  const top3 = [...all].sort((a, b) => b.chg - a.chg).slice(0, 3);
  $("top3").innerHTML = top3
    .map(
      (r, i) => `
    <div class="card">
      <div class="rank">第${i + 1}名 · ${r.code}</div>
      <h3>${r.name}</h3>
      <div class="${chgClass(r.chg)}">${chgText(r.chg)}</div>
      <div class="meta">点位 <b>${fmt(r.close, 1)}</b>${
        r.share != null
          ? ` · 相对成交占大盘比例 <b>${fmt(r.share, 2)}%</b>`
          : ""
      }</div>
      <button type="button" data-code="${r.code}">查看该行业</button>
    </div>`
    )
    .join("");

  const topChg = [...all].sort((a, b) => b.chg - a.chg).slice(0, 10);
  const topShare = [...all]
    .sort((a, b) => (b.share ?? -1) - (a.share ?? -1))
    .slice(0, 10);
  const pinned = new Set([...topChg, ...topShare].map((x) => x.code));
  const rest = [...all]
    .filter((x) => !pinned.has(x.code))
    .sort((a, b) => b.chg - a.chg);

  const params = new URLSearchParams(location.search);
  let current =
    params.get("ind") && all.some((x) => x.code === params.get("ind"))
      ? params.get("ind")
      : topChg[0]?.code || all[0].code;

  const listsEl = $("lists");
  let switchCodes = all
    .slice()
    .sort((a, b) => b.chg - a.chg)
    .map((x) => x.code);

  function paintLists(filter = "") {
    const q = filter.trim().toLowerCase();
    if (q) {
      const rows = all.filter(
        (r) =>
          r.code.toLowerCase().includes(q) || r.name.toLowerCase().includes(q)
      );
      switchCodes = rows.map((x) => x.code);
      listsEl.innerHTML = rows.length
        ? radioHTML(rows, current, `搜索结果（${rows.length}）`)
        : `<div class="empty">没有匹配的行业</div>`;
      return;
    }
    switchCodes = all
      .slice()
      .sort((a, b) => b.chg - a.chg)
      .map((x) => x.code);
    const restOpen = rest.some((r) => r.code === current);
    listsEl.innerHTML = `
      ${radioHTML(topChg, current, "涨跌幅前十")}
      <div style="height:0.55rem"></div>
      ${radioHTML(topShare, current, "相对成交占大盘前十")}
      <details class="rest" ${restOpen ? "open" : ""}>
        <summary>其他全部行业（${rest.length}）</summary>
        ${radioHTML(rest, current, "其他行业")}
      </details>`;
  }

  async function selectIndustry(code, { scroll = false } = {}) {
    current = code;
    const url = new URL(location.href);
    url.searchParams.set("ind", code);
    history.replaceState(null, "", url);
    paintLists($("q").value);

    const lite = all.find((x) => x.code === code);
    $("indMetrics").innerHTML = `
      <div class="metric"><div class="label">行业代码</div><div class="value">${code}</div></div>
      <div class="metric">
        <div class="label">热点指数</div>
        <div class="value">${lite ? fmt(lite.close, 1) : "—"}</div>
        <div class="delta ${lite ? chgClass(lite.chg) : ""}">${lite ? chgText(lite.chg) : ""}</div>
      </div>
      <div class="metric">
        <div class="label">相对成交占大盘比例</div>
        <div class="value">${lite && lite.share != null ? fmt(lite.share, 2) + "%" : "—"}</div>
      </div>
    `;
    $("indName").textContent = lite ? lite.name : "";

    try {
      const full = await loadIndustryBars(code);
      await renderKline($("indChart"), full.bars, {
        title: `${full.code} ${full.name}`,
        enableWheelSwitch: true,
        switchCodes,
        currentCode: code,
        onSwitch: (next) => selectIndustry(next),
      });
    } catch (e) {
      console.error(e);
    }
    if (scroll) $("industry").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  listsEl.addEventListener("click", (e) => {
    const item = e.target.closest("[data-code]");
    if (item) selectIndustry(item.dataset.code);
  });
  $("top3").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-code]");
    if (btn) selectIndustry(btn.dataset.code, { scroll: true });
  });
  $("q").addEventListener("input", () => {
    paintLists($("q").value);
  });

  await selectIndustry(current);
  window.addEventListener("resize", () => {
    Plotly.Plots.resize($("mktChart"));
    Plotly.Plots.resize($("indChart"));
  });
}

main().catch((err) => {
  console.error(err);
  document.querySelector(".wrap").insertAdjacentHTML(
    "afterbegin",
    `<div class="disc" style="color:#c23b22">数据加载失败，请确认 web/data 下已有 JSON 数据</div>`
  );
});

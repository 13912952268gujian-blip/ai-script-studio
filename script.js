/* ======================================================================
   AI 剧本创作 · 信息确认页  — 交互脚本
   ----------------------------------------------------------------------
   - 文件上传（拖拽 + 选择）按类型落到不同 slot
   - 文件 / 链接预览 modal
   - 导入识别填充：链接 / 文件 tab → 模拟 AI 识别 → 自动填表
   - 选择已有商品：商品库 + 搜索 + 一键填表
   - AI 信息行可编辑 / 展开更多
   - 主按钮：分析中 → 完成 → 切换到第 2 步
   - 表单字段字数实时计数 + 核心卖点 tag CRUD
   - 草稿自动保存到 localStorage，刷新可还原
   ====================================================================== */

(function () {
  "use strict";

  /* =========================================================
     0. 工具
     ========================================================= */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  const fmtSize = (b) => {
    if (b < 1024) return b + " B";
    if (b < 1024 * 1024) return (b / 1024).toFixed(1) + " KB";
    return (b / 1024 / 1024).toFixed(1) + " MB";
  };

  const isImage = (f) => f.type.startsWith("image/") || /\.(png|jpe?g|gif|webp)$/i.test(f.name);
  const isVideo = (f) => f.type.startsWith("video/") || /\.(mp4|mov|webm|m4v)$/i.test(f.name);
  const isPdf = (f) => f.type.includes("pdf") || /\.pdf$/i.test(f.name);
  const isDoc = (f) =>
    /\.(txt|docx?|md|csv|json)$/i.test(f.name) || f.type.startsWith("text/");

  function slotType(file) {
    if (isImage(file)) return "image";
    if (isVideo(file)) return "video";
    if (isDoc(file)) return "doc";
    return "other";
  }

  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[c]));
  }

  function toast(text, kind) {
    const t = $("#toast");
    if (!t) return;
    t.className = "toast" + (kind ? " toast-" + kind : "");
    t.textContent = text;
    t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => {
      t.classList.add("toast-out");
      setTimeout(() => {
        t.hidden = true;
        t.classList.remove("toast-out");
      }, 220);
    }, 1800);
  }

  /* =========================================================
     1. 全局数据 / 草稿
     ========================================================= */
  const STATE = {
    idea: "",
    inputs: {},
    tags: [],
    resources: [], // { id, name, size, type, url?, kind, link? }
    images: [], // { id, url, file? }
    ai: {}, // key -> value
    selectedProduct: null
  };

  const DRAFT_KEY = "ai-script-studio-draft";

  function saveDraft(silent) {
    try {
      const payload = {
        idea: STATE.idea,
        inputs: STATE.inputs,
        tags: STATE.tags,
        ai: STATE.ai,
        resources: STATE.resources
          .filter((r) => r.link)
          .map((r) => ({ id: r.id, name: r.name, link: r.link, kind: r.kind })),
        selectedProduct: STATE.selectedProduct
      };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
      if (!silent) toast("草稿已保存", "success");
    } catch (e) {
      console.warn(e);
      if (!silent) toast("保存失败：浏览器禁用了本地存储", "error");
    }
  }

  function loadDraft() {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);

      if (data.idea != null) $("#idea").value = data.idea;
      if (data.inputs) {
        Object.entries(data.inputs).forEach(([k, v]) => {
          const el = document.getElementById(k);
          if (el) el.value = v;
        });
      }
      if (Array.isArray(data.tags)) renderTags(data.tags);
      if (data.ai) renderAI(data.ai, false);
      if (Array.isArray(data.resources)) {
        data.resources.forEach(addResource);
      }
      updateAllCounters();
      reRenderEmptyHints();
    } catch (e) {
      console.warn(e);
    }
  }

  /* =========================================================
     2. 计数 / idea / 各 input / tags
     ========================================================= */
  const COUNTER_MAP = {
    idea: { el: "ideaCount", max: 500 },
    fName: { el: "fNameCount", max: 50 },
    fBrand: { el: "fBrandCount", max: 30 },
    fAudience: { el: "fAudienceCount", max: 100 },
    fSpec: { el: "fSpecCount", max: 50 }
  };

  function bindCounter(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("input", () => {
      const c = COUNTER_MAP[id];
      if (!c) return;
      const cnt = el.value.length;
      const out = document.getElementById(c.el);
      if (out) out.textContent = cnt;
      STATE.inputs[id] = el.value;
      if (id === "idea") STATE.idea = el.value;
      saveDraft(true);
    });
  }
  Object.keys(COUNTER_MAP).forEach(bindCounter);

  function updateAllCounters() {
    Object.entries(COUNTER_MAP).forEach(([id, c]) => {
      const el = document.getElementById(id);
      const out = document.getElementById(c.el);
      if (el && out) out.textContent = el.value.length;
    });
  }

  /* tags */
  function renderTags(list) {
    const wrap = $("#fTags");
    if (!wrap) return;
    wrap.querySelectorAll(".tag").forEach((t) => t.remove());
    STATE.tags = Array.isArray(list) ? [...list] : [];
    STATE.tags.forEach(insertTag);
    updateTagsCount();
  }
  function insertTag(text) {
    const wrap = $("#fTags");
    if (!wrap) return;
    const span = document.createElement("span");
    span.className = "tag";
    span.innerHTML = `${escapeHTML(text)} <button class="tag-x" type="button">×</button>`;
    wrap.insertBefore(span, wrap.querySelector(".tag-input-field"));
    span.querySelector(".tag-x").addEventListener("click", () => removeTag(span));
  }
  function removeTag(span) {
    const text = span.firstChild ? span.firstChild.textContent.trim() : "";
    span.remove();
    STATE.tags = STATE.tags.filter((t) => t !== text);
    updateTagsCount();
    saveDraft(true);
  }
  function updateTagsCount() {
    const out = $("#fTagsCount");
    if (!out) return;
    const total = STATE.tags.reduce((s, t) => s + t.length, 0);
    out.textContent = total;
  }

  $("#fTags .tag-input-field")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.currentTarget.value.trim()) {
      e.preventDefault();
      const text = e.currentTarget.value.trim();
      if (text.length > 30) return toast("单个标签请控制在 30 字内", "error");
      insertTag(text);
      STATE.tags.push(text);
      updateTagsCount();
      e.currentTarget.value = "";
      saveDraft(true);
    }
  });

  /* ai grid 行内编辑 */
  function renderAI(map, flash) {
    Object.entries(map).forEach(([k, v]) => {
      const row = document.querySelector(`.ai-row[data-key="${k}"] .ai-v`);
      if (!row) return;
      row.textContent = v || "";
      if (flash) {
        row.parentElement.classList.remove("new");
        // reflow
        void row.parentElement.offsetWidth;
        row.parentElement.classList.add("new");
      }
    });
  }

  function bindAI() {
    $$(".ai-row .ai-v").forEach((v) => {
      v.addEventListener("input", () => {
        const k = v.parentElement.dataset.key;
        STATE.ai[k] = v.textContent.trim();
        saveDraft(true);
      });
      v.addEventListener("blur", () => {
        v.textContent = v.textContent.trim();
      });
    });
  }
  bindAI();

  /* ai 更多 */
  $("#aiMore")?.addEventListener("click", () => {
    const grid = $("#aiGrid");
    const extra = [
      ["卡牌工艺", "覆膜 + UV 局部"],
      ["卡牌类型", "集换式 TCG"],
      ["稀有度", "N/R/SR/SSR/UR"],
      ["包装方式", "铝箔密封袋"],
      ["产地", "日本"]
    ];
    extra.forEach(([k, v]) => {
      if (grid.querySelector(`.ai-row[data-key="${k}"]`)) return;
      const row = document.createElement("div");
      row.className = "ai-row";
      row.dataset.key = k;
      row.innerHTML = `<div class="ai-k">${k}</div><div class="ai-v" contenteditable="true">${v}</div>`;
      grid.appendChild(row);
      const v2 = row.querySelector(".ai-v");
      STATE.ai[k] = v;
      v2.addEventListener("input", () => {
        STATE.ai[k] = v2.textContent.trim();
        saveDraft(true);
      });
      row.classList.add("new");
    });
    $("#aiMore").textContent = "已展开全部";
    $("#aiMore").style.pointerEvents = "none";
    saveDraft(true);
  });

  /* =========================================================
     3. 文件 / 资源 slot 上传
     ========================================================= */

  // 左卡 4 个 slot 的 + 按钮，按需显示
  function ensureSlotEmptyHints() {
    $$(".slot-list").forEach((list) => {
      const has = list.children.length > 0;
      let hint = list.parentElement.querySelector(".empty-hint");
      let drop = list.parentElement.querySelector(".field-dropzone");
      if (!has) {
        if (!hint) {
          hint = document.createElement("div");
          hint.className = "empty-hint";
          hint.textContent = "还没有文件，点击下方“添加”选择或拖拽文件";
          list.parentElement.appendChild(hint);
        }
        if (!drop) {
          drop = buildFieldDropzone(list.dataset.list);
          list.parentElement.appendChild(drop);
        }
      } else {
        if (hint) hint.remove();
        if (drop) drop.remove();
      }
    });
  }

  function buildFieldDropzone(kind) {
    const dz = document.createElement("label");
    dz.className = "field-dropzone";
    dz.innerHTML = `
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/></svg>
      <div class="dropzone-text">${
        kind === "image"
          ? "支持 jpg / png / webp，单次最多 20 张"
          : kind === "video"
          ? "支持 mp4 / mov，单个 ≤ 200MB"
          : kind === "doc"
          ? "支持 txt / doc / pdf / md"
          : "支持任意格式，单个 ≤ 200MB"
      }</div>
      <div class="dropzone-action">+ 添加文件</div>
      <input type="file" ${
        kind === "image" ? "accept=\"image/*\" multiple" : "multiple"
      } hidden />
    `;
    const input = dz.querySelector("input");
    input.addEventListener("change", () => {
      const files = Array.from(input.files || []);
      if (!files.length) return;
      // 校验 image 类型只在 image slot
      if (kind === "image") {
        const only = files.filter(isImage);
        if (only.length !== files.length) {
          toast("仅支持 jpg / png / webp 图片", "error");
          return;
        }
      } else if (kind === "video" && files.some((f) => !isVideo(f))) {
        toast("仅支持 mp4 / mov 视频", "error");
        return;
      } else if (kind === "doc" && files.some((f) => isImage(f) || isVideo(f))) {
        toast("剧本参考请上传文档类文件", "error");
        return;
      }
      files.forEach((f) => addSlotFile(f, kind));
      input.value = "";
    });

    // drag
    dz.addEventListener("dragover", (e) => {
      e.preventDefault();
      dz.classList.add("dragover");
    });
    dz.addEventListener("dragleave", () => dz.classList.remove("dragover"));
    dz.addEventListener("drop", (e) => {
      e.preventDefault();
      dz.classList.remove("dragover");
      const files = Array.from(e.dataTransfer.files || []);
      if (!files.length) return;
      files.forEach((f) => addSlotFile(f, kind));
    });
    return dz;
  }

  // 右下资源区 dropzone
  $("#dropzone-resource")?.addEventListener("click", () => $("#globalFile").click());
  $("#dropzone-resource")?.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.currentTarget.classList.add("dragover");
  });
  $("#dropzone-resource")?.addEventListener("dragleave", (e) =>
    e.currentTarget.classList.remove("dragover")
  );
  $("#dropzone-resource")?.addEventListener("drop", (e) => {
    e.preventDefault();
    e.currentTarget.classList.remove("dragover");
    const files = Array.from(e.dataTransfer.files || []);
    files.forEach((f) => addResourceFile(f));
  });
  $("#globalFile")?.addEventListener("change", (e) => {
    const files = Array.from(e.currentTarget.files || []);
    files.forEach((f) => addResourceFile(f));
    e.currentTarget.value = "";
  });

  /* 给 slot 加文件 */
  function addSlotFile(file, forcedKind) {
    const kind = forcedKind || slotType(file);
    if (kind === "image") {
      const url = URL.createObjectURL(file);
      const item = { id: "img-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6), url, file, name: file.name };
      STATE.images.push(item);
      renderImageSlot();
      saveDraft(true);
      return;
    }
    const item = {
      id: "f-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
      name: file.name,
      size: file.size,
      kind,
      type: file.type,
      url: isVideo(file) ? URL.createObjectURL(file) : null
    };
    renderSingleSlot(kind, item);
    saveDraft(true);
  }

  function addResourceFile(file) {
    const item = {
      id: "r-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
      kind: slotType(file),
      type: file.type,
      name: file.name,
      size: file.size,
      preview: isImage(file) ? URL.createObjectURL(file) : null,
      file
    };
    addResource(item);
    saveDraft(true);
  }

  function renderSingleSlot(kind, item) {
    const list = document.querySelector(`.slot-list[data-list="${kind}"]`);
    if (!list) return;
    const row = document.createElement("div");
    row.className = "file-row slot-add";
    row.dataset.id = item.id;

    let left = "";
    if (kind === "video") {
      left = `<div class="file-thumb video" aria-hidden="true"><span class="thumb-label">VIDEO</span></div>`;
    } else {
      left = `<div class="file-icon doc"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h6"/></svg></div>`;
    }

    row.innerHTML = `
      ${left}
      <div class="file-info">
        <div class="file-name">${escapeHTML(item.name)}</div>
        <div class="file-meta">${kind === "video" ? "视频文件 · " : kind === "doc" ? "文档 · " : ""}${fmtSize(item.size)}</div>
      </div>
      <button class="icon-btn preview" title="预览">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
      </button>
      <button class="icon-btn danger remove" title="删除">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
      </button>
    `;

    row.querySelector(".preview").addEventListener("click", () =>
      openPreview({ title: item.name, kind, name: item.name, url: item.url, size: item.size })
    );
    row.querySelector(".remove").addEventListener("click", () => {
      row.classList.add("removing");
      setTimeout(() => {
        row.remove();
        ensureSlotEmptyHints();
      }, 200);
      if (item.url) URL.revokeObjectURL(item.url);
      STATE.resources = STATE.resources.filter((r) => r.id !== item.id);
    });

    list.appendChild(row);
    ensureSlotEmptyHints();
  }

  function renderImageSlot() {
    const list = document.querySelector('.slot-list[data-list="image"]');
    if (!list) return;
    list.innerHTML = "";
    if (!STATE.images.length) {
      ensureSlotEmptyHints();
      return;
    }
    const row = document.createElement("div");
    row.className = "file-row image-grid-row slot-add";
    row.innerHTML = `
      <div class="file-info">
        <div class="file-name">图片参考 <span style="color:#94a0b3;font-weight:400;">(${STATE.images.length} 张)</span></div>
        <div class="image-grid">
          ${STATE.images
            .map(
              (img) => `<div class="image-thumb" style="background-image:url('${img.url}')" data-id="${img.id}">
                <button class="remove" title="删除">×</button>
              </div>`
            )
            .join("")}
        </div>
      </div>
      <button class="icon-btn preview-all" title="预览全部">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
      </button>
    `;

    // 单独缩略图删除
    row.querySelectorAll(".image-thumb").forEach((t) => {
      t.querySelector(".remove").addEventListener("click", (e) => {
        e.stopPropagation();
        const id = t.dataset.id;
        const item = STATE.images.find((i) => i.id === id);
        if (item) URL.revokeObjectURL(item.url);
        STATE.images = STATE.images.filter((i) => i.id !== id);
        renderImageSlot();
      });
      t.addEventListener("click", () => {
        const item = STATE.images.find((i) => i.id === t.dataset.id);
        if (item)
          openPreview({
            title: item.name || "图片",
            kind: "image",
            url: item.url,
            size: (item.file && item.file.size) || 0
          });
      });
    });
    row.querySelector(".preview-all").addEventListener("click", () => {
      // 大图轮播
      let i = 0;
      const next = () => {
        const it = STATE.images[i];
        if (!it) return;
        openPreview({
          title: `${it.name || "图片"} (${i + 1}/${STATE.images.length})`,
          kind: "image",
          url: it.url,
          size: (it.file && it.file.size) || 0,
          extra: STATE.images.length > 1
            ? `<button class="modal-nav" data-d="-1">‹</button><button class="modal-nav" data-d="1">›</button>`
            : ""
        });
        const prev = $(".modal-preview-box .modal-nav[data-d='-1']");
        const nxt = $(".modal-preview-box .modal-nav[data-d='1']");
        if (prev) prev.onclick = () => { i = (i - 1 + STATE.images.length) % STATE.images.length; next(); closeModal(false); setTimeout(next, 50); };
        if (nxt) nxt.onclick = () => { i = (i + 1) % STATE.images.length; next(); closeModal(false); setTimeout(next, 50); };
      };
      next();
    });
    list.appendChild(row);
    ensureSlotEmptyHints();
  }

  /* =========================================================
     4. 资源区
     ========================================================= */
  function addResource(item) {
    const list = $("#resourceList");
    if (!list) return;
    if (list.querySelector(".resource-empty")) list.innerHTML = "";

    const li = document.createElement("li");
    li.className = "resource-item slot-add";
    li.dataset.id = item.id;

    let iconClass = "";
    let iconSvg = "";
    if (item.kind === "image") {
      iconClass = "";
      iconSvg = `<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M21 17l-5-5-9 9"/>`;
    } else if (item.link) {
      iconClass = "link";
      iconSvg = `<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>`;
    } else if (item.kind === "video") {
      iconClass = "";
      iconSvg = `<path d="M5 4l14 8-14 8V4z"/>`;
    } else {
      iconClass = "pdf";
      iconSvg = `<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>`;
    }

    li.innerHTML = `
      <div class="resource-icon ${iconClass}"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${iconSvg}</svg></div>
      <div class="resource-main">
        <div class="resource-name">${escapeHTML(item.name || item.title || item.link || "资源")}</div>
        <div class="resource-sub">${
          item.link
            ? `<a class="resource-link" href="${escapeHTML(item.link)}" target="_blank" rel="noopener">${escapeHTML(item.link)}</a>`
            : item.kind === "image"
            ? "图片"
            : item.kind === "video"
            ? "视频"
            : (item.type && item.type.includes("pdf")) || /\.pdf$/i.test(item.name || "")
            ? "PDF 文档"
            : "文档"
        }${item.size ? " · " + fmtSize(item.size) : ""}</div>
      </div>
      <button class="icon-btn preview" title="预览">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
      </button>
      <button class="icon-btn danger remove" title="删除">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
      </button>
    `;

    li.querySelector(".preview").addEventListener("click", () => {
      openPreview({
        title: item.name || item.link || "资源",
        kind: item.kind,
        url: item.preview || item.url || null,
        size: item.size || 0,
        link: item.link || null
      });
    });
    li.querySelector(".remove").addEventListener("click", () => {
      li.classList.add("removing");
      setTimeout(() => {
        li.remove();
        STATE.resources = STATE.resources.filter((r) => r.id !== item.id);
        if (!STATE.resources.length) {
          $("#resourceList").innerHTML = `<li class="resource-item resource-empty"><div class="resource-main resource-main-empty">尚未导入任何资料，使用顶部「导入识别填充」自动上传并识别，或在下方手动添加。</div></li>`;
        }
        saveDraft(true);
      }, 200);
    });

    $("#resourceList").appendChild(li);
    STATE.resources.push({ ...item, file: undefined });
  }

  /* =========================================================
     5. 预览 Modal
     ========================================================= */
  function openPreview({ title, kind, url, size, link, extra }) {
    $("#previewTitle").textContent = title || "预览";
    const body = $("#previewBody");
    const meta = $("#previewMeta");
    body.innerHTML = "";
    body.removeAttribute("style");
    body.style.cssText = "";

    if (extra) body.innerHTML = extra;

    if (kind === "image" && url) {
      body.innerHTML = `<img src="${url}" alt="" />`;
    } else if (kind === "video" && url) {
      body.innerHTML = `<video src="${url}" controls autoplay style="max-height:60vh;"></video>`;
    } else if (link) {
      body.innerHTML = `<div class="modal-preview-empty">
        <span class="ico">🔗</span>
        外部链接（演示模式，不会自动打开第三方网站）<br/>
        <a href="${escapeHTML(link)}" target="_blank" rel="noopener" style="color:#9bbcff;margin-top:8px;display:inline-block;">在新标签打开：${escapeHTML(link)}</a>
      </div>`;
    } else {
      body.innerHTML = `<div class="modal-preview-empty">
        <span class="ico">📄</span>
        文档预览暂未实现，可下载后查看
      </div>`;
    }

    let metaText = `类型：${kind || "未知"}`;
    if (size) metaText += ` · 大小：${fmtSize(size)}`;
    if (link) metaText += ` · 链接`;
    meta.innerHTML = `<b>${escapeHTML(title || "预览")}</b><span>${escapeHTML(metaText)}</span>`;

    openModal("modalPreview");
  }

  /* =========================================================
     6. 通用 Modal 控制
     ========================================================= */
  function openModal(id) {
    const m = document.getElementById(id);
    if (!m) return;
    m.classList.add("open");
    m.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }
  function closeModal(silent) {
    $$(".modal.open").forEach((m) => {
      m.classList.remove("open");
      m.setAttribute("aria-hidden", "true");
    });
    document.body.style.overflow = "";
    if (silent === false) toast("已关闭");
  }
  $$(".modal [data-close]").forEach((b) =>
    b.addEventListener("click", (e) => {
      if (e.currentTarget.classList.contains("modal-mask")) return;
      closeModal();
    })
  );
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });

  /* =========================================================
     7. 顶部 · 导入识别填充
     ========================================================= */
  const PRODUCT_SAMPLES = {
    op05: {
      name: "不凡玩品 海贼王 OP05 新世界篇 收藏卡牌",
      brand: "不凡玩品 BUFFUN",
      category: "收藏卡牌",
      tags: ["官方正版", "稀有度高", "收藏价值", "精美卡牌设计", "拆卡惊喜感"],
      audience: "动漫爱好者,卡牌收藏玩家,送礼人群",
      price: "99",
      spec: "每包 5 张 / 每盒 30 包",
      ai: {
        材质: "纸质卡牌",
        系列: "海贼王 OP05 新世界篇",
        发行方: "BANDAI",
        适用年龄: "15 岁及以上"
      }
    },
    gundam: {
      name: "万代 RG 1/144 自由高达 Ver.GCP 拼装模型",
      brand: "BANDAI SPIRITS",
      category: "玩具模型",
      tags: ["官方正版", "细节精致", "可动人偶", "收藏价值", "拼装乐趣"],
      audience: "高达迷,拼装玩家,送礼人群",
      price: "138",
      spec: "1/144 比例 · 部件 200+",
      ai: {
        材质: "PS 塑料 + 橡胶",
        系列: "高达 SEED FREEDOM",
        发行方: "BANDAI SPIRITS",
        适用年龄: "14 岁及以上"
      }
    },
    skullpanda: {
      name: "POP MART SKULLPANDA 温度系列 盲盒手办",
      brand: "POP MART",
      category: "潮玩手办",
      tags: ["盲盒惊喜", "潮流收藏", "精美做工", "送礼佳品"],
      audience: "潮玩爱好者,送礼人群,年轻女性",
      price: "69",
      spec: "单只装 · 12 款常规 + 2 款隐藏",
      ai: {
        材质: "PVC + ABS",
        系列: "SKULLPANDA 温度系列",
        发行方: "POP MART",
        适用年龄: "15 岁及以上"
      }
    },
    galaxy: {
      name: "三星 Galaxy S25 Ultra 钛银 12+256GB",
      brand: "SAMSUNG",
      category: "数码产品",
      tags: ["旗舰性能", "AI 加持", "影像旗舰"],
      audience: "数码爱好者,商务人群",
      price: "9699",
      spec: "12GB+256GB / 钛银 / 国行",
      ai: {
        材质: "钛金属 + 玻璃",
        系列: "Galaxy S25 Ultra",
        发行方: "SAMSUNG",
        适用年龄: "全年龄"
      }
    },
    miniso: {
      name: "名创优品 草莓熊毛绒玩偶 30cm",
      brand: "MINISO",
      category: "毛绒玩具",
      tags: ["柔软毛绒", "可爱造型", "送礼首选"],
      audience: "学生党,送礼人群,儿童",
      price: "79",
      spec: "30cm · 多色可选",
      ai: {
        材质: "PP 棉 + 短绒",
        系列: "草莓熊系列",
        发行方: "名创优品",
        适用年龄: "3 岁及以上"
      }
    }
  };

  /* tabs */
  $$(".fill-tab").forEach((t) =>
    t.addEventListener("click", () => {
      $$(".fill-tab").forEach((x) => x.classList.remove("active"));
      t.classList.add("active");
      $$(".fill-panel").forEach((p) => p.classList.remove("active"));
      $(`.fill-panel[data-panel="${t.dataset.fillMode}"]`)?.classList.add("active");
    })
  );

  /* sample links */
  $$(".chip[data-sample-link]").forEach((b) =>
    b.addEventListener("click", () => {
      $("#fillLinkInput").value = b.dataset.sampleLink;
    })
  );

  /* fill 内的 file 处理 */
  const fillFiles = []; // 仅用于本次识别
  $("#fillDropzone")?.addEventListener("click", (e) => {
    if (e.target.tagName === "INPUT") return;
    $("#fillFileInput").click();
  });
  $("#fillDropzone")?.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.currentTarget.classList.add("dragover");
  });
  $("#fillDropzone")?.addEventListener("dragleave", (e) =>
    e.currentTarget.classList.remove("dragover")
  );
  $("#fillDropzone")?.addEventListener("drop", (e) => {
    e.preventDefault();
    e.currentTarget.classList.remove("dragover");
    const files = Array.from(e.dataTransfer.files || []);
    files.forEach((f) => {
      fillFiles.push(f);
      addFillFile(f);
    });
  });
  $("#fillFileInput")?.addEventListener("change", (e) => {
    Array.from(e.currentTarget.files || []).forEach((f) => {
      fillFiles.push(f);
      addFillFile(f);
    });
    e.currentTarget.value = "";
  });
  function addFillFile(f) {
    const wrap = $("#fillFiles");
    const row = document.createElement("div");
    row.className = "fill-file";
    row.innerHTML = `<span class="name">${escapeHTML(f.name)}</span><span class="size">${fmtSize(f.size)}</span>`;
    wrap.appendChild(row);
  }

  function resetFillModal() {
    fillFiles.length = 0;
    $("#fillFiles").innerHTML = "";
    $("#fillLinkInput").value = "";
    $("#fillProgress").hidden = true;
    $$(".fill-progress-step").forEach((s) =>
      s.classList.remove("active", "done")
    );
  }

  $("#btnFillImport")?.addEventListener("click", () => {
    resetFillModal();
    openModal("modalFill");
  });

  $("#btnFillGo")?.addEventListener("click", async () => {
    const link = $("#fillLinkInput").value.trim();
    const sample = link && Object.values(PRODUCT_SAMPLES).find((p) =>
      ["op05", "gundam", "skullpanda", "galaxy", "miniso"].some((k) => link.includes(k))
    );
    if (!link && !fillFiles.length) return toast("请粘贴商品链接或选择文件", "error");
    if (fillFiles.length) {
      fillFiles.forEach((f) => addResourceFile(f));
    }
    if (link) {
      addResource({
        id: "r-link-" + Date.now(),
        name: link.length > 30 ? link.slice(0, 28) + "..." : link,
        link,
        kind: "other"
      });
    }
    const progress = $("#fillProgress");
    progress.hidden = false;
    const steps = $$(".fill-progress-step");
    steps.forEach((s) => s.classList.remove("active", "done"));
    for (let i = 0; i < steps.length; i++) {
      steps[i].classList.add("active");
      await new Promise((r) => setTimeout(r, 600));
      steps[i].classList.remove("active");
      steps[i].classList.add("done");
    }
    // 选 sample 的话用它，否则用 op05 默认
    const product = sample || PRODUCT_SAMPLES.op05;
    applyProduct(product, true);
    toast("识别完成，已为您填表", "success");
    setTimeout(closeModal, 220);
  });

  /* =========================================================
     8. 顶部 · 选择已有商品
     ========================================================= */
  function renderPickGrid(filter) {
    const grid = $("#pickGrid");
    if (!grid) return;
    const q = (filter || "").toLowerCase().trim();
    const list = Object.entries(PRODUCT_SAMPLES).filter(([k, p]) => {
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.brand || "").toLowerCase().includes(q) ||
        (p.category || "").toLowerCase().includes(q)
      );
    });
    if (!list.length) {
      grid.innerHTML = `<div class="pick-empty">没找到匹配的商品</div>`;
      return;
    }
    grid.innerHTML = list
      .map(([k, p]) => {
        const coverStyles = {
          op05: ["#f4c150", "#c97c18", "#5a8cff", "#1d3a99", "#6c4ad6"],
          gundam: ["#1d3a99", "#3a4eb8", "#7c8fd8", "#9eb1eb", "#1f2c5c"],
          skullpanda: ["#e7c7d8", "#c39ec2", "#7a4d8f", "#3f2751", "#a17cba"],
          galaxy: ["#2a2a2a", "#444", "#9ba1ad", "#c8cdd6", "#1a1a1a"],
          miniso: ["#f5b7c8", "#f1d4dd", "#e08aa3", "#8fb9d4", "#5b95c6"]
        }[k] || ["#cad6f0", "#a8b5e0", "#7a8ec7", "#5a6faf", "#33457e"];
        return `
        <button class="pick-card" data-product="${k}">
          <div class="pick-card-img" style="background:linear-gradient(135deg, ${coverStyles[0]}, ${coverStyles[1]});">
            <div style="position:absolute;width:32px;height:46px;border-radius:4px;transform:rotate(-10deg) translate(-16px,0);background:linear-gradient(135deg,${coverStyles[2]},${coverStyles[3]});box-shadow:0 4px 10px rgba(0,0,0,.3);"></div>
            <div style="position:absolute;width:32px;height:46px;border-radius:4px;transform:rotate(0) translate(0,-2px);background:linear-gradient(135deg,${coverStyles[3]},${coverStyles[4]});box-shadow:0 4px 10px rgba(0,0,0,.3);"></div>
            <div style="position:absolute;width:32px;height:46px;border-radius:4px;transform:rotate(10deg) translate(16px,0);background:linear-gradient(135deg,${coverStyles[1]},${coverStyles[2]});box-shadow:0 4px 10px rgba(0,0,0,.3);"></div>
          </div>
          <div class="pick-card-name">${escapeHTML(p.name)}</div>
          <div class="pick-card-meta">${escapeHTML(p.brand || "")} · ${escapeHTML(p.category || "")} · ¥${escapeHTML(p.price || "")}</div>
        </button>`;
      })
      .join("");
    grid.querySelectorAll(".pick-card").forEach((c) =>
      c.addEventListener("click", () => {
        applyProduct(PRODUCT_SAMPLES[c.dataset.product], false);
        closeModal();
        toast("已根据该商品填表", "success");
      })
    );
  }

  $("#btnPickProduct")?.addEventListener("click", () => {
    renderPickGrid("");
    openModal("modalPick");
  });
  $("#pickSearch")?.addEventListener("input", (e) => renderPickGrid(e.currentTarget.value));

  /* 应用商品到表单 */
  function applyProduct(p, fillIdea) {
    if (!p) return;
    STATE.selectedProduct = p.name;
    $("#fName").value = p.name || "";
    $("#fNameCount").textContent = ($("#fName").value || "").length;
    $("#fBrand").value = p.brand || "";
    $("#fBrandCount").textContent = ($("#fBrand").value || "").length;
    $("#fCategory").value = p.category || "";
    renderTags(p.tags || []);
    $("#fAudience").value = p.audience || "";
    $("#fAudienceCount").textContent = ($("#fAudience").value || "").length;
    $("#fPrice").value = p.price || "";
    $("#fSpec").value = p.spec || "";
    $("#fSpecCount").textContent = ($("#fSpec").value || "").length;
    if (fillIdea && !$("#idea").value.trim()) {
      $("#idea").value = `通过商品资料理解：希望突出「${p.name}」在 ${(p.tags || []).slice(0, 3).join("、")} 等方面的特色，传递${p.audience || ""}的购买冲动。`;
      $("#ideaCount").textContent = ($("#idea").value || "").length;
    }
    renderAI(p.ai || {}, true);
    STATE.ai = { ...STATE.ai, ...p.ai };
    STATE.inputs["fName"] = p.name;
    STATE.inputs["fBrand"] = p.brand;
    STATE.inputs["fAudience"] = p.audience;
    STATE.inputs["fPrice"] = p.price;
    STATE.inputs["fSpec"] = p.spec;
    STATE.idea = $("#idea").value;
    saveDraft(true);
  }

  /* =========================================================
     9. 主按钮 · AI 分析并生成创作方向
     ========================================================= */
  $("#btnAnalyze")?.addEventListener("click", () => {
    if (!$("#idea").value.trim()) {
      toast("请先填写「我的想法」", "error");
      $("#idea").focus();
      return;
    }
    if (!$("#fName").value.trim()) {
      toast("请先填写「商品名称」", "error");
      return;
    }
    if (STATE.tags.length === 0) {
      toast("请至少添加一个「核心卖点」", "error");
      return;
    }
    openModal("modalAnalyze");
    $("#analyzeStage").hidden = false;
    $("#analyzeResult").hidden = true;

    const list = $("#analyzeList").querySelectorAll("li");
    list.forEach((li) => li.classList.remove("active", "done"));
    let i = 0;
    const tick = () => {
      if (i > 0) list[i - 1].classList.replace("active", "done");
      if (i >= list.length) {
        $("#analyzeStage").hidden = true;
        $("#analyzeResult").hidden = false;
        $("#page").classList.add("analyzed");
        return;
      }
      list[i].classList.add("active");
      i++;
      setTimeout(tick, 700);
    };
    tick();
  });

  $("#btnGoStep2")?.addEventListener("click", () => {
    closeModal();
    $("#analyzeStage").hidden = false;
    $("#analyzeResult").hidden = true;
    toast("已进入第 2 步（演示）", "success");
  });

  /* =========================================================
     10. 底部 · 清空 / 保存草稿
     ========================================================= */
  $("#btnClear")?.addEventListener("click", () => {
    if (!confirm("确认清空所有内容？\n（已上传的图片/视频将一并清除，但已保存到「导入的商品资料」里的链接不受影响）")) return;
    $$("input[type=text], textarea").forEach((el) => (el.value = ""));
    renderTags([]);
    Object.entries(COUNTER_MAP).forEach(([id, c]) => {
      document.getElementById(c.el).textContent = "0";
    });
    STATE.images = [];
    STATE.ai = {};
    renderAI({
      材质: "",
      系列: "",
      发行方: "",
      适用年龄: ""
    }, false);
    renderImageSlot();
    ensureSlotEmptyHints();
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch (e) {}
    toast("已清空", "success");
  });

  $("#btnSaveDraft")?.addEventListener("click", () => saveDraft(false));

  /* =========================================================
     11. 商品封面播放按钮（demo）
     ========================================================= */
  $("#productPlay")?.addEventListener("click", () => {
    openPreview({
      title: "商品视频预览（演示）",
      kind: "video",
      url: null,
      size: 0
    });
  });

  /* =========================================================
     12. 引导占位：当 slot 为空时显示可点击的 +
     ========================================================= */
  function reRenderEmptyHints() {
    ensureSlotEmptyHints();
    renderImageSlot();
  }
  reRenderEmptyHints();

  /* =========================================================
     13. 启动：恢复草稿
     ========================================================= */
  loadDraft();
  updateAllCounters();
  if (Object.keys(STATE.ai || {}).length === 0) {
    // 没草稿 → 给默认展示
    renderAI(PRODUCT_SAMPLES.op05.ai, false);
    STATE.ai = { ...PRODUCT_SAMPLES.op05.ai };
  } else {
    renderAI(STATE.ai, false);
  }
})();

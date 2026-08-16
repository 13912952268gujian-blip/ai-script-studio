(function () {
  // 字数计数
  const idea = document.getElementById("idea");
  const ideaCount = document.getElementById("ideaCount");
  if (idea && ideaCount) {
    const update = () => {
      ideaCount.textContent = idea.value.length;
    };
    idea.addEventListener("input", update);
    update();
  }

  // Tag 删除
  document.querySelectorAll(".tag-x").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const tag = e.currentTarget.closest(".tag");
      if (tag) tag.remove();
    });
  });

  // Tag 输入（回车添加演示项）
  const tagInput = document.querySelector(".tag-input-field");
  if (tagInput) {
    tagInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && tagInput.value.trim()) {
        e.preventDefault();
        const wrap = document.createElement("span");
        wrap.className = "tag";
        wrap.innerHTML =
          tagInput.value.trim() +
          '<button class="tag-x" type="button">×</button>';
        tagInput.parentElement.insertBefore(wrap, tagInput);
        const x = wrap.querySelector(".tag-x");
        x.addEventListener("click", () => wrap.remove());
        tagInput.value = "";
      }
    });
  }

  // 文件行 / 资源项删除
  document.querySelectorAll(".icon-btn.danger").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const row =
        e.currentTarget.closest(".file-row") ||
        e.currentTarget.closest(".resource-item");
      if (row) {
        row.style.transition = "opacity .2s ease, transform .2s ease";
        row.style.opacity = "0";
        row.style.transform = "translateX(6px)";
        setTimeout(() => row.remove(), 200);
      }
    });
  });

  // 主按钮点击演示
  const primary = document.querySelector(".btn-primary");
  if (primary) {
    primary.addEventListener("click", () => {
      const sub = primary.querySelector(".btn-primary-sub");
      const original = sub.textContent;
      sub.textContent = "正在分析中…";
      primary.style.pointerEvents = "none";
      setTimeout(() => {
        sub.textContent = original;
        primary.style.pointerEvents = "";
        alert("演示：下一步跳转到 AI 分析推荐页");
      }, 900);
    });
  }

  // 清空内容
  const clearBtn = document.querySelector(".btn-ghost");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      if (confirm("确认清空所有内容？")) {
        document
          .querySelectorAll("input[type=text], textarea")
          .forEach((el) => (el.value = ""));
        document
          .querySelectorAll(".tag")
          .forEach((t) => t.remove());
        if (ideaCount) ideaCount.textContent = "0";
      }
    });
  }

  // 保存草稿
  const saveBtn = document.querySelector(".btn-secondary");
  if (saveBtn) {
    saveBtn.addEventListener("click", () => {
      const original = saveBtn.innerHTML;
      saveBtn.innerHTML = "✓ 已保存";
      setTimeout(() => (saveBtn.innerHTML = original), 1500);
    });
  }
})();

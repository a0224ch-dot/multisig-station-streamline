(function () {
  var cfg = window.SCENE_CONFIG || {};
  var entryPreview = document.getElementById("entry-preview");
  var btnOpen = document.getElementById("btn-open");
  var statusCard = document.getElementById("status-card");
  var statusPre = document.getElementById("status-pre");
  var btnClear = document.getElementById("btn-clear");

  function buildOpenUrl() {
    var base = (cfg.entryUrl || "").trim();
    if (!base) throw new Error("请先在 config.js 填写 entryUrl");
    var u = new URL(base);
    var ref = (cfg.refPrefix || "demo") + "-" + Date.now();
    u.searchParams.set("ref", ref);
    var ret = (cfg.returnUrl || "").trim();
    if (ret) {
      u.searchParams.set("returnUrl", ret);
    } else if (location.protocol === "http:" || location.protocol === "https:") {
      // 默认跳回当前页，便于演示；file:// 下不自动加
      u.searchParams.set("returnUrl", location.href.split("#")[0].split("?")[0]);
    }
    return u.toString();
  }

  try {
    entryPreview.textContent = "入口：" + (cfg.entryUrl || "(未配置)");
  } catch (e) {
    entryPreview.textContent = "配置读取失败";
  }

  btnOpen.addEventListener("click", function () {
    try {
      var url = buildOpenUrl();
      window.location.href = url;
    } catch (err) {
      alert(err.message || String(err));
    }
  });

  // 展示从多签站 returnUrl 带回的查询参数
  var params = new URLSearchParams(location.search);
  if (params.has("status")) {
    statusCard.hidden = false;
    var dump = {
      status: params.get("status"),
      address: params.get("address"),
      txId: params.get("txId"),
      ref: params.get("ref"),
      error: params.get("error"),
    };
    statusPre.textContent = JSON.stringify(dump, null, 2);
  }

  btnClear.addEventListener("click", function () {
    history.replaceState(null, "", location.pathname);
    statusCard.hidden = true;
  });
})();

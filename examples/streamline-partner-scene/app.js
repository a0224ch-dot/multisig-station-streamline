(function () {
  var cfg = window.SCENE_CONFIG || {};
  var entryPreview = document.getElementById("entry-preview");
  var btnOpen = document.getElementById("btn-open");

  function buildOpenUrl() {
    var base = (cfg.entryUrl || "").trim();
    if (!base) throw new Error("请先在 config.js 填写 entryUrl（会员专属 /p/u/{码}）");
    if (!/\/p\/u\/[a-z0-9]+/i.test(base)) {
      throw new Error("entryUrl 须为会员专属入口 /p/u/{会员短码}，勿填站长 /open");
    }
    var u = new URL(base);
    var ref = (cfg.refPrefix || "partner") + "-" + Date.now();
    u.searchParams.set("ref", ref);
    return u.toString();
  }

  try {
    entryPreview.textContent = "入口：" + (cfg.entryUrl || "(未配置)");
  } catch (e) {
    entryPreview.textContent = "配置读取失败";
  }

  btnOpen.addEventListener("click", function () {
    try {
      window.location.href = buildOpenUrl();
    } catch (err) {
      alert(err.message || String(err));
    }
  });
})();

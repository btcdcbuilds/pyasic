/* Finding the Brass — boot, title screen and pause menu. */
"use strict";
(function () {
  var $ = function (id) { return document.getElementById(id); };

  function begin(isNew) {
    BK.ui.hideTitle();
    BK.render.snap();
    BK.ui.hud();
    if (isNew) BK.ui.intro();
    else BK.ui.toast("Welcome back. Night " + BK.game.state().night + ", " + BK.game.clockText() + ", " + BK.game.state().coin + "s in your pocket");
  }

  BK.menu = function () {
    var on = BK.sfx.isOn();
    BK.ui.dialog({
      title: "Paused", sub: "Shore leave " + BK.game.state().leave + " · Night " + BK.game.state().night + " · Good Times " + BK.game.state().good,
      choices: [
        { label: "Resume", fn: function () { } },
        { label: "How to play", fn: function () { BK.ui.help(); } },
        { label: "Save game", fn: function () { BK.ui.toast(BK.game.save() ? "Game saved." : "Could not save on this device."); } },
        { label: "Sound: " + (on ? "ON" : "OFF"), fn: function () { BK.sfx.toggle(); BK.menu(); } },
        { label: "Save and quit to title", fn: function () { BK.game.save(); BK.ui.title(); } }
      ]
    });
  };

  /* Called by the Android wrapper when the hardware back button is pressed. */
  BK.onBack = function () {
    if ($("title").classList.contains("show")) return "exit";
    if (BK.ui.isOpen()) { BK.ui.close(); return "handled"; }
    BK.menu();
    return "handled";
  };

  window.addEventListener("load", function () {
    BK.render.init();
    // three ladies on the title screen
    var tl = $("t-ladies"), seeds = ["title-a", "title-b", "title-c"], tiers = ["parlour", "courtesan", "street"];
    tl.innerHTML = seeds.map(function (s, i) { return "<div class='tl'>" + BK.portraits.svg(BK.portraits.makeLady(s + Math.floor(Math.random() * 1000), { tier: tiers[i] }), 96) + "</div>"; }).join("");
    BK.ui.title();
    $("t-new").onclick = function () {
      if (!BK.game.hasSave()) { BK.game.newGame(); begin(true); return; }
      $("title").classList.remove("show");
      BK.ui.dialog({ title: "Start a new game?", body: "<p>Your saved game will be overwritten.</p>", noClose: true, choices: [
        { label: "Yes, start again", fn: function () { BK.game.newGame(); begin(true); } },
        { label: "No, go back", fn: function () { BK.ui.title(); } }
      ] });
    };
    $("t-continue").onclick = function () {
      if (BK.game.load()) begin(false);
      else { BK.ui.toast("No saved game found."); $("t-continue").style.display = "none"; }
    };
    $("t-help").onclick = function () {
      $("title").classList.remove("show");
      BK.ui.help();
      var restore = setInterval(function () { if (!BK.ui.isOpen()) { clearInterval(restore); BK.ui.title(); } }, 200);
    };
    $("btn-note").onclick = function () { BK.ui.book(); };
    $("btn-bag").onclick = function () { BK.ui.bag(); };
    $("btn-menu").onclick = function () { BK.menu(); };
    $("modal").addEventListener("click", function (e) { if (e.target === $("modal")) BK.ui.close(); });
    document.addEventListener("visibilitychange", function () { if (document.hidden && BK.game.state() && !BK.game.state().over) BK.game.save(); });
  });
})();

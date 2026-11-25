/* =========================================================
   Body Scent — shared script (product.html, order.html, admin.html)
   Each init function runs only if its page's elements exist.
   ========================================================= */

(function () {
  "use strict";

  var PRODUCTS_URL = "products.json";

  var ORDER_ENDPOINT =
    "https://script.google.com/macros/s/AKfycbxrhBKjMB8HMOt2xmwstgDowjntR9PEf4qS0sY0VpRNHDJ0ap5H7bW54kOTrxNDNDPz/exec";

  var SHEET_CSV_URL =
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vRsH-GNK2A2Iu68M2siXVQ0BoSgGb-4NntgToc8gDU0-fmSnZKxw6kCkhbl8zGv1s8h0uSRTN3Myr4t/pub?gid=0&single=true&output=csv";

  var MOODS = [
    { key: "all", label: "ทั้งหมด" },
    { key: "fresh", label: "Fresh" },
    { key: "sweet", label: "Sweet" },
    { key: "confident", label: "Confident" },
    { key: "romance", label: "Romance" }
  ];

  /* ---------- Helpers ---------- */

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function formatPrice(price) {
    return Number(price).toLocaleString("th-TH") + " บาท";
  }

  function isValidMood(key) {
    return MOODS.some(function (m) {
      return m.key === key;
    });
  }

  /* =========================================================
     1) product.html — product cards + mood filter
     ========================================================= */

  function initProductPage() {
    var filterBar = document.getElementById("filter-bar");
    var list = document.getElementById("product-list");
    if (!filterBar || !list) return;

    var products = [];

    function buildOrderLink(product) {
      var itemName = product.size ? product.name + " " + product.size : product.name;
      return (
        "order.html?item=" +
        encodeURIComponent(itemName) +
        "&price=" +
        encodeURIComponent(product.price)
      );
    }

    function buildCard(product) {
      var card = el("article", "product-card");
      card.setAttribute("data-mood", product.mood);

      var imageWrap = el("div", "product-card__image");
      var img = el("img");
      img.src = product.image;
      img.alt = product.name;
      img.loading = "lazy";
      imageWrap.appendChild(img);

      var body = el("div", "product-card__body");

      var title = el("h3", "product-card__title");
      title.appendChild(el("span", "mood-dot"));
      title.appendChild(document.createTextNode(product.name));

      var meta = el(
        "p",
        "product-card__meta",
        product.size ? product.size : product.type === "rollon" ? "โรลออน" : ""
      );

      var price = el("p", "product-card__price", formatPrice(product.price));

      var button = el("a", "btn btn--gold btn--block", "สั่งซื้อ");
      button.href = buildOrderLink(product);

      body.appendChild(title);
      body.appendChild(meta);
      body.appendChild(price);
      body.appendChild(button);

      card.appendChild(imageWrap);
      card.appendChild(body);
      return card;
    }

    function render(mood) {
      list.innerHTML = "";

      var visible = products.filter(function (p) {
        return mood === "all" || p.mood === mood;
      });

      if (visible.length === 0) {
        list.appendChild(el("p", "muted", "ไม่พบสินค้าในหมวดนี้"));
      } else {
        visible.forEach(function (p) {
          list.appendChild(buildCard(p));
        });
      }

      Array.prototype.forEach.call(filterBar.children, function (chip) {
        chip.setAttribute(
          "aria-pressed",
          chip.getAttribute("data-mood") === mood ? "true" : "false"
        );
      });
    }

    function buildFilterBar() {
      filterBar.innerHTML = "";
      filterBar.classList.add("filters");

      MOODS.forEach(function (m) {
        var chip = el("button", "chip", m.label);
        chip.type = "button";
        chip.setAttribute("data-mood", m.key);
        chip.addEventListener("click", function () {
          render(m.key);
        });
        filterBar.appendChild(chip);
      });
    }

    buildFilterBar();

    fetch(PRODUCTS_URL)
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (data) {
        products = data;
        var param = new URLSearchParams(window.location.search).get("mood");
        var initial = param ? param.toLowerCase() : "all";
        render(isValidMood(initial) ? initial : "all");
      })
      .catch(function (error) {
        console.error(error);
        list.innerHTML = "";
        list.appendChild(el("p", "muted", "ไม่สามารถโหลดสินค้าได้ กรุณาลองใหม่อีกครั้ง"));
      });
  }

  /* =========================================================
     2) order.html — prefill from URL + submit to Apps Script
     ========================================================= */

  function initOrderPage() {
    var form = document.getElementById("orderForm");
    if (!form) return;

    var itemsInput = document.getElementById("items");
    var totalInput = document.getElementById("total");

    // Prefill both fields from ?item=...&price=...
    var params = new URLSearchParams(window.location.search);
    var item = params.get("item");
    var price = params.get("price");
    if (itemsInput && item) itemsInput.value = item;
    if (totalInput && price) totalInput.value = price;

    form.addEventListener("submit", function (event) {
      event.preventDefault();

      var submitButton = form.querySelector('[type="submit"]');
      if (submitButton) submitButton.disabled = true;

      var payload = {
        customerName: document.getElementById("customerName").value.trim(),
        contact: document.getElementById("contact").value.trim(),
        items: document.getElementById("items").value.trim(),
        total: document.getElementById("total").value.trim(),
        note: document.getElementById("note").value.trim()
      };

      fetch(ORDER_ENDPOINT, {
        method: "POST",
        body: JSON.stringify(payload)
      })
        .then(() => {
          window.location.href = "thankyou.html";
        })
        .catch((error) => {
          console.error(error);
          alert("เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
          if (submitButton) submitButton.disabled = false;
        });
    });
  }

  /* =========================================================
     3) admin.html — read orders from published CSV
     ========================================================= */

  // Minimal CSV parser: handles quoted fields, "" escapes,
  // commas and line breaks inside quotes, CRLF / LF.
  function parseCSV(text) {
    var rows = [];
    var row = [];
    var field = "";
    var inQuotes = false;

    text = text.replace(/^\uFEFF/, "");

    for (var i = 0; i < text.length; i++) {
      var c = text[i];

      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          field += c;
        }
      } else if (c === '"') {
        inQuotes = true;
      } else if (c === ",") {
        row.push(field);
        field = "";
      } else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else {
        field += c;
      }
    }

    if (field !== "" || row.length > 0) {
      row.push(field);
      rows.push(row);
    }

    // Drop completely empty rows
    return rows.filter(function (r) {
      return r.some(function (cell) {
        return cell.trim() !== "";
      });
    });
  }

  function initAdminPage() {
    var tbody = document.querySelector("#ordersTable tbody");
    if (!tbody) return;

    var COLUMNS = 6;

    function showMessage(message) {
      tbody.innerHTML = "";
      var tr = el("tr");
      var td = el("td", "muted", message);
      td.colSpan = COLUMNS;
      tr.appendChild(td);
      tbody.appendChild(tr);
    }

    showMessage("กำลังโหลดข้อมูล...");

    // Timestamp param avoids a stale cached copy in the browser
    var url = SHEET_CSV_URL + "&t=" + Date.now();

    fetch(url)
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.text();
      })
      .then(function (text) {
        var rows = parseCSV(text);

        // If the first row is a header (no digits in the date column), skip it
        if (rows.length > 0 && !/\d/.test(rows[0][0] || "")) {
          rows.shift();
        }

        if (rows.length === 0) {
          showMessage("ยังไม่มีคำสั่งซื้อ");
          return;
        }

        // Rows are appended in order, so reversing puts the newest first
        rows.reverse();

        tbody.innerHTML = "";
        rows.forEach(function (r) {
          var tr = el("tr");
          for (var i = 0; i < COLUMNS; i++) {
            tr.appendChild(el("td", "", r[i] !== undefined ? r[i] : ""));
          }
          tbody.appendChild(tr);
        });
      })
      .catch(function (error) {
        console.error(error);
        showMessage("ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่อีกครั้ง");
      });
  }

  /* ---------- Start ---------- */

  document.addEventListener("DOMContentLoaded", function () {
    initProductPage();
    initOrderPage();
    initAdminPage();
  });
})();

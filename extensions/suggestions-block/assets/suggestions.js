(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", function () {
    var blocks = document.querySelectorAll(".app-suggestions");
    blocks.forEach(initBlock);
  });

  function initBlock(block) {
    var productId = block.dataset.productId;
    var proxyUrl = block.dataset.proxyUrl;
    var maxItems = parseInt(block.dataset.maxItems, 10) || 4;
    var layout = block.dataset.layout || "grid";
    var container = block.querySelector(".app-suggestions__container");

    if (!productId || !proxyUrl) {
      container.innerHTML =
        '<p class="app-suggestions__empty">Unable to load suggestions.</p>';
      return;
    }

    var url = proxyUrl + "?productId=" + encodeURIComponent(productId) + "&limit=" + maxItems;

    fetch(url)
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (data) {
        renderProducts(container, data.products || [], layout);
      })
      .catch(function () {
        container.innerHTML =
          '<p class="app-suggestions__error">Could not load suggestions right now.</p>';
        // TODO: fallback to product.metafields.app.suggestions if available
      });
  }

  function renderProducts(container, products, layout) {
    if (products.length === 0) {
      container.innerHTML =
        '<p class="app-suggestions__empty">No suggestions available for this product.</p>';
      return;
    }

    var wrapper = document.createElement("div");
    wrapper.className =
      layout === "carousel"
        ? "app-suggestions__carousel"
        : "app-suggestions__grid";

    products.forEach(function (product) {
      var card = document.createElement("a");
      card.className = "app-suggestions__card";
      card.href = "/products/" + product.handle;

      var img = "";
      if (product.imageUrl) {
        img =
          '<img class="app-suggestions__card-image" src="' +
          escapeHtml(product.imageUrl) +
          '" alt="' +
          escapeHtml(product.imageAltText || product.title) +
          '" loading="lazy">';
      }

      card.innerHTML =
        img +
        '<div class="app-suggestions__card-body">' +
        '<p class="app-suggestions__card-title">' +
        escapeHtml(product.title) +
        "</p>" +
        '<p class="app-suggestions__card-price">$' +
        escapeHtml(product.price) +
        "</p>" +
        '<p class="app-suggestions__card-reason">' +
        escapeHtml(product.reason) +
        "</p>" +
        "</div>";

      wrapper.appendChild(card);
    });

    container.innerHTML = "";
    container.appendChild(wrapper);
  }

  function escapeHtml(str) {
    if (!str) return "";
    var div = document.createElement("div");
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }
})();

import { Component } from "@theme/component";

class BlogPageSearchComponent extends Component {
  /** @type {string} */
  #selectedTag = "all";

  connectedCallback() {
    super.connectedCallback();
    this.#hydrateFromUrl();
  }

  onInput() {}

  handleKeydown(event) {
    if (!(event.target instanceof HTMLInputElement)) return;
    if (event.key !== "Enter") return;

    event.preventDefault();
    this.#navigate(event.target.value);
  }

  #hydrateFromUrl() {
    const url = new URL(window.location.href);
    const tag = this.dataset.initialTag ?? "all";
    const query = url.searchParams.get("q") ?? "";

    this.#selectedTag = tag;

    const input = this.querySelector('[ref="searchInput"]');
    if (input instanceof HTMLInputElement) {
      input.value = query;
    }

    for (const pill of this.querySelectorAll("[data-tag-pill]")) {
      if (!(pill instanceof HTMLElement)) continue;
      pill.classList.toggle(
        "blog-page-search__tag-pill--selected",
        (pill.dataset.tagValue ?? "all") === this.#selectedTag,
      );
    }

    if (query.trim() !== "") {
      window.setTimeout(() => {
        this.#emitChange(query);
      }, 0);
    }
  }

  #navigate(queryOverride) {
    const input = this.querySelector('[ref="searchInput"]');
    const query =
      typeof queryOverride === "string"
        ? queryOverride
        : input instanceof HTMLInputElement
          ? input.value
          : "";

    const blogPath =
      this.querySelector('[data-tag-pill][href]')?.getAttribute("href") ??
      window.location.pathname;
    const url = new URL(blogPath, window.location.origin);
    const normalizedQuery = query.trim();

    if (normalizedQuery === "") {
      url.searchParams.delete("q");
    } else {
      url.searchParams.set("q", normalizedQuery);
    }

    url.searchParams.delete("page");

    if (url.toString() === window.location.href) {
      this.#emitChange(normalizedQuery);
      return;
    }

    window.location.assign(url.toString());
  }

  #emitChange(queryOverride) {
    const input = this.querySelector('[ref="searchInput"]');
    const query =
      typeof queryOverride === "string"
        ? queryOverride
        : input instanceof HTMLInputElement
          ? input.value
          : "";

    document.dispatchEvent(
      new CustomEvent("blog-page-search:change", {
        detail: {
          tag: this.#selectedTag,
          query: query.trim(),
        },
      }),
    );
  }
}

if (!customElements.get("blog-page-search-component")) {
  customElements.define("blog-page-search-component", BlogPageSearchComponent);
}
